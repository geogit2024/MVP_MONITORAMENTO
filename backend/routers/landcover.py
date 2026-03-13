from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional
import traceback

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

try:
    from services.landcover_service import (
        classify_landcover_polygons,
        classify_landcover,
        get_cached_stats,
        get_landcover_volumetric_geojson,
        vectorize_landcover_segments,
    )
except Exception:
    from backend.services.landcover_service import (
        classify_landcover_polygons,
        classify_landcover,
        get_cached_stats,
        get_landcover_volumetric_geojson,
        vectorize_landcover_segments,
    )


router = APIRouter(prefix="/analysis/landcover", tags=["LandCover"])


class LandCoverClass(BaseModel):
    id: int = Field(..., ge=1)
    name: str
    color: str


class LandCoverClassifyRequest(BaseModel):
    aoi: Dict[str, Any]
    training_samples: Dict[str, Any]
    date_start: date
    date_end: date
    satellite: str = "sentinel2"
    classes: Optional[List[LandCoverClass]] = None


class LandCoverLegendItem(BaseModel):
    class_id: int
    class_: str = Field(..., alias="class")
    color: str

    model_config = {"populate_by_name": True}


class LandCoverStatItem(BaseModel):
    class_id: int
    class_: str = Field(..., alias="class")
    area_ha: float
    color: str

    model_config = {"populate_by_name": True}


class LandCoverClassifyResponse(BaseModel):
    classification_id: str
    tile_url: str
    legend: List[LandCoverLegendItem]
    class_stats: List[LandCoverStatItem]
    export_url: str


class LandCoverVectorizeRequest(BaseModel):
    aoi: Dict[str, Any]
    date_start: date
    date_end: date
    satellite: str = "sentinel2"
    indices: Optional[List[str]] = None
    segment_size: int = Field(20, ge=5, le=120)
    compactness: float = Field(1.5, ge=0.1, le=20.0)
    connectivity: int = Field(8, ge=4, le=8)
    min_area_ha: float = Field(0.05, ge=0, le=500)
    simplify_meters: float = Field(5.0, ge=0, le=300)
    max_segments: int = Field(1200, ge=50, le=20000)
    mode: str = "advanced_ai"


class LandCoverVectorizeResponse(BaseModel):
    vectorization_id: str
    polygons: Dict[str, Any]
    summary: Dict[str, Any]
    metadata: Dict[str, Any]
    params_used: Dict[str, Any]


class LandCoverClassifyPolygonsRequest(BaseModel):
    polygons: Dict[str, Any]
    date_start: date
    date_end: date
    satellite: str = "sentinel2"
    aoi: Optional[Dict[str, Any]] = None
    vectorization_id: Optional[str] = None
    classes: Optional[List[LandCoverClass]] = None
    only_statuses: Optional[List[str]] = None
    persist: bool = False


class LandCoverClassifyPolygonsResponse(LandCoverClassifyResponse):
    polygons: Dict[str, Any]
    summary: Dict[str, Any]
    metadata: Dict[str, Any]


class LandCoverStatsResponse(BaseModel):
    classification_id: str
    generated_at: Optional[str] = None
    legend: List[LandCoverLegendItem]
    class_stats: List[LandCoverStatItem]


class LandCoverVolumetricResponse(BaseModel):
    type: str
    features: List[Dict[str, Any]]
    metadata: Dict[str, Any]


@router.post("/vectorize", response_model=LandCoverVectorizeResponse)
async def vectorize_landcover_endpoint(payload: LandCoverVectorizeRequest):
    if payload.mode != "advanced_ai":
        raise HTTPException(status_code=400, detail="Modo invalido para vetorizacao. Use mode='advanced_ai'.")
    try:
        run = vectorize_landcover_segments(
            aoi_geojson=payload.aoi,
            date_start=payload.date_start,
            date_end=payload.date_end,
            satellite=payload.satellite,
            indices_input=payload.indices,
            segment_size=payload.segment_size,
            compactness=payload.compactness,
            connectivity=payload.connectivity,
            min_area_ha=payload.min_area_ha,
            simplify_meters=payload.simplify_meters,
            max_segments=payload.max_segments,
        )
        return LandCoverVectorizeResponse(
            vectorization_id=run.vectorization_id,
            polygons=run.feature_collection,
            summary=run.summary,
            metadata=run.metadata,
            params_used=run.params_used,
        )
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erro ao vetorizar segmentos de uso do solo: {exc}")


@router.post("/classify", response_model=LandCoverClassifyResponse)
async def classify_landcover_endpoint(payload: LandCoverClassifyRequest):
    try:
        run = classify_landcover(
            aoi_geojson=payload.aoi,
            training_samples_fc=payload.training_samples,
            date_start=payload.date_start,
            date_end=payload.date_end,
            satellite=payload.satellite,
            classes_input=[c.model_dump() for c in payload.classes] if payload.classes else None,
        )
        return LandCoverClassifyResponse(
            classification_id=run.classification_id,
            tile_url=run.tile_url,
            legend=run.legend,
            class_stats=run.class_stats,
            export_url=run.download_url,
        )
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erro ao classificar uso do solo: {exc}")


@router.post("/classify-polygons", response_model=LandCoverClassifyPolygonsResponse)
async def classify_landcover_polygons_endpoint(payload: LandCoverClassifyPolygonsRequest):
    try:
        result = classify_landcover_polygons(
            polygons_fc=payload.polygons,
            date_start=payload.date_start,
            date_end=payload.date_end,
            satellite=payload.satellite,
            classes_input=[c.model_dump() for c in payload.classes] if payload.classes else None,
            only_statuses=payload.only_statuses,
            aoi_geojson=payload.aoi,
            vectorization_id=payload.vectorization_id,
            persist=payload.persist,
        )
        run = result.classification_run
        return LandCoverClassifyPolygonsResponse(
            classification_id=run.classification_id,
            tile_url=run.tile_url,
            legend=run.legend,
            class_stats=run.class_stats,
            export_url=run.download_url,
            polygons=result.polygons,
            summary=result.summary,
            metadata=result.metadata,
        )
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erro ao classificar poligonos de uso do solo: {exc}")


@router.get("/stats", response_model=LandCoverStatsResponse)
async def landcover_stats(classification_id: str = Query(..., min_length=16)):
    stats, legend, generated_at = get_cached_stats(classification_id)
    return LandCoverStatsResponse(
        classification_id=classification_id,
        generated_at=generated_at,
        legend=legend,
        class_stats=stats,
    )


@router.get("/volumetric", response_model=LandCoverVolumetricResponse)
async def landcover_volumetric(
    classification_id: str = Query(..., min_length=16),
    scale: int = Query(30, ge=10, le=120),
    simplify_meters: float = Query(15.0, ge=0, le=200),
    max_features: int = Query(3000, ge=100, le=20000),
):
    try:
        return get_landcover_volumetric_geojson(
            classification_id=classification_id,
            scale=scale,
            simplify_meters=simplify_meters,
            max_features=max_features,
        )
    except HTTPException:
        raise
    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erro ao gerar volumetria LULC: {exc}")
