from __future__ import annotations

import json
import os
from typing import Any, Dict, Tuple

import httpx


TERRAIN_PROFILE_SYSTEM_PROMPT = """
Analise dados de perfil do terreno e escreva uma descricao tecnica curta ou moderada.
Use somente os dados recebidos.
Nao invente informacoes.
Destaque:
- comportamento geral do relevo
- desnivel total
- trechos de maior declividade
- implicacoes operacionais de forma moderada
Retorne JSON com a chave:
- description
""".strip()


def _heuristic_description(payload: Dict[str, Any]) -> str:
    summary = payload.get("summary") or {}
    terrain_class = str(summary.get("terrainClass", "indefinido"))
    total_distance = float(summary.get("totalDistanceMeters", 0.0) or 0.0)
    elevation_range = float(summary.get("elevationRangeMeters", 0.0) or 0.0)
    avg_slope = float(summary.get("averageSlopePercent", 0.0) or 0.0)
    max_slope = max(
        abs(float(summary.get("maxSlopePercent", 0.0) or 0.0)),
        abs(float(summary.get("minSlopePercent", 0.0) or 0.0)),
    )
    critical_segments = int(summary.get("criticalSegmentCount", 0) or 0)
    slope_break_count = int(summary.get("slopeBreakCount", 0) or 0)

    distance_text = f"{total_distance / 1000:.2f} km" if total_distance >= 1000 else f"{total_distance:.0f} m"

    if critical_segments > 0:
        operational_note = (
            f"Foram identificados {critical_segments} segmentos com declividade elevada, "
            "indicando maior restricao operacional local."
        )
    else:
        operational_note = (
            "Nao foram observados segmentos de declividade critica, "
            "com menor risco operacional relacionado ao relevo."
        )

    return (
        f"Perfil com predominancia de relevo {terrain_class}, analisando {distance_text} "
        f"e desnivel de {elevation_range:.1f} m. A declividade media foi de {avg_slope:.1f}% "
        f"com pico de {max_slope:.1f}%. Foram detectadas {slope_break_count} rupturas de declive. "
        f"{operational_note}"
    )


async def interpret_terrain_profile(payload: Dict[str, Any]) -> Tuple[str, str]:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"
    heuristic = _heuristic_description(payload)

    if not api_key:
        return heuristic, "heuristic"

    body = {
        "model": model,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": TERRAIN_PROFILE_SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
        ],
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(
                "https://api.openai.com/v1/chat/completions",
                headers=headers,
                json=body,
            )
        if not response.is_success:
            return heuristic, "heuristic"

        parsed = response.json()
        content = parsed.get("choices", [{}])[0].get("message", {}).get("content", "{}")
        try:
            content_json = json.loads(content) if isinstance(content, str) else {}
        except json.JSONDecodeError:
            return heuristic, "heuristic"

        description = str(content_json.get("description", "")).strip()
        if not description:
            return heuristic, "heuristic"
        return description, "openai"
    except Exception:
        return heuristic, "heuristic"
