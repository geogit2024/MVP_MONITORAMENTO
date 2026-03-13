from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

import ee
from fastapi import HTTPException, status
from shapely.geometry import mapping, shape
from shapely.ops import unary_union


S2_COLLECTION = "COPERNICUS/S2_SR_HARMONIZED"
S2_BANDS = ["B2", "B3", "B4", "B8", "B11", "B12"]
MAX_AOI_HA = 10000.0
CACHE_TTL_SECONDS = 30 * 60


DEFAULT_CLASSES = [
    {"id": 1, "name": "Agricultura", "color": "#f4d03f"},
    {"id": 2, "name": "Pastagem", "color": "#9bd770"},
    {"id": 3, "name": "Vegetacao Nativa", "color": "#1f7a3e"},
    {"id": 4, "name": "Solo Exposto", "color": "#8d5524"},
    {"id": 5, "name": "Agua", "color": "#2e86de"},
    {"id": 6, "name": "Area Urbana", "color": "#7f8c8d"},
]

DEFAULT_LANDUSE_3D_HEIGHTS = {
    "vegetacao": 15.0,
    "agricultura": 10.0,
    "pastagem": 10.0,
    "urbana": 25.0,
    "solo": 5.0,
    "agua": 2.0,
    "degradada": 8.0,
}


@dataclass
class LandCoverRun:
    classification_id: str
    tile_url: str
    legend: List[Dict[str, Any]]
    class_stats: List[Dict[str, Any]]
    download_url: str
    created_at: float
    aoi_geojson: Dict[str, Any]
    date_start: str
    date_end: str
    satellite: str
    classes: List[Dict[str, Any]]
    composite_image: ee.Image
    classified_image: ee.Image


@dataclass
class LandCoverVectorizeRun:
    vectorization_id: str
    feature_collection: Dict[str, Any]
    summary: Dict[str, Any]
    metadata: Dict[str, Any]
    params_used: Dict[str, Any]
    created_at: float
    aoi_geojson: Dict[str, Any]
    date_start: str
    date_end: str
    satellite: str
    indices: List[str]


@dataclass
class LandCoverPolygonClassifyResult:
    classification_run: LandCoverRun
    polygons: Dict[str, Any]
    summary: Dict[str, Any]
    metadata: Dict[str, Any]


_landcover_cache: Dict[str, LandCoverRun] = {}
_landcover_vector_cache: Dict[str, LandCoverVectorizeRun] = {}


def _purge_cache() -> None:
    now = time.time()
    expired = [k for k, v in _landcover_cache.items() if now - v.created_at > CACHE_TTL_SECONDS]
    for key in expired:
        _landcover_cache.pop(key, None)
    vector_expired = [k for k, v in _landcover_vector_cache.items() if now - v.created_at > CACHE_TTL_SECONDS]
    for key in vector_expired:
        _landcover_vector_cache.pop(key, None)


def _cache_key(payload: Dict[str, Any]) -> str:
    serialized = json.dumps(payload, ensure_ascii=True, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(serialized.encode("utf-8")).hexdigest()


def _mask_s2_clouds(image: ee.Image) -> ee.Image:
    # Prioriza QA60 e combina com SCL para maior robustez no S2 harmonizado.
    qa = image.select("QA60")
    cloud_bit = 1 << 10
    cirrus_bit = 1 << 11
    qa_mask = qa.bitwiseAnd(cloud_bit).eq(0).And(qa.bitwiseAnd(cirrus_bit).eq(0))

    scl = image.select("SCL")
    # Remove nuvem, sombra de nuvem e cirrus: 3, 8, 9, 10
    scl_mask = scl.neq(3).And(scl.neq(8)).And(scl.neq(9)).And(scl.neq(10))

    mask = qa_mask.And(scl_mask)
    return image.updateMask(mask).copyProperties(image, ["system:time_start"])


def _validate_aoi_area_ha(aoi_geojson: Dict[str, Any]) -> float:
    area_ha = shape(aoi_geojson).area * 111_320 * 111_320 / 10000.0
    # Heuristica em graus para evitar AOIs muito grandes antes de processar no EE.
    if area_ha > MAX_AOI_HA:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"AOI excede limite maximo de {MAX_AOI_HA:.0f} ha.",
        )
    return area_ha


def _build_classes(user_classes: Optional[List[Dict[str, Any]]]) -> List[Dict[str, Any]]:
    classes = user_classes if user_classes else DEFAULT_CLASSES
    normalized: List[Dict[str, Any]] = []
    ids = set()
    for item in classes:
        class_id = int(item["id"])
        if class_id in ids:
            raise HTTPException(status_code=400, detail="IDs de classes duplicados.")
        ids.add(class_id)
        normalized.append(
            {
                "id": class_id,
                "name": str(item["name"]).strip() or f"Classe {class_id}",
                "color": str(item.get("color", "#999999")),
            }
        )
    if not normalized:
        raise HTTPException(status_code=400, detail="Lista de classes vazia.")
    return sorted(normalized, key=lambda c: c["id"])


def _normalize_training_samples(
    training_fc: Dict[str, Any],
    classes: List[Dict[str, Any]],
) -> Dict[str, Any]:
    if training_fc.get("type") != "FeatureCollection":
        raise HTTPException(status_code=400, detail="training_samples deve ser FeatureCollection.")
    features = training_fc.get("features") or []
    if not features:
        raise HTTPException(status_code=400, detail="Nenhuma amostra de treinamento enviada.")

    class_name_to_id = {c["name"].lower(): c["id"] for c in classes}
    valid_ids = {c["id"] for c in classes}
    normalized = []
    for feature in features:
        props = feature.get("properties") or {}
        class_id = props.get("class_id")
        if class_id is None:
            class_name = str(props.get("class", "")).strip().lower()
            class_id = class_name_to_id.get(class_name)
        if class_id is None:
            raise HTTPException(status_code=400, detail="Amostra sem class_id/class valido.")
        class_id = int(class_id)
        if class_id not in valid_ids:
            raise HTTPException(status_code=400, detail=f"class_id {class_id} nao existe nas classes.")

        normalized.append(
            {
                "type": "Feature",
                "geometry": feature.get("geometry"),
                "properties": {"class_id": class_id},
            }
        )

    return {"type": "FeatureCollection", "features": normalized}


def _build_sentinel_composite(aoi: ee.Geometry, date_start: date, date_end: date) -> ee.Image:
    collection = (
        ee.ImageCollection(S2_COLLECTION)
        .filterBounds(aoi)
        .filterDate(str(date_start), str(date_end))
        .map(_mask_s2_clouds)
    )
    count = collection.size().getInfo()
    if count == 0:
        raise HTTPException(status_code=404, detail="Nenhuma imagem Sentinel-2 encontrada no periodo.")
    return collection.median().select(S2_BANDS).clip(aoi)


def _build_landcover_feature_stack(composite: ee.Image) -> ee.Image:
    ndvi = composite.normalizedDifference(["B8", "B4"]).rename("NDVI")
    ndwi = composite.normalizedDifference(["B3", "B8"]).rename("NDWI")
    ndbi = composite.normalizedDifference(["B11", "B8"]).rename("NDBI")
    savi = composite.expression(
        "((nir - red) / (nir + red + 0.5)) * 1.5",
        {"nir": composite.select("B8"), "red": composite.select("B4")},
    ).rename("SAVI")
    return (
        composite.addBands(ndvi, overwrite=True)
        .addBands(ndwi, overwrite=True)
        .addBands(ndbi, overwrite=True)
        .addBands(savi, overwrite=True)
    )


def _safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except Exception:
        return default


def _geometry_area_ha(geometry_geojson: Dict[str, Any]) -> float:
    # Heuristica em graus para manter compatibilidade com o restante do modulo.
    return float(shape(geometry_geojson).area * 111_320 * 111_320 / 10000.0)


def _normalize_segment_indices(indices: Optional[List[str]]) -> List[str]:
    allowed = {"B2", "B3", "B4", "B8", "B11", "B12", "NDVI", "NDWI", "NDBI", "SAVI"}
    if not indices:
        return ["B2", "B3", "B4", "B8", "NDVI", "NDWI", "NDBI", "SAVI"]
    normalized: List[str] = []
    for band in indices:
        band_name = str(band or "").strip().upper()
        if band_name in allowed and band_name not in normalized:
            normalized.append(band_name)
    if not normalized:
        return ["B2", "B3", "B4", "B8", "NDVI", "NDWI", "NDBI", "SAVI"]
    return normalized


def _build_grid_segment_image(segment_size_m: int) -> ee.Image:
    # Fallback deterministico em grade quando SNIC nao estiver disponivel.
    lon_lat = ee.Image.pixelLonLat()
    meters_per_degree = 111_320.0
    cell = float(max(5, segment_size_m))
    lon_id = lon_lat.select("longitude").multiply(meters_per_degree / cell).floor().toInt64()
    lat_id = lon_lat.select("latitude").multiply(meters_per_degree / cell).floor().toInt64()
    return lon_id.multiply(1_000_000_000).add(lat_id).rename("segment_id").toInt64()


def _segment_to_vectors(
    *,
    segment_image: ee.Image,
    aoi: ee.Geometry,
    scale: int,
    min_area_ha: float,
    simplify_meters: float,
    max_segments: int,
) -> ee.FeatureCollection:
    vectors = segment_image.rename("segment_id").reduceToVectors(
        reducer=ee.Reducer.countEvery(),
        geometry=aoi,
        scale=max(5, int(scale)),
        geometryType="polygon",
        eightConnected=False,
        labelProperty="segment_id",
        maxPixels=1e13,
        bestEffort=True,
    )
    vectors = vectors.map(
        lambda feat: feat.set(
            {
                "area_ha": ee.Number(feat.geometry().area(1)).divide(10000),
            }
        )
    )
    if min_area_ha > 0:
        vectors = vectors.filter(ee.Filter.gte("area_ha", float(min_area_ha)))
    if simplify_meters > 0:
        vectors = vectors.map(
            lambda feat: feat.setGeometry(feat.geometry().simplify(maxError=float(simplify_meters)))
        )
    if max_segments > 0:
        vectors = vectors.limit(int(max_segments))
    return vectors


def _class_hint_from_indices(*, ndvi: float, ndwi: float, ndbi: float, savi: float) -> str:
    if ndwi > 0.2:
        return "Agua"
    if ndbi > 0.18:
        return "Area Urbana"
    if ndvi >= 0.62 or savi >= 0.58:
        return "Vegetacao Nativa"
    if ndvi >= 0.45:
        return "Pastagem"
    if ndvi >= 0.22:
        return "Agricultura"
    return "Solo Exposto"


def _pick_class_for_polygon(
    *,
    ndvi: float,
    ndwi: float,
    ndbi: float,
    savi: float,
    classes: List[Dict[str, Any]],
) -> Dict[str, Any]:
    by_id = {int(c["id"]): c for c in classes}

    def by_name_token(token: str) -> Optional[Dict[str, Any]]:
        for item in classes:
            if token in str(item.get("name", "")).lower():
                return item
        return None

    if ndwi > 0.2:
        return by_name_token("agua") or by_id.get(5) or classes[0]
    if ndbi > 0.18:
        return by_name_token("urb") or by_id.get(6) or classes[0]
    if ndvi >= 0.62 or savi >= 0.58:
        return by_name_token("veget") or by_id.get(3) or classes[0]
    if ndvi >= 0.45:
        return by_name_token("past") or by_id.get(2) or classes[0]
    if ndvi >= 0.22:
        return by_name_token("agric") or by_id.get(1) or classes[0]
    return by_name_token("solo") or by_id.get(4) or classes[0]


def _filtered_polygons_by_status(
    polygons_fc: Dict[str, Any],
    accepted_statuses: List[str],
) -> Dict[str, Any]:
    accepted = {str(item).strip().lower() for item in accepted_statuses if str(item).strip()}
    features = polygons_fc.get("features") or []
    filtered: List[Dict[str, Any]] = []
    for index, feature in enumerate(features, start=1):
        props = feature.get("properties") or {}
        status_name = str(props.get("status", "suggested")).strip().lower()
        if accepted and status_name not in accepted:
            continue

        geometry = feature.get("geometry")
        if not geometry:
            continue

        try:
            geom = shape(geometry)
            if not geom.is_valid:
                geom = geom.buffer(0)
            if geom.is_empty:
                continue
            fixed_geometry = mapping(geom)
        except Exception:
            continue

        polygon_id = str(props.get("polygon_id") or f"poly-{index:05d}")
        filtered.append(
            {
                "type": "Feature",
                "geometry": fixed_geometry,
                "properties": {
                    **props,
                    "polygon_id": polygon_id,
                    "status": status_name,
                },
            }
        )

    if not filtered:
        raise HTTPException(
            status_code=400,
            detail="Nenhum poligono valido encontrado para classificacao com os status selecionados.",
        )
    return {"type": "FeatureCollection", "features": filtered}


def _derive_aoi_from_feature_collection(polygons_fc: Dict[str, Any]) -> Dict[str, Any]:
    features = polygons_fc.get("features") or []
    geometries = []
    for feature in features:
        geometry = feature.get("geometry")
        if not geometry:
            continue
        try:
            geom = shape(geometry)
            if not geom.is_valid:
                geom = geom.buffer(0)
            if geom.is_empty:
                continue
            geometries.append(geom)
        except Exception:
            continue

    if not geometries:
        raise HTTPException(status_code=400, detail="Nao foi possivel derivar AOI dos poligonos.")

    union_geom = unary_union(geometries)
    if union_geom.is_empty:
        raise HTTPException(status_code=400, detail="AOI derivada dos poligonos ficou vazia.")
    return mapping(union_geom)


def vectorize_landcover_segments(
    *,
    aoi_geojson: Dict[str, Any],
    date_start: date,
    date_end: date,
    satellite: str,
    indices_input: Optional[List[str]] = None,
    segment_size: int = 20,
    compactness: float = 1.5,
    connectivity: int = 8,
    min_area_ha: float = 0.05,
    simplify_meters: float = 5.0,
    max_segments: int = 1200,
) -> LandCoverVectorizeRun:
    if satellite.lower() != "sentinel2":
        raise HTTPException(status_code=400, detail="Apenas satellite='sentinel2' suportado neste modulo.")
    if date_start >= date_end:
        raise HTTPException(status_code=400, detail="date_start deve ser menor que date_end.")

    _validate_aoi_area_ha(aoi_geojson)
    indices = _normalize_segment_indices(indices_input)
    params_used = {
        "segment_size": int(max(5, segment_size)),
        "compactness": float(max(0.1, compactness)),
        "connectivity": int(8 if connectivity >= 8 else 4),
        "min_area_ha": float(max(0.0, min_area_ha)),
        "simplify_meters": float(max(0.0, simplify_meters)),
        "max_segments": int(max(50, max_segments)),
        "indices": indices,
    }

    request_signature = {
        "aoi": aoi_geojson,
        "date_start": str(date_start),
        "date_end": str(date_end),
        "satellite": satellite,
        "mode": "advanced_ai",
        **params_used,
    }
    vectorization_id = _cache_key(request_signature)

    _purge_cache()
    cached = _landcover_vector_cache.get(vectorization_id)
    if cached:
        return cached

    aoi = ee.Geometry(aoi_geojson)
    composite = _build_sentinel_composite(aoi, date_start, date_end)
    feature_stack = _build_landcover_feature_stack(composite).clip(aoi)
    image_for_segmentation = feature_stack.select(indices).toFloat()

    def build_vectors_from_segments(segment_band: ee.Image) -> Dict[str, Any]:
        vectors = _segment_to_vectors(
            segment_image=segment_band,
            aoi=aoi,
            scale=10,
            min_area_ha=params_used["min_area_ha"],
            simplify_meters=params_used["simplify_meters"],
            max_segments=params_used["max_segments"],
        )
        reduced = feature_stack.select(["NDVI", "NDWI", "NDBI", "SAVI", "B2", "B3", "B4", "B8", "B11"]).reduceRegions(
            collection=vectors,
            reducer=ee.Reducer.mean(),
            scale=10,
            tileScale=2,
        )
        return reduced.getInfo() or {"type": "FeatureCollection", "features": []}

    segmentation_method = "SNIC"
    try:
        snic = ee.Algorithms.Image.Segmentation.SNIC(
            image=image_for_segmentation,
            size=params_used["segment_size"],
            compactness=params_used["compactness"],
            connectivity=params_used["connectivity"],
            neighborhoodSize=max(8, params_used["segment_size"] * 2),
            seeds=ee.Algorithms.Image.Segmentation.seedGrid(params_used["segment_size"]),
        )
        raw_geojson = build_vectors_from_segments(snic.select("clusters").rename("segment_id"))
    except Exception:
        segmentation_method = "GRID_FALLBACK"
        raw_geojson = build_vectors_from_segments(_build_grid_segment_image(params_used["segment_size"]))

    features = raw_geojson.get("features") or []
    cleaned_features: List[Dict[str, Any]] = []
    areas: List[float] = []
    total_area_ha = 0.0

    for idx, feature in enumerate(features, start=1):
        geometry = feature.get("geometry")
        if not geometry:
            continue
        try:
            geom = shape(geometry)
            if not geom.is_valid:
                geom = geom.buffer(0)
            if geom.is_empty:
                continue
            fixed_geometry = mapping(geom)
        except Exception:
            continue

        props = feature.get("properties") or {}
        area_ha = _safe_float(props.get("area_ha"), _geometry_area_ha(fixed_geometry))
        if area_ha < params_used["min_area_ha"]:
            continue

        ndvi = _safe_float(props.get("NDVI"))
        ndwi = _safe_float(props.get("NDWI"))
        ndbi = _safe_float(props.get("NDBI"))
        savi = _safe_float(props.get("SAVI"))
        spread = max(abs(ndvi - ndwi), abs(ndvi - savi), abs(ndbi))
        homogeneity_score = max(0.0, min(1.0, 1.0 - spread))
        polygon_id = f"{vectorization_id[:12]}-{idx:05d}"

        cleaned_features.append(
            {
                "type": "Feature",
                "geometry": fixed_geometry,
                "properties": {
                    **props,
                    "polygon_id": polygon_id,
                    "status": "suggested",
                    "area_ha": round(area_ha, 4),
                    "ndvi_mean": round(ndvi, 4),
                    "ndwi_mean": round(ndwi, 4),
                    "ndbi_mean": round(ndbi, 4),
                    "savi_mean": round(savi, 4),
                    "homogeneity_score": round(homogeneity_score, 4),
                    "class_hint": _class_hint_from_indices(ndvi=ndvi, ndwi=ndwi, ndbi=ndbi, savi=savi),
                    "source_date_start": str(date_start),
                    "source_date_end": str(date_end),
                    "segmentation_method": segmentation_method,
                },
            }
        )
        areas.append(area_ha)
        total_area_ha += area_ha

    summary = {
        "total_polygons": len(cleaned_features),
        "total_area_ha": round(total_area_ha, 4),
        "min_area_ha": round(min(areas), 4) if areas else 0.0,
        "max_area_ha": round(max(areas), 4) if areas else 0.0,
    }
    metadata = {
        "vectorization_id": vectorization_id,
        "segmentation_method": segmentation_method,
        "features_count": len(cleaned_features),
        "truncated": bool(
            params_used["max_segments"] > 0 and len(cleaned_features) >= int(params_used["max_segments"])
        ),
    }
    feature_collection = {"type": "FeatureCollection", "features": cleaned_features}

    run = LandCoverVectorizeRun(
        vectorization_id=vectorization_id,
        feature_collection=feature_collection,
        summary=summary,
        metadata=metadata,
        params_used=params_used,
        created_at=time.time(),
        aoi_geojson=aoi_geojson,
        date_start=str(date_start),
        date_end=str(date_end),
        satellite=satellite,
        indices=indices,
    )
    _landcover_vector_cache[vectorization_id] = run
    return run


def classify_landcover_polygons(
    *,
    polygons_fc: Dict[str, Any],
    date_start: date,
    date_end: date,
    satellite: str,
    classes_input: Optional[List[Dict[str, Any]]] = None,
    only_statuses: Optional[List[str]] = None,
    aoi_geojson: Optional[Dict[str, Any]] = None,
    vectorization_id: Optional[str] = None,
    persist: bool = False,
) -> LandCoverPolygonClassifyResult:
    if satellite.lower() != "sentinel2":
        raise HTTPException(status_code=400, detail="Apenas satellite='sentinel2' suportado neste modulo.")
    if date_start >= date_end:
        raise HTTPException(status_code=400, detail="date_start deve ser menor que date_end.")

    statuses = only_statuses if only_statuses else ["approved", "edited"]
    filtered_fc = _filtered_polygons_by_status(polygons_fc, statuses)
    effective_aoi = aoi_geojson or _derive_aoi_from_feature_collection(filtered_fc)
    _validate_aoi_area_ha(effective_aoi)

    classes = _build_classes(classes_input)
    aoi = ee.Geometry(effective_aoi)
    composite = _build_sentinel_composite(aoi, date_start, date_end)
    feature_stack = _build_landcover_feature_stack(composite).clip(aoi)

    reduced = feature_stack.select(["NDVI", "NDWI", "NDBI", "SAVI", "B2", "B3", "B4", "B8", "B11"]).reduceRegions(
        collection=ee.FeatureCollection(filtered_fc),
        reducer=ee.Reducer.mean(),
        scale=10,
        tileScale=2,
    )
    reduced_geojson = reduced.getInfo() or {"type": "FeatureCollection", "features": []}
    features = reduced_geojson.get("features") or []
    if not features:
        raise HTTPException(status_code=400, detail="A classificacao por poligono nao retornou feicoes.")

    class_stats_map: Dict[int, float] = {}
    classified_features: List[Dict[str, Any]] = []
    for idx, feature in enumerate(features, start=1):
        geometry = feature.get("geometry")
        if not geometry:
            continue
        props = feature.get("properties") or {}
        ndvi = _safe_float(props.get("NDVI"))
        ndwi = _safe_float(props.get("NDWI"))
        ndbi = _safe_float(props.get("NDBI"))
        savi = _safe_float(props.get("SAVI"))

        class_info = _pick_class_for_polygon(
            ndvi=ndvi,
            ndwi=ndwi,
            ndbi=ndbi,
            savi=savi,
            classes=classes,
        )
        class_id = int(class_info["id"])
        class_name = str(class_info["name"])
        color = str(class_info["color"])

        area_ha = _safe_float(props.get("area_ha"), _geometry_area_ha(geometry))
        class_stats_map[class_id] = class_stats_map.get(class_id, 0.0) + area_ha
        polygon_id = str(props.get("polygon_id") or f"poly-{idx:05d}")
        status_name = str(props.get("status") or "approved").lower()
        if status_name == "suggested":
            status_name = "approved"

        classified_features.append(
            {
                "type": "Feature",
                "geometry": geometry,
                "properties": {
                    **props,
                    "polygon_id": polygon_id,
                    "status": status_name,
                    "class_id": class_id,
                    "class_name": class_name,
                    "color": color,
                    "area_ha": round(area_ha, 4),
                    "ndvi_mean": round(ndvi, 4),
                    "ndwi_mean": round(ndwi, 4),
                    "ndbi_mean": round(ndbi, 4),
                    "savi_mean": round(savi, 4),
                    "source_date_start": str(date_start),
                    "source_date_end": str(date_end),
                },
            }
        )

    if not classified_features:
        raise HTTPException(status_code=400, detail="Nenhum poligono classificado foi gerado.")

    classified_fc = {"type": "FeatureCollection", "features": classified_features}
    class_image = ee.Image().byte().paint(ee.FeatureCollection(classified_fc), "class_id").clip(aoi)

    palette = [c["color"].replace("#", "") for c in classes]
    min_class = min(c["id"] for c in classes)
    max_class = max(c["id"] for c in classes)
    map_id = class_image.visualize(min=min_class, max=max_class, palette=palette).getMapId()
    tile_url = map_id["tile_fetcher"].url_format
    download_url = class_image.toInt16().getDownloadURL(
        {
            "scale": 10,
            "crs": "EPSG:4326",
            "region": effective_aoi,
            "format": "GEO_TIFF",
        }
    )

    class_stats: List[Dict[str, Any]] = []
    for cls in classes:
        class_id = int(cls["id"])
        class_stats.append(
            {
                "class_id": class_id,
                "class": cls["name"],
                "area_ha": round(float(class_stats_map.get(class_id, 0.0)), 4),
                "color": cls["color"],
            }
        )
    legend = [{"class_id": c["id"], "class": c["name"], "color": c["color"]} for c in classes]

    request_signature = {
        "mode": "polygon_classification",
        "vectorization_id": vectorization_id,
        "date_start": str(date_start),
        "date_end": str(date_end),
        "satellite": satellite,
        "statuses": statuses,
        "classes": classes,
        "polygons": classified_fc,
    }
    classification_id = _cache_key(request_signature)
    run = LandCoverRun(
        classification_id=classification_id,
        tile_url=tile_url,
        legend=legend,
        class_stats=class_stats,
        download_url=download_url,
        created_at=time.time(),
        aoi_geojson=effective_aoi,
        date_start=str(date_start),
        date_end=str(date_end),
        satellite=satellite,
        classes=classes,
        composite_image=composite,
        classified_image=class_image.rename("landcover"),
    )
    _landcover_cache[classification_id] = run

    total_area_ha = sum(item["area_ha"] for item in class_stats)
    summary = {
        "total_polygons": len(classified_features),
        "total_area_ha": round(total_area_ha, 4),
        "included_statuses": [str(status_name).lower() for status_name in statuses],
    }
    metadata = {
        "vectorization_id": vectorization_id,
        "persist_requested": bool(persist),
        "persisted": False,
        "persist_note": "Persistencia PostGIS nao habilitada neste modulo.",
    }
    return LandCoverPolygonClassifyResult(
        classification_run=run,
        polygons=classified_fc,
        summary=summary,
        metadata=metadata,
    )


def _calculate_stats(
    classified: ee.Image,
    aoi: ee.Geometry,
    classes: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    grouped = (
        ee.Image.pixelArea()
        .addBands(classified.rename("class_id"))
        .reduceRegion(
            reducer=ee.Reducer.sum().group(groupField=1, groupName="class_id"),
            geometry=aoi,
            scale=10,
            maxPixels=1e13,
            bestEffort=True,
        )
        .get("groups")
    )
    grouped_info = grouped.getInfo() if grouped else []
    area_by_class = {int(g["class_id"]): float(g["sum"]) / 10000.0 for g in grouped_info}

    stats: List[Dict[str, Any]] = []
    for cls in classes:
        area_ha = float(area_by_class.get(cls["id"], 0.0))
        stats.append(
            {
                "class_id": cls["id"],
                "class": cls["name"],
                "area_ha": round(area_ha, 4),
                "color": cls["color"],
            }
        )
    return stats


def classify_landcover(
    *,
    aoi_geojson: Dict[str, Any],
    training_samples_fc: Dict[str, Any],
    date_start: date,
    date_end: date,
    satellite: str,
    classes_input: Optional[List[Dict[str, Any]]] = None,
) -> LandCoverRun:
    if satellite.lower() != "sentinel2":
        raise HTTPException(status_code=400, detail="Apenas satellite='sentinel2' suportado neste modulo.")
    if date_start >= date_end:
        raise HTTPException(status_code=400, detail="date_start deve ser menor que date_end.")

    _validate_aoi_area_ha(aoi_geojson)
    classes = _build_classes(classes_input)
    normalized_samples = _normalize_training_samples(training_samples_fc, classes)

    request_signature = {
        "aoi": aoi_geojson,
        "training_samples": normalized_samples,
        "date_start": str(date_start),
        "date_end": str(date_end),
        "satellite": satellite,
        "classes": classes,
    }
    classification_id = _cache_key(request_signature)

    _purge_cache()
    cached = _landcover_cache.get(classification_id)
    if cached:
        return cached

    aoi = ee.Geometry(aoi_geojson)
    composite = _build_sentinel_composite(aoi, date_start, date_end)
    training_fc = ee.FeatureCollection(normalized_samples)

    sampled = composite.sampleRegions(
        collection=training_fc,
        properties=["class_id"],
        scale=10,
        geometries=False,
    )

    sample_count = sampled.size().getInfo()
    if sample_count < 6:
        raise HTTPException(
            status_code=400,
            detail="Amostras insuficientes. Forneca pelo menos 6 amostras distribuidas entre as classes.",
        )

    classifier = ee.Classifier.smileRandomForest(numberOfTrees=120, seed=42).train(
        features=sampled,
        classProperty="class_id",
        inputProperties=S2_BANDS,
    )
    classified = composite.classify(classifier).rename("landcover").clip(aoi)

    palette = [c["color"].replace("#", "") for c in classes]
    min_class = min(c["id"] for c in classes)
    max_class = max(c["id"] for c in classes)

    map_id = classified.visualize(min=min_class, max=max_class, palette=palette).getMapId()
    tile_url = map_id["tile_fetcher"].url_format

    class_stats = _calculate_stats(classified, aoi, classes)
    legend = [{"class_id": c["id"], "class": c["name"], "color": c["color"]} for c in classes]

    download_url = classified.toInt16().getDownloadURL(
        {
            "scale": 10,
            "crs": "EPSG:4326",
            "region": aoi_geojson,
            "format": "GEO_TIFF",
        }
    )

    run = LandCoverRun(
        classification_id=classification_id,
        tile_url=tile_url,
        legend=legend,
        class_stats=class_stats,
        download_url=download_url,
        created_at=time.time(),
        aoi_geojson=aoi_geojson,
        date_start=str(date_start),
        date_end=str(date_end),
        satellite=satellite,
        classes=classes,
        composite_image=composite,
        classified_image=classified,
    )
    _landcover_cache[classification_id] = run
    return run


def get_cached_stats(classification_id: str) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], Optional[str]]:
    _purge_cache()
    run = _landcover_cache.get(classification_id)
    if not run:
        raise HTTPException(status_code=404, detail="classification_id nao encontrado ou expirado.")
    generated_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(run.created_at))
    return run.class_stats, run.legend, generated_at


def get_cached_run(classification_id: str) -> LandCoverRun:
    _purge_cache()
    run = _landcover_cache.get(classification_id)
    if not run:
        raise HTTPException(status_code=404, detail="classification_id nao encontrado ou expirado.")
    return run


def _normalize_text(value: Any) -> str:
    return str(value or "").strip().lower()


def _landuse_height_for_class(class_id: int, class_name: str) -> float:
    normalized_name = _normalize_text(class_name)
    if "urb" in normalized_name:
        return DEFAULT_LANDUSE_3D_HEIGHTS["urbana"]
    if "degrad" in normalized_name:
        return DEFAULT_LANDUSE_3D_HEIGHTS["degradada"]
    if "agua" in normalized_name:
        return DEFAULT_LANDUSE_3D_HEIGHTS["agua"]
    if "solo" in normalized_name:
        return DEFAULT_LANDUSE_3D_HEIGHTS["solo"]
    if "agric" in normalized_name:
        return DEFAULT_LANDUSE_3D_HEIGHTS["agricultura"]
    if "pastag" in normalized_name:
        return DEFAULT_LANDUSE_3D_HEIGHTS["pastagem"]
    if "veget" in normalized_name or "florest" in normalized_name:
        return DEFAULT_LANDUSE_3D_HEIGHTS["vegetacao"]

    # Fallback por ids comuns do modulo LULC atual.
    if class_id == 1:
        return DEFAULT_LANDUSE_3D_HEIGHTS["agricultura"]
    if class_id == 2:
        return DEFAULT_LANDUSE_3D_HEIGHTS["pastagem"]
    if class_id == 3:
        return DEFAULT_LANDUSE_3D_HEIGHTS["vegetacao"]
    if class_id == 4:
        return DEFAULT_LANDUSE_3D_HEIGHTS["solo"]
    if class_id == 5:
        return DEFAULT_LANDUSE_3D_HEIGHTS["agua"]
    if class_id == 6:
        return DEFAULT_LANDUSE_3D_HEIGHTS["urbana"]
    return 8.0


def get_landcover_volumetric_geojson(
    classification_id: str,
    *,
    scale: int = 30,
    simplify_meters: float = 15.0,
    max_features: int = 3000,
) -> Dict[str, Any]:
    """
    Vetoriza a classificacao raster cacheada para renderizacao 3D no Cesium.
    - class_id/class_name/color/height_m sao adicionados em cada feicao.
    - area_ha e area_pct_aoi sao estimados por contagem de pixel da vetorizacao.
    """
    run = get_cached_run(classification_id)
    aoi = ee.Geometry(run.aoi_geojson)
    class_by_id = {int(item["id"]): item for item in run.classes}
    aoi_area_ha = float(sum(float(item.get("area_ha", 0.0)) for item in run.class_stats))

    classified = run.classified_image.rename("class_id").toInt16().clip(aoi)
    vectors = classified.reduceToVectors(
        reducer=ee.Reducer.countEvery(),
        geometry=aoi,
        scale=max(10, int(scale)),
        geometryType="polygon",
        eightConnected=False,
        labelProperty="class_id",
        maxPixels=1e13,
        bestEffort=True,
    )

    if simplify_meters and simplify_meters > 0:
        vectors = vectors.map(
            lambda feat: feat.setGeometry(feat.geometry().simplify(maxError=float(simplify_meters)))
        )

    if max_features and max_features > 0:
        vectors = vectors.limit(int(max_features))

    raw_geojson = vectors.getInfo() or {"type": "FeatureCollection", "features": []}
    features = raw_geojson.get("features") or []

    scale_m = float(max(10, int(scale)))
    pixel_area_ha = (scale_m * scale_m) / 10000.0

    for feature in features:
        props = feature.setdefault("properties", {})
        class_id_raw = props.get("class_id", props.get("label"))
        try:
            class_id = int(class_id_raw)
        except Exception:
            class_id = 0

        class_info = class_by_id.get(class_id) or {
            "id": class_id,
            "name": f"Classe {class_id}",
            "color": "#999999",
        }

        pixel_count_raw = props.get("count")
        area_ha = None
        if isinstance(pixel_count_raw, (int, float)):
            area_ha = float(pixel_count_raw) * pixel_area_ha
        elif isinstance(props.get("area_ha"), (int, float)):
            area_ha = float(props.get("area_ha"))

        area_pct_aoi = None
        if area_ha is not None and aoi_area_ha > 0:
            area_pct_aoi = (area_ha / aoi_area_ha) * 100.0

        class_name = str(class_info.get("name", f"Classe {class_id}"))
        props.update(
            {
                "class_id": class_id,
                "class_name": class_name,
                "color": class_info.get("color", "#999999"),
                "height_m": _landuse_height_for_class(class_id, class_name),
                "area_ha": round(area_ha, 4) if area_ha is not None else None,
                "area_pct_aoi": round(area_pct_aoi, 4) if area_pct_aoi is not None else None,
            }
        )

    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "classification_id": run.classification_id,
            "scale_m": int(scale_m),
            "simplify_meters": float(simplify_meters or 0),
            "aoi_area_ha": round(aoi_area_ha, 4),
            "features_count": len(features),
            "max_features": int(max_features),
            "truncated": bool(max_features and len(features) >= int(max_features)),
        },
    }


def refine_landcover(
    *,
    base_classification_id: Optional[str],
    base_classification_asset: Optional[str],
    refinement_polygon_geojson: Dict[str, Any],
    new_training_samples_fc: Dict[str, Any],
    classes_input: Optional[List[Dict[str, Any]]] = None,
    source_aoi_geojson: Optional[Dict[str, Any]] = None,
    date_start: Optional[date] = None,
    date_end: Optional[date] = None,
) -> LandCoverRun:
    """
    Refinamento zonal:
    - classifica apenas dentro de refinement_polygon
    - mescla por cima da classificacao base mantendo o restante intacto
    """
    refinement_geom = ee.Geometry(refinement_polygon_geojson)
    base_start = ""
    base_end = ""
    if base_classification_id:
        base_run = get_cached_run(base_classification_id)
        classes = base_run.classes
        base_classified = base_run.classified_image
        composite = base_run.composite_image
        aoi_geojson = base_run.aoi_geojson
        base_start = base_run.date_start
        base_end = base_run.date_end
    else:
        if not base_classification_asset:
            raise HTTPException(
                status_code=400,
                detail="Informe base_classification_id (cache) ou base_classification_asset.",
            )
        if not source_aoi_geojson or not date_start or not date_end:
            raise HTTPException(
                status_code=400,
                detail="Para base_classification_asset, informe source_aoi, date_start e date_end.",
            )
        classes = _build_classes(classes_input)
        aoi_geojson = source_aoi_geojson
        aoi = ee.Geometry(source_aoi_geojson)
        composite = _build_sentinel_composite(aoi, date_start, date_end)
        base_classified = ee.Image(base_classification_asset).rename("landcover").clip(aoi)
        base_start = str(date_start)
        base_end = str(date_end)

    normalized_samples = _normalize_training_samples(new_training_samples_fc, classes)
    refinement_training = ee.FeatureCollection(normalized_samples).filterBounds(refinement_geom)
    sample_count = refinement_training.size().getInfo()
    if sample_count < 3:
        raise HTTPException(
            status_code=400,
            detail="Amostras de refinamento insuficientes na area. Forneca ao menos 3.",
        )

    # Treina apenas com as novas amostras do refinamento e classifica somente a zona alvo.
    class_ids_distinct = refinement_training.aggregate_array("class_id").distinct().getInfo()
    class_ids_distinct = [int(c) for c in (class_ids_distinct or [])]
    if not class_ids_distinct:
        raise HTTPException(status_code=400, detail="Amostras de refinamento sem class_id valido.")

    if len(class_ids_distinct) == 1:
        # Fallback robusto: quando houver apenas 1 classe, evita erro do RF
        # e aplica sobrescrita controlada da zona de refinamento.
        refined_local = (
            ee.Image.constant(class_ids_distinct[0])
            .rename("landcover")
            .toInt16()
            .clip(refinement_geom)
        )
    else:
        refinement_sampled = composite.clip(refinement_geom).sampleRegions(
            collection=refinement_training,
            properties=["class_id"],
            scale=10,
            geometries=False,
        )
        sampled_count = refinement_sampled.size().getInfo()
        if sampled_count < 3:
            raise HTTPException(
                status_code=400,
                detail="Nao foi possivel extrair pixels suficientes nas amostras de refinamento.",
            )

        try:
            refinement_classifier = ee.Classifier.smileRandomForest(numberOfTrees=80, seed=77).train(
                features=refinement_sampled,
                classProperty="class_id",
                inputProperties=S2_BANDS,
            )
            refined_local = composite.clip(refinement_geom).classify(refinement_classifier).rename("landcover")
        except Exception as exc:
            message = str(exc)
            if "Only one class" in message:
                raise HTTPException(
                    status_code=400,
                    detail="Refinamento requer pelo menos 2 classes distintas nas amostras.",
                )
            raise
    refinement_mask = ee.Image.constant(1).clip(refinement_geom).mask()
    merged = base_classified.where(refinement_mask, refined_local).rename("landcover").clip(ee.Geometry(aoi_geojson))

    class_stats = _calculate_stats(merged, ee.Geometry(aoi_geojson), classes)
    legend = [{"class_id": c["id"], "class": c["name"], "color": c["color"]} for c in classes]
    palette = [c["color"].replace("#", "") for c in classes]
    min_class = min(c["id"] for c in classes)
    max_class = max(c["id"] for c in classes)
    map_id = merged.visualize(min=min_class, max=max_class, palette=palette).getMapId()
    tile_url = map_id["tile_fetcher"].url_format
    download_url = merged.toInt16().getDownloadURL(
        {"scale": 10, "crs": "EPSG:4326", "region": aoi_geojson, "format": "GEO_TIFF"}
    )

    refinement_signature = {
        "base_id": base_classification_id or base_classification_asset,
        "refinement_polygon": refinement_polygon_geojson,
        "new_training_samples": normalized_samples,
        "classes": classes,
    }
    refined_id = f"{_cache_key(refinement_signature)}-refined"
    run = LandCoverRun(
        classification_id=refined_id,
        tile_url=tile_url,
        legend=legend,
        class_stats=class_stats,
        download_url=download_url,
        created_at=time.time(),
        aoi_geojson=aoi_geojson,
        date_start=base_start,
        date_end=base_end,
        satellite="sentinel2",
        classes=classes,
        composite_image=composite,
        classified_image=merged,
    )
    _landcover_cache[refined_id] = run
    return run
