from __future__ import annotations

from typing import List, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

try:
    from services.terrain_profile_ai_service import interpret_terrain_profile
except Exception:
    from backend.services.terrain_profile_ai_service import interpret_terrain_profile


router = APIRouter(prefix="/analysis/terrain-profile", tags=["Terrain Profile"])


class TerrainProfileSummaryInput(BaseModel):
    totalDistanceMeters: float = Field(..., ge=0)
    minElevationMeters: float
    maxElevationMeters: float
    averageElevationMeters: float
    elevationRangeMeters: float = Field(..., ge=0)
    averageSlopePercent: float
    maxSlopePercent: float
    minSlopePercent: float
    averageGradePercent: float
    uphillDistanceMeters: float = Field(..., ge=0)
    downhillDistanceMeters: float = Field(..., ge=0)
    slopeBreakCount: int = Field(..., ge=0)
    criticalSegmentCount: int = Field(..., ge=0)
    terrainClass: str
    features: List[str] = Field(default_factory=list)


class TerrainProfileSegmentInput(BaseModel):
    startDistance: float = Field(..., ge=0)
    endDistance: float = Field(..., ge=0)
    slopePercent: float
    type: Literal["flat", "uphill", "downhill", "steep", "ridge", "valley"]


class TerrainProfileInterpretRequest(BaseModel):
    summary: TerrainProfileSummaryInput
    segments: List[TerrainProfileSegmentInput] = Field(default_factory=list, max_length=600)


class TerrainProfileInterpretResponse(BaseModel):
    description: str
    source: Literal["openai", "heuristic"]


@router.post("/interpret", response_model=TerrainProfileInterpretResponse)
async def interpret_terrain_profile_endpoint(
    payload: TerrainProfileInterpretRequest,
) -> TerrainProfileInterpretResponse:
    try:
        description, source = await interpret_terrain_profile(payload.model_dump())
        return TerrainProfileInterpretResponse(description=description, source=source)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Erro ao interpretar perfil do terreno: {exc}")
