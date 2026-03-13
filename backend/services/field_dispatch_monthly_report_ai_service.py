from __future__ import annotations

import json
import os
from typing import Any, Dict, Tuple

import httpx


FIELD_DISPATCH_MONTHLY_REPORT_SYSTEM_PROMPT = """
Analise exclusivamente dados agregados de relatorio mensal de atividades de despacho em campo.
Produza uma interpretacao curta, objetiva e tecnica.
Nao invente dados.
Destaque:
- volume operacional
- distribuicao por categoria e status
- desempenho de prazo
- gargalos operacionais
- conformidade documental
Retorne JSON com:
- interpretation
""".strip()


def _top_label(items: list[dict[str, Any]]) -> str:
    if not items:
        return "indefinido"
    top = max(items, key=lambda item: float(item.get("count", 0) or 0))
    return str(top.get("label") or "indefinido")


def _heuristic_interpretation(payload: Dict[str, Any]) -> str:
    summary = payload.get("summary") or {}
    breakdowns = payload.get("breakdowns") or {}
    total = int(summary.get("total", 0) or 0)
    completion_rate = float(summary.get("completionRate", 0.0) or 0.0)
    overdue_rate = float(summary.get("overdueRate", 0.0) or 0.0)
    evidence_rate = float(summary.get("evidenceRate", 0.0) or 0.0)
    form_rate = float(summary.get("formSubmissionRate", 0.0) or 0.0)
    backlog = int(summary.get("backlogEndOfMonth", 0) or 0)
    top_category = _top_label(list(breakdowns.get("byCategory") or []))
    top_status = _top_label(list(breakdowns.get("byStatus") or []))
    top_agent = _top_label(
        [
            {"label": item.get("agentName"), "count": item.get("completed", 0)}
            for item in list(breakdowns.get("byAgent") or [])
        ]
    )

    overdue_note = (
        "O desempenho de prazo exige atencao, com incidencia relevante de atividades em atraso."
        if overdue_rate >= 25
        else "O indicador de prazo permaneceu controlado na maior parte do periodo."
    )
    compliance_note = (
        "A conformidade documental esta abaixo do ideal, especialmente em formularios ou evidencias pendentes."
        if min(form_rate, evidence_rate) < 60
        else "A conformidade documental ficou em patamar consistente para formularios e evidencias."
    )

    return (
        f"No periodo analisado foram consideradas {total} atividades, com predominio da categoria {top_category} "
        f"e maior concentracao no status {top_status}. A taxa de conclusao foi de {completion_rate:.1f}% "
        f"e o backlog ao fim do mes ficou em {backlog} atividade(s). {overdue_note} "
        f"{compliance_note} O agente com maior volume de entregas foi {top_agent}."
    )


async def interpret_field_dispatch_monthly_report(payload: Dict[str, Any]) -> Tuple[str, str]:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"
    heuristic = _heuristic_interpretation(payload)

    if not api_key:
        return heuristic, "heuristic"

    body = {
        "model": model,
        "temperature": 0.2,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": FIELD_DISPATCH_MONTHLY_REPORT_SYSTEM_PROMPT},
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

        interpretation = str(content_json.get("interpretation", "")).strip()
        if not interpretation:
            return heuristic, "heuristic"
        return interpretation, "openai"
    except Exception:
        return heuristic, "heuristic"
