from __future__ import annotations

from datetime import date
from typing import Any, Dict, List, Optional
import traceback

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

try:
    from services.landcover_service import classify_landcover, get_cached_stats
except Exception:
    from backend.services.landcover_service import classify_landcover, get_cached_stats


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


class LandCoverStatsResponse(BaseModel):
    classification_id: str
    generated_at: Optional[str] = None
    legend: List[LandCoverLegendItem]
    class_stats: List[LandCoverStatItem]


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


@router.get("/stats", response_model=LandCoverStatsResponse)
async def landcover_stats(classification_id: str = Query(..., min_length=16)):
    stats, legend, generated_at = get_cached_stats(classification_id)
    return LandCoverStatsResponse(
        classification_id=classification_id,
        generated_at=generated_at,
        legend=legend,
        class_stats=stats,
    )
