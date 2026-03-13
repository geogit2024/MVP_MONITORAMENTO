from __future__ import annotations

import calendar
from collections import Counter, defaultdict
from datetime import date, datetime, time
from statistics import mean
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple


TERMINAL_STATUSES = {"concluida", "cancelada", "recusada"}
MONTHLY_REPORT_TIME_BASIS_FIELDS = {
    "createdAt": "createdAt",
    "dispatchedAt": "dispatchedAt",
    "completedAt": "completedAt",
    "updatedAt": "updatedAt",
}
MONTHLY_REPORT_OVERDUE_STATES = {"all", "overdue", "on_time", "no_due_date"}


def _parse_iso(value: Any) -> Optional[datetime]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    if isinstance(value, date):
        return datetime.combine(value, time.min)
    raw = str(value).strip()
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _parse_date(value: Any) -> Optional[date]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    raw = str(value).strip()
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw.replace("Z", "+00:00")).date()
    except ValueError:
        try:
            return date.fromisoformat(raw)
        except ValueError:
            return None


def _hours_between(start: Optional[datetime], end: Optional[datetime]) -> Optional[float]:
    if not start or not end or end < start:
        return None
    return round((end - start).total_seconds() / 3600.0, 2)


def _safe_ratio(part: int, whole: int) -> float:
    if whole <= 0:
        return 0.0
    return round((part / whole) * 100.0, 2)


def _normalize_string(value: Any) -> str:
    return str(value or "").strip().lower()


def _month_bounds(year: int, month: int) -> Tuple[datetime, datetime]:
    _, last_day = calendar.monthrange(year, month)
    start = datetime(year, month, 1, 0, 0, 0)
    end = datetime(year, month, last_day, 23, 59, 59, 999999)
    return start, end


def _week_of_month(value: datetime) -> int:
    return ((value.day - 1) // 7) + 1


def _final_timestamp(task: Dict[str, Any]) -> Optional[datetime]:
    return (
        _parse_iso(task.get("completedAt"))
        or _parse_iso(task.get("canceledAt"))
        or _parse_iso(task.get("updatedAt"))
    )


def _overdue_state_as_of(task: Dict[str, Any], cutoff: datetime) -> str:
    due_date = _parse_date(task.get("dueDate"))
    if not due_date:
        return "no_due_date"

    due_cutoff = datetime.combine(due_date, time.max)
    status = str(task.get("status") or "")
    if status in TERMINAL_STATUSES:
        final_ts = _final_timestamp(task)
        if final_ts and final_ts <= due_cutoff:
            return "on_time"
        return "overdue"

    if due_cutoff < cutoff:
        return "overdue"
    return "open"


def _status_at_cutoff(task: Dict[str, Any], history: Sequence[Dict[str, Any]], cutoff: datetime) -> str:
    last_status = "rascunho"
    created_at = _parse_iso(task.get("createdAt"))
    if created_at and created_at <= cutoff:
        last_status = str(task.get("status") or "rascunho")

    for item in history:
        changed_at = _parse_iso(item.get("changedAt"))
        if not changed_at or changed_at > cutoff:
            continue
        last_status = str(item.get("newStatus") or last_status)
    return last_status


def _serialize_filter_options(
    tasks: Sequence[Dict[str, Any]],
    agent_names: Dict[int, str],
) -> Dict[str, Any]:
    categories = sorted({str(task.get("category") or "").strip() for task in tasks if str(task.get("category") or "").strip()})
    creators = sorted({str(task.get("createdBy") or "").strip() for task in tasks if str(task.get("createdBy") or "").strip()})
    assigned_agent_ids = sorted({int(task["assignedAgentId"]) for task in tasks if task.get("assignedAgentId") is not None})

    return {
        "categories": categories,
        "priorities": ["baixa", "media", "alta", "critica"],
        "statuses": sorted({str(task.get("status") or "").strip() for task in tasks if str(task.get("status") or "").strip()}),
        "agents": [{"id": agent_id, "name": agent_names.get(agent_id, f"Agente {agent_id}")} for agent_id in assigned_agent_ids],
        "creators": creators,
    }


def _build_breakdowns(
    tasks: Sequence[Dict[str, Any]],
    month: int,
    year: int,
    time_basis: str,
    report_end: datetime,
) -> Dict[str, List[Dict[str, Any]]]:
    category_counter: Counter[str] = Counter()
    status_counter: Counter[str] = Counter()
    priority_counter: Counter[str] = Counter()
    agent_counter: Dict[Tuple[Optional[int], str], Dict[str, int]] = defaultdict(lambda: {"count": 0, "completed": 0})
    day_counter: Counter[int] = Counter()
    week_counter: Counter[int] = Counter()
    sla_counter: Counter[str] = Counter()
    compliance_counter: Counter[str] = Counter()

    _, last_day = calendar.monthrange(year, month)
    for day in range(1, last_day + 1):
        day_counter[day] += 0
    for week in range(1, 6):
        week_counter[week] += 0

    for task in tasks:
        category_counter[str(task.get("category") or "Sem categoria")] += 1
        status_counter[str(task.get("status") or "sem_status")] += 1
        priority_counter[str(task.get("priority") or "media")] += 1

        agent_key = (task.get("assignedAgentId"), str(task.get("agentName") or "Nao atribuido"))
        agent_counter[agent_key]["count"] += 1
        if str(task.get("status") or "") == "concluida":
            agent_counter[agent_key]["completed"] += 1

        event_dt = _parse_iso(task.get(time_basis))
        if event_dt:
            day_counter[event_dt.day] += 1
            week_counter[_week_of_month(event_dt)] += 1

        overdue_state = str(task.get("overdueState") or "no_due_date")
        if overdue_state == "overdue":
            sla_counter["Em atraso"] += 1
        elif overdue_state == "no_due_date":
            sla_counter["Sem prazo"] += 1
        else:
            sla_counter["No prazo"] += 1

        if bool(task.get("hasForm")):
            if bool(task.get("formSubmitted")):
                compliance_counter["Formulario enviado"] += 1
            else:
                compliance_counter["Formulario pendente"] += 1
        else:
            compliance_counter["Sem formulario"] += 1

        if bool(task.get("hasEvidence")):
            compliance_counter["Com evidencia"] += 1
        else:
            compliance_counter["Sem evidencia"] += 1

    return {
        "byCategory": [{"label": label, "count": count} for label, count in sorted(category_counter.items(), key=lambda item: (-item[1], item[0]))],
        "byStatus": [{"label": label, "count": count} for label, count in sorted(status_counter.items(), key=lambda item: (-item[1], item[0]))],
        "byPriority": [{"label": label, "count": count} for label, count in sorted(priority_counter.items(), key=lambda item: (-item[1], item[0]))],
        "byAgent": [
            {
                "agentId": agent_id,
                "agentName": agent_name,
                "count": values["count"],
                "completed": values["completed"],
            }
            for (agent_id, agent_name), values in sorted(agent_counter.items(), key=lambda item: (-item[1]["completed"], -item[1]["count"], item[0][1]))
        ],
        "byDay": [{"label": f"{day:02d}/{month:02d}", "count": day_counter[day]} for day in range(1, last_day + 1)],
        "byWeek": [{"label": f"Semana {week}", "count": week_counter[week]} for week in range(1, 6)],
        "bySla": [{"label": label, "count": sla_counter.get(label, 0)} for label in ("No prazo", "Em atraso", "Sem prazo")],
        "byCompliance": [
            {"label": label, "count": compliance_counter.get(label, 0)}
            for label in ("Formulario enviado", "Formulario pendente", "Sem formulario", "Com evidencia", "Sem evidencia")
        ],
    }


def build_field_dispatch_monthly_report(
    tasks: Sequence[Dict[str, Any]],
    histories_by_task_id: Dict[int, Sequence[Dict[str, Any]]],
    evidence_by_task_id: Dict[int, int],
    submissions_by_task_id: Dict[int, Dict[str, Any]],
    agent_names_by_id: Dict[int, str],
    filters: Dict[str, Any],
) -> Dict[str, Any]:
    month = int(filters["month"])
    year = int(filters["year"])
    time_basis = str(filters.get("timeBasis") or "createdAt")
    if time_basis not in MONTHLY_REPORT_TIME_BASIS_FIELDS:
        raise ValueError("timeBasis invalido.")

    overdue_state_filter = str(filters.get("overdueState") or "all")
    if overdue_state_filter not in MONTHLY_REPORT_OVERDUE_STATES:
        raise ValueError("overdueState invalido.")

    report_start, report_end = _month_bounds(year, month)
    selected_rows: List[Dict[str, Any]] = []
    dispatch_hours: List[float] = []
    acceptance_hours: List[float] = []
    arrival_hours: List[float] = []
    completion_hours: List[float] = []

    category_filter = _normalize_string(filters.get("category"))
    status_filter = _normalize_string(filters.get("status"))
    priority_filter = _normalize_string(filters.get("priority"))
    created_by_filter = _normalize_string(filters.get("createdBy"))
    search_filter = _normalize_string(filters.get("search"))
    due_date_from = _parse_date(filters.get("dueDateFrom"))
    due_date_to = _parse_date(filters.get("dueDateTo"))
    agent_id_filter = filters.get("agentId")
    has_form_filter = filters.get("hasForm")
    form_required_filter = filters.get("formRequired")
    form_submitted_filter = filters.get("formSubmitted")
    has_evidence_filter = filters.get("hasEvidence")

    for task in tasks:
        task_id = int(task["id"])
        event_dt = _parse_iso(task.get(time_basis))
        if not event_dt or event_dt < report_start or event_dt > report_end:
            continue

        task_category = _normalize_string(task.get("category"))
        task_status = _normalize_string(task.get("status"))
        task_priority = _normalize_string(task.get("priority"))
        task_created_by = _normalize_string(task.get("createdBy"))
        assigned_agent_id = task.get("assignedAgentId")
        due_date = _parse_date(task.get("dueDate"))
        has_form = bool(task.get("formTemplateId"))
        form_required = bool(task.get("formRequired"))
        submission = submissions_by_task_id.get(task_id) or {}
        form_submitted = str(submission.get("status") or "").strip().lower() == "submitted"
        evidence_count = int(evidence_by_task_id.get(task_id, 0) or 0)
        has_evidence = evidence_count > 0
        overdue_state = _overdue_state_as_of(task, report_end)

        if category_filter and task_category != category_filter:
            continue
        if status_filter and task_status != status_filter:
            continue
        if priority_filter and task_priority != priority_filter:
            continue
        if created_by_filter and task_created_by != created_by_filter:
            continue
        if agent_id_filter is not None and assigned_agent_id != int(agent_id_filter):
            continue
        if due_date_from and (not due_date or due_date < due_date_from):
            continue
        if due_date_to and (not due_date or due_date > due_date_to):
            continue
        if overdue_state_filter != "all" and overdue_state != overdue_state_filter:
            continue
        if has_form_filter is not None and has_form != bool(has_form_filter):
            continue
        if form_required_filter is not None and form_required != bool(form_required_filter):
            continue
        if form_submitted_filter is not None and form_submitted != bool(form_submitted_filter):
            continue
        if has_evidence_filter is not None and has_evidence != bool(has_evidence_filter):
            continue

        if search_filter:
            search_blob = " ".join(
                [
                    str(task.get("title") or ""),
                    str(task.get("description") or ""),
                    str(task.get("addressReference") or ""),
                ]
            ).lower()
            if search_filter not in search_blob:
                continue

        row = {
            "id": task_id,
            "title": task.get("title"),
            "category": task.get("category"),
            "priority": task.get("priority"),
            "status": task.get("status"),
            "agentName": agent_names_by_id.get(int(assigned_agent_id), "Nao atribuido") if assigned_agent_id is not None else None,
            "assignedAgentId": assigned_agent_id,
            "createdAt": task.get("createdAt"),
            "updatedAt": task.get("updatedAt"),
            "dispatchedAt": task.get("dispatchedAt"),
            "acceptedAt": task.get("acceptedAt"),
            "arrivedAt": task.get("arrivedAt"),
            "completedAt": task.get("completedAt"),
            "dueDate": task.get("dueDate"),
            "createdBy": task.get("createdBy"),
            "overdueState": overdue_state,
            "hasForm": has_form,
            "formRequired": form_required,
            "formSubmitted": form_submitted,
            "hasEvidence": has_evidence,
            "evidenceCount": evidence_count,
        }
        selected_rows.append(row)

        dispatch_delta = _hours_between(_parse_iso(task.get("createdAt")), _parse_iso(task.get("dispatchedAt")))
        acceptance_delta = _hours_between(_parse_iso(task.get("dispatchedAt")), _parse_iso(task.get("acceptedAt")))
        arrival_delta = _hours_between(_parse_iso(task.get("startedAt")), _parse_iso(task.get("arrivedAt")))
        completion_delta = _hours_between(_parse_iso(task.get("createdAt")), _parse_iso(task.get("completedAt")))

        if dispatch_delta is not None:
            dispatch_hours.append(dispatch_delta)
        if acceptance_delta is not None:
            acceptance_hours.append(acceptance_delta)
        if arrival_delta is not None:
            arrival_hours.append(arrival_delta)
        if completion_delta is not None:
            completion_hours.append(completion_delta)

    total = len(selected_rows)
    created_count = sum(1 for row in selected_rows if _parse_iso(row.get("createdAt")) and report_start <= _parse_iso(row.get("createdAt")) <= report_end)
    dispatched_count = sum(1 for row in selected_rows if _parse_iso(row.get("dispatchedAt")) and report_start <= _parse_iso(row.get("dispatchedAt")) <= report_end)
    completed_count = sum(1 for row in selected_rows if str(row.get("status") or "") == "concluida")
    canceled_count = sum(1 for row in selected_rows if str(row.get("status") or "") == "cancelada")
    refused_count = sum(1 for row in selected_rows if str(row.get("status") or "") == "recusada")
    execution_error_count = sum(1 for row in selected_rows if str(row.get("status") or "") == "erro_execucao")
    overdue_count = sum(1 for row in selected_rows if str(row.get("overdueState") or "") == "overdue")
    no_due_date_count = sum(1 for row in selected_rows if str(row.get("overdueState") or "") == "no_due_date")
    form_submitted_count = sum(1 for row in selected_rows if bool(row.get("formSubmitted")))
    evidence_count = sum(1 for row in selected_rows if bool(row.get("hasEvidence")))

    backlog_count = 0
    for task in tasks:
        created_at = _parse_iso(task.get("createdAt"))
        if not created_at or created_at > report_end:
            continue
        task_category = _normalize_string(task.get("category"))
        task_priority = _normalize_string(task.get("priority"))
        task_created_by = _normalize_string(task.get("createdBy"))
        assigned_agent_id = task.get("assignedAgentId")
        due_date = _parse_date(task.get("dueDate"))
        has_form = bool(task.get("formTemplateId"))
        form_required = bool(task.get("formRequired"))
        submission = submissions_by_task_id.get(int(task["id"])) or {}
        form_submitted = str(submission.get("status") or "").strip().lower() == "submitted"
        has_evidence = int(evidence_by_task_id.get(int(task["id"]), 0) or 0) > 0
        overdue_state = _overdue_state_as_of(task, report_end)

        if category_filter and task_category != category_filter:
            continue
        if priority_filter and task_priority != priority_filter:
            continue
        if created_by_filter and task_created_by != created_by_filter:
            continue
        if agent_id_filter is not None and assigned_agent_id != int(agent_id_filter):
            continue
        if due_date_from and (not due_date or due_date < due_date_from):
            continue
        if due_date_to and (not due_date or due_date > due_date_to):
            continue
        if overdue_state_filter != "all" and overdue_state != overdue_state_filter:
            continue
        if has_form_filter is not None and has_form != bool(has_form_filter):
            continue
        if form_required_filter is not None and form_required != bool(form_required_filter):
            continue
        if form_submitted_filter is not None and form_submitted != bool(form_submitted_filter):
            continue
        if has_evidence_filter is not None and has_evidence != bool(has_evidence_filter):
            continue
        if search_filter:
            search_blob = " ".join(
                [
                    str(task.get("title") or ""),
                    str(task.get("description") or ""),
                    str(task.get("addressReference") or ""),
                ]
            ).lower()
            if search_filter not in search_blob:
                continue

        status_at_cutoff = _status_at_cutoff(task, histories_by_task_id.get(int(task["id"]), []), report_end)
        if status_filter and _normalize_string(status_at_cutoff) != status_filter:
            continue
        if status_at_cutoff not in TERMINAL_STATUSES:
            backlog_count += 1

    breakdowns = _build_breakdowns(selected_rows, month, year, time_basis, report_end)
    filters_applied = {
        "month": month,
        "year": year,
        "timeBasis": time_basis,
        "category": filters.get("category"),
        "status": filters.get("status"),
        "priority": filters.get("priority"),
        "agentId": filters.get("agentId"),
        "createdBy": filters.get("createdBy"),
        "dueDateFrom": filters.get("dueDateFrom"),
        "dueDateTo": filters.get("dueDateTo"),
        "overdueState": overdue_state_filter,
        "hasForm": filters.get("hasForm"),
        "formRequired": filters.get("formRequired"),
        "formSubmitted": filters.get("formSubmitted"),
        "hasEvidence": filters.get("hasEvidence"),
        "search": filters.get("search"),
    }

    return {
        "filtersApplied": filters_applied,
        "availableFilters": _serialize_filter_options(tasks, agent_names_by_id),
        "summary": {
            "total": total,
            "created": created_count,
            "dispatched": dispatched_count,
            "completed": completed_count,
            "canceled": canceled_count,
            "refused": refused_count,
            "executionError": execution_error_count,
            "overdue": overdue_count,
            "noDueDate": no_due_date_count,
            "completionRate": _safe_ratio(completed_count, total),
            "overdueRate": _safe_ratio(overdue_count, total),
            "cancellationRate": _safe_ratio(canceled_count, total),
            "refusalRate": _safe_ratio(refused_count, total),
            "formSubmissionRate": _safe_ratio(form_submitted_count, total),
            "evidenceRate": _safe_ratio(evidence_count, total),
            "avgDispatchHours": round(mean(dispatch_hours), 2) if dispatch_hours else None,
            "avgAcceptanceHours": round(mean(acceptance_hours), 2) if acceptance_hours else None,
            "avgArrivalHours": round(mean(arrival_hours), 2) if arrival_hours else None,
            "avgCompletionHours": round(mean(completion_hours), 2) if completion_hours else None,
            "backlogEndOfMonth": backlog_count,
        },
        "breakdowns": breakdowns,
        "rows": sorted(selected_rows, key=lambda item: (_parse_iso(item.get(time_basis)) or report_start), reverse=True),
        "aiInterpretation": None,
    }
