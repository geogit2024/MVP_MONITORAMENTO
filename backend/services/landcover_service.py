from __future__ import annotations

import hashlib
import json
import time
from dataclasses import dataclass
from datetime import date
from typing import Any, Dict, List, Optional, Tuple

import ee
from fastapi import HTTPException, status
from shapely.geometry import shape


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


_landcover_cache: Dict[str, LandCoverRun] = {}


def _purge_cache() -> None:
    now = time.time()
    expired = [k for k, v in _landcover_cache.items() if now - v.created_at > CACHE_TTL_SECONDS]
    for key in expired:
        _landcover_cache.pop(key, None)


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
