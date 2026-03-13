from __future__ import annotations

import json
import os
import secrets
import threading
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Set

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from dotenv import load_dotenv
from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    Integer,
    MetaData,
    String,
    Table,
    Text,
    and_,
    create_engine,
    desc,
    inspect,
    insert,
    func,
    select,
    text,
    update,
)

try:
    from services.field_dispatch_monthly_report_ai_service import interpret_field_dispatch_monthly_report
    from services.field_dispatch_monthly_report_service import (
        MONTHLY_REPORT_OVERDUE_STATES,
        MONTHLY_REPORT_TIME_BASIS_FIELDS,
        build_field_dispatch_monthly_report,
    )
except ModuleNotFoundError:  # pragma: no cover - import path fallback
    from backend.services.field_dispatch_monthly_report_ai_service import interpret_field_dispatch_monthly_report
    from backend.services.field_dispatch_monthly_report_service import (
        MONTHLY_REPORT_OVERDUE_STATES,
        MONTHLY_REPORT_TIME_BASIS_FIELDS,
        build_field_dispatch_monthly_report,
    )

load_dotenv()


ROLE_ADMIN = "administrador"
ROLE_DISPATCHER = "despachante"
ROLE_AGENT = "agente_campo"
ROLE_SUPERVISOR = "supervisor"
ALLOWED_ROLES = {ROLE_ADMIN, ROLE_DISPATCHER, ROLE_AGENT, ROLE_SUPERVISOR}

STATUSES: Set[str] = {
    "rascunho",
    "despachada",
    "recebida",
    "aceita",
    "em_deslocamento",
    "no_local",
    "em_execucao",
    "concluida",
    "recusada",
    "cancelada",
    "erro_execucao",
}

TRANSITIONS: Dict[str, Set[str]] = {
    "rascunho": {"despachada", "cancelada"},
    "despachada": {"recebida", "recusada", "cancelada"},
    "recebida": {"aceita", "recusada", "cancelada"},
    "aceita": {"em_deslocamento", "cancelada"},
    "em_deslocamento": {"no_local", "erro_execucao", "cancelada"},
    "no_local": {"em_execucao", "erro_execucao", "cancelada"},
    "em_execucao": {"concluida", "erro_execucao", "cancelada"},
    "erro_execucao": {"em_execucao", "concluida", "cancelada"},
    "recusada": set(),
    "cancelada": set(),
    "concluida": set(),
}

STATUS_TS_FIELD = {
    "despachada": "dispatched_at",
    "recebida": "received_at",
    "aceita": "accepted_at",
    "em_deslocamento": "started_at",
    "no_local": "arrived_at",
    "concluida": "completed_at",
    "cancelada": "canceled_at",
}

FORM_TEMPLATE_STATUSES: Set[str] = {"draft", "published", "archived"}
FORM_VERSION_STATUSES: Set[str] = {"draft", "published", "archived"}
FORM_SUBMISSION_STATUSES: Set[str] = {"draft", "submitted"}

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("Variavel de ambiente DATABASE_URL nao definida.")

if DATABASE_URL.startswith("postgresql"):
    engine = create_engine(
        DATABASE_URL,
        pool_pre_ping=True,
        pool_recycle=300,
        pool_timeout=8,
        connect_args={
            "connect_timeout": 5,
            "options": "-c statement_timeout=12000 -c lock_timeout=6000",
        },
    )
else:
    engine = create_engine(DATABASE_URL)
metadata = MetaData()
schema_ready = False
agent_sessions: Dict[str, Dict[str, Any]] = {}
uploads_dir = Path(__file__).resolve().parents[1] / "uploads" / "field-dispatch"
db_source = "primary"


field_agent_table = Table(
    "field_agent",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("user_id", String(80), nullable=False, unique=True),
    Column("name", String(200), nullable=False),
    Column("phone", String(40), nullable=True),
    Column("role", String(40), nullable=False, default=ROLE_AGENT),
    Column("operational_status", String(40), nullable=False, default="available"),
    Column("auth_secret", String(120), nullable=False),
    Column("last_known_location_json", Text, nullable=True),
    Column("last_seen_at", DateTime, nullable=True),
    Column("created_at", DateTime, nullable=False, default=datetime.utcnow),
)

field_task_table = Table(
    "field_task",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("external_id", String(80), nullable=False, unique=True),
    Column("title", String(255), nullable=False),
    Column("description", Text, nullable=True),
    Column("category", String(120), nullable=False),
    Column("priority", String(40), nullable=False, default="media"),
    Column("status", String(40), nullable=False, default="rascunho"),
    Column("created_at", DateTime, nullable=False, default=datetime.utcnow),
    Column("updated_at", DateTime, nullable=False, default=datetime.utcnow),
    Column("dispatched_at", DateTime, nullable=True),
    Column("received_at", DateTime, nullable=True),
    Column("accepted_at", DateTime, nullable=True),
    Column("started_at", DateTime, nullable=True),
    Column("arrived_at", DateTime, nullable=True),
    Column("completed_at", DateTime, nullable=True),
    Column("canceled_at", DateTime, nullable=True),
    Column("created_by", String(120), nullable=False),
    Column("assigned_agent_id", Integer, nullable=True),
    Column("geometry_json", Text, nullable=False),
    Column("address_reference", String(255), nullable=True),
    Column("instructions", Text, nullable=True),
    Column("due_date", Date, nullable=True),
    Column("result_summary", Text, nullable=True),
    Column("cancel_reason", Text, nullable=True),
    Column("form_template_id", Integer, nullable=True),
    Column("form_template_version", Integer, nullable=True),
    Column("form_required", Boolean, nullable=False, default=False),
)

field_task_status_history_table = Table(
    "field_task_status_history",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("task_id", Integer, nullable=False),
    Column("previous_status", String(40), nullable=True),
    Column("new_status", String(40), nullable=False),
    Column("changed_by", String(120), nullable=False),
    Column("changed_at", DateTime, nullable=False, default=datetime.utcnow),
    Column("note", Text, nullable=True),
)

agent_location_table = Table(
    "agent_location",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("agent_id", Integer, nullable=False),
    Column("task_id", Integer, nullable=True),
    Column("geometry_json", Text, nullable=False),
    Column("timestamp", DateTime, nullable=False, default=datetime.utcnow),
    Column("accuracy", Float, nullable=True),
    Column("speed", Float, nullable=True),
    Column("heading", Float, nullable=True),
    Column("source", String(60), nullable=True, default="mobile_web"),
)

field_evidence_table = Table(
    "field_evidence",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("task_id", Integer, nullable=False),
    Column("agent_id", Integer, nullable=False),
    Column("type", String(60), nullable=False, default="photo"),
    Column("file_url", Text, nullable=False),
    Column("description", Text, nullable=True),
    Column("geometry_json", Text, nullable=True),
    Column("timestamp", DateTime, nullable=False, default=datetime.utcnow),
)

field_form_template_table = Table(
    "field_form_template",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("external_id", String(80), nullable=False, unique=True),
    Column("name", String(255), nullable=False),
    Column("description", Text, nullable=True),
    Column("status", String(40), nullable=False, default="draft"),
    Column("active_version", Integer, nullable=True),
    Column("created_by", String(120), nullable=False),
    Column("created_at", DateTime, nullable=False, default=datetime.utcnow),
    Column("updated_at", DateTime, nullable=False, default=datetime.utcnow),
)

field_form_template_version_table = Table(
    "field_form_template_version",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("template_id", Integer, nullable=False),
    Column("version_number", Integer, nullable=False),
    Column("status", String(40), nullable=False, default="draft"),
    Column("schema_json", Text, nullable=False, default="{}"),
    Column("created_by", String(120), nullable=False),
    Column("created_at", DateTime, nullable=False, default=datetime.utcnow),
    Column("updated_at", DateTime, nullable=False, default=datetime.utcnow),
    Column("published_at", DateTime, nullable=True),
)

field_task_form_submission_table = Table(
    "field_task_form_submission",
    metadata,
    Column("id", Integer, primary_key=True),
    Column("task_id", Integer, nullable=False),
    Column("template_id", Integer, nullable=False),
    Column("template_version", Integer, nullable=False),
    Column("status", String(40), nullable=False, default="draft"),
    Column("submission_json", Text, nullable=False, default="{}"),
    Column("validation_errors_json", Text, nullable=True),
    Column("submitted_by", String(120), nullable=False),
    Column("created_at", DateTime, nullable=False, default=datetime.utcnow),
    Column("updated_at", DateTime, nullable=False, default=datetime.utcnow),
    Column("submitted_at", DateTime, nullable=True),
)


def _json_dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=True)


def _run_with_timeout(callback, timeout_seconds: int) -> tuple[bool, Optional[Exception]]:
    outcome: Dict[str, Optional[Exception] | bool] = {"done": False, "error": None}

    def _target() -> None:
        try:
            callback()
            outcome["done"] = True
        except Exception as inner_error:  # pragma: no cover - defensive path
            outcome["error"] = inner_error

    worker = threading.Thread(target=_target, daemon=True)
    worker.start()
    worker.join(max(1, timeout_seconds))
    if worker.is_alive():
        return False, TimeoutError(f"timed out after {timeout_seconds}s")
    error = outcome["error"]
    if isinstance(error, Exception):
        return False, error
    return bool(outcome["done"]), None


def _json_loads(value: Optional[str], default: Any = None) -> Any:
    if value is None:
        return default
    try:
        return json.loads(value)
    except Exception:
        return default


def _iso(value: Any) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, date):
        return datetime.combine(value, datetime.min.time()).isoformat()
    return str(value)


def _table_has_column(table_name: str, column_name: str) -> bool:
    inspector = inspect(engine)
    try:
        columns = inspector.get_columns(table_name)
    except Exception:
        return False
    return any(str(col.get("name")) == column_name for col in columns)


def _ensure_task_form_columns() -> None:
    additions = [
        ("form_template_id", "INTEGER"),
        ("form_template_version", "INTEGER"),
        ("form_required", "BOOLEAN DEFAULT 0"),
    ]
    with engine.begin() as conn:
        for column_name, sql_type in additions:
            if _table_has_column("field_task", column_name):
                continue
            conn.execute(text(f"ALTER TABLE field_task ADD COLUMN {column_name} {sql_type}"))


def _activate_sqlite_fallback() -> None:
    global engine, db_source
    fallback_path = Path(__file__).resolve().parents[1] / "field_dispatch_fallback.db"
    engine = create_engine(
        f"sqlite:///{fallback_path.as_posix()}",
        connect_args={"check_same_thread": False},
    )
    db_source = "sqlite_fallback"


def _normalize_form_schema(raw_schema: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    source = raw_schema or {}
    sections_value = source.get("sections")
    fields_value = source.get("fields")
    sections: List[Dict[str, Any]] = []

    if isinstance(sections_value, list):
        for sec_index, section in enumerate(sections_value):
            if not isinstance(section, dict):
                continue
            section_id = str(section.get("id") or f"section_{sec_index + 1}")
            section_title = str(section.get("title") or f"Secao {sec_index + 1}")
            raw_fields = section.get("fields")
            normalized_fields: List[Dict[str, Any]] = []
            if isinstance(raw_fields, list):
                for field_index, field in enumerate(raw_fields):
                    normalized = _normalize_form_field(field, field_index)
                    if normalized:
                        normalized_fields.append(normalized)
            sections.append({"id": section_id, "title": section_title, "fields": normalized_fields})

    if not sections and isinstance(fields_value, list):
        normalized_fields = []
        for field_index, field in enumerate(fields_value):
            normalized = _normalize_form_field(field, field_index)
            if normalized:
                normalized_fields.append(normalized)
        sections = [{"id": "section_1", "title": "Formulario", "fields": normalized_fields}]

    if not sections:
        sections = [{"id": "section_1", "title": "Formulario", "fields": []}]

    return {"sections": sections}


def _normalize_form_field(raw_field: Any, index: int) -> Optional[Dict[str, Any]]:
    if not isinstance(raw_field, dict):
        return None
    field_id = str(raw_field.get("id") or f"field_{index + 1}").strip()
    if not field_id:
        field_id = f"field_{index + 1}"
    field_type = str(raw_field.get("type") or "text").strip().lower()
    if field_type not in {
        "text",
        "number",
        "date",
        "select",
        "multiselect",
        "checkbox",
        "radio",
        "textarea",
        "photo",
        "signature",
        "geolocation",
        "file",
    }:
        field_type = "text"

    options: List[Dict[str, str]] = []
    raw_options = raw_field.get("options")
    if isinstance(raw_options, list):
        for option in raw_options:
            if isinstance(option, dict):
                value = str(option.get("value") or option.get("label") or "").strip()
                label = str(option.get("label") or option.get("value") or "").strip()
            else:
                value = str(option).strip()
                label = value
            if value:
                options.append({"value": value, "label": label or value})

    validation = raw_field.get("validation") if isinstance(raw_field.get("validation"), dict) else {}
    conditional = raw_field.get("conditionalRule") if isinstance(raw_field.get("conditionalRule"), dict) else None
    return {
        "id": field_id,
        "type": field_type,
        "label": str(raw_field.get("label") or field_id),
        "required": bool(raw_field.get("required") or False),
        "placeholder": str(raw_field.get("placeholder") or ""),
        "helpText": str(raw_field.get("helpText") or ""),
        "options": options,
        "validation": validation,
        "conditionalRule": conditional,
    }


def _iter_schema_fields(schema: Dict[str, Any]) -> List[Dict[str, Any]]:
    fields: List[Dict[str, Any]] = []
    for section in schema.get("sections", []):
        raw_fields = section.get("fields") if isinstance(section, dict) else []
        if not isinstance(raw_fields, list):
            continue
        for field in raw_fields:
            if isinstance(field, dict) and field.get("id"):
                fields.append(field)
    return fields


def _field_visible(field: Dict[str, Any], answers: Dict[str, Any]) -> bool:
    rule = field.get("conditionalRule")
    if not isinstance(rule, dict):
        return True
    source_field_id = str(rule.get("sourceFieldId") or "").strip()
    if not source_field_id:
        return True
    operator = str(rule.get("operator") or "equals").strip().lower()
    target_value = rule.get("value")
    source_value = answers.get(source_field_id)

    if operator == "not_equals":
        return source_value != target_value
    if operator == "in":
        values = target_value if isinstance(target_value, list) else [target_value]
        return source_value in values
    if operator == "not_in":
        values = target_value if isinstance(target_value, list) else [target_value]
        return source_value not in values
    return source_value == target_value


def _is_empty_answer(value: Any) -> bool:
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, (list, dict)):
        return len(value) == 0
    return False


def _validate_form_answers(schema: Dict[str, Any], answers: Dict[str, Any]) -> List[Dict[str, Any]]:
    errors: List[Dict[str, Any]] = []
    for field in _iter_schema_fields(schema):
        field_id = str(field.get("id"))
        if not _field_visible(field, answers):
            continue
        value = answers.get(field_id)
        if bool(field.get("required")) and _is_empty_answer(value):
            errors.append({"fieldId": field_id, "message": "Campo obrigatorio nao preenchido."})
            continue
        validation = field.get("validation")
        if not isinstance(validation, dict) or _is_empty_answer(value):
            continue
        if isinstance(value, (int, float)):
            min_value = validation.get("min")
            max_value = validation.get("max")
            if min_value is not None and value < float(min_value):
                errors.append({"fieldId": field_id, "message": f"Valor minimo: {min_value}."})
            if max_value is not None and value > float(max_value):
                errors.append({"fieldId": field_id, "message": f"Valor maximo: {max_value}."})
        if isinstance(value, str):
            min_length = validation.get("minLength")
            max_length = validation.get("maxLength")
            if min_length is not None and len(value) < int(min_length):
                errors.append({"fieldId": field_id, "message": f"Tamanho minimo: {min_length}."})
            if max_length is not None and len(value) > int(max_length):
                errors.append({"fieldId": field_id, "message": f"Tamanho maximo: {max_length}."})
    return errors


def _ensure_schema() -> None:
    global schema_ready
    if schema_ready:
        return

    init_timeout = int(os.getenv("FIELD_DISPATCH_DB_INIT_TIMEOUT_SECONDS", "10"))

    def _init_primary_schema() -> None:
        metadata.create_all(engine)
        _ensure_task_form_columns()

    try:
        ok, primary_error = _run_with_timeout(_init_primary_schema, init_timeout)
        if not ok:
            raise RuntimeError(
                f"Timeout initializing field-dispatch schema in primary DB: {primary_error}"
            )
    except Exception as primary_error:
        if db_source != "sqlite_fallback":
            _activate_sqlite_fallback()
            print(
                "[field-dispatch] Primary DB unavailable during schema init. "
                "Automatic fallback to local SQLite enabled."
            )
            metadata.create_all(engine)
            _ensure_task_form_columns()
        else:
            raise HTTPException(
                status_code=503,
                detail=f"Falha ao inicializar banco do modulo de despacho: {primary_error}",
            ) from primary_error
    uploads_dir.mkdir(parents=True, exist_ok=True)
    default_agents = [
        {
            "user_id": "agente.norte",
            "name": "Agente Norte",
            "phone": "+55 11 90000-1001",
            "role": ROLE_AGENT,
            "operational_status": "available",
            "auth_secret": "123456",
        },
        {
            "user_id": "agente.sul",
            "name": "Agente Sul",
            "phone": "+55 11 90000-1002",
            "role": ROLE_AGENT,
            "operational_status": "available",
            "auth_secret": "123456",
        },
    ]

    with engine.begin() as conn:
        for seed in default_agents:
            found = conn.execute(
                select(field_agent_table.c.id).where(field_agent_table.c.user_id == seed["user_id"]).limit(1)
            ).fetchone()
            if found:
                continue
            conn.execute(
                insert(field_agent_table).values(
                    user_id=seed["user_id"],
                    name=seed["name"],
                    phone=seed["phone"],
                    role=seed["role"],
                    operational_status=seed["operational_status"],
                    auth_secret=seed["auth_secret"],
                    created_at=datetime.utcnow(),
                )
            )
    schema_ready = True


def _user_context(request: Request) -> Dict[str, str]:
    role = str(request.headers.get("x-user-role") or ROLE_ADMIN).strip().lower()
    if role not in ALLOWED_ROLES:
        role = ROLE_ADMIN
    return {"user_id": str(request.headers.get("x-user-id") or "system"), "role": role}


def _require_roles(context: Dict[str, str], roles: Set[str]) -> None:
    if context["role"] not in roles:
        raise HTTPException(status_code=403, detail="Perfil sem permissao para esta operacao.")


def _validate_status(status_value: str) -> str:
    status_name = str(status_value or "").strip().lower()
    if status_name not in STATUSES:
        raise HTTPException(status_code=400, detail=f"Status invalido: {status_name}")
    return status_name


def _assert_transition(current: str, new: str, force: bool = False) -> None:
    if current == new:
        return
    if force:
        return
    if new not in TRANSITIONS.get(current, set()):
        raise HTTPException(status_code=400, detail=f"Transicao invalida: {current} -> {new}")


def _task_dict(row: Any, history: Optional[List[Dict[str, Any]]] = None) -> Dict[str, Any]:
    data = dict(row._mapping)
    return {
        "id": data["id"],
        "externalId": data["external_id"],
        "title": data["title"],
        "description": data["description"],
        "category": data["category"],
        "priority": data["priority"],
        "status": data["status"],
        "createdAt": _iso(data["created_at"]),
        "updatedAt": _iso(data["updated_at"]),
        "dispatchedAt": _iso(data["dispatched_at"]),
        "receivedAt": _iso(data["received_at"]),
        "acceptedAt": _iso(data["accepted_at"]),
        "startedAt": _iso(data["started_at"]),
        "arrivedAt": _iso(data["arrived_at"]),
        "completedAt": _iso(data["completed_at"]),
        "canceledAt": _iso(data["canceled_at"]),
        "createdBy": data["created_by"],
        "assignedAgentId": data["assigned_agent_id"],
        "geometry": _json_loads(data["geometry_json"], default={}),
        "addressReference": data["address_reference"],
        "instructions": data["instructions"],
        "dueDate": _iso(data["due_date"]),
        "resultSummary": data["result_summary"],
        "cancelReason": data["cancel_reason"],
        "formTemplateId": data.get("form_template_id"),
        "formTemplateVersion": data.get("form_template_version"),
        "formRequired": bool(data.get("form_required") or False),
        "history": history or [],
    }


def _agent_dict(row: Any) -> Dict[str, Any]:
    data = dict(row._mapping)
    return {
        "id": data["id"],
        "userId": data["user_id"],
        "name": data["name"],
        "phone": data["phone"],
        "role": data["role"],
        "operationalStatus": data["operational_status"],
        "lastKnownLocation": _json_loads(data["last_known_location_json"], default=None),
        "lastSeenAt": _iso(data["last_seen_at"]),
    }


def _history(conn: Any, task_id: int) -> List[Dict[str, Any]]:
    rows = conn.execute(
        select(field_task_status_history_table)
        .where(field_task_status_history_table.c.task_id == task_id)
        .order_by(field_task_status_history_table.c.changed_at.asc())
    ).fetchall()
    return [
        {
            "id": r.id,
            "taskId": r.task_id,
            "previousStatus": r.previous_status,
            "newStatus": r.new_status,
            "changedBy": r.changed_by,
            "changedAt": _iso(r.changed_at),
            "note": r.note,
        }
        for r in rows
    ]


def _get_task(conn: Any, task_id: int) -> Any:
    row = conn.execute(select(field_task_table).where(field_task_table.c.id == task_id)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Atividade nao encontrada.")
    return row


def _get_agent(conn: Any, agent_id: int) -> Any:
    row = conn.execute(select(field_agent_table).where(field_agent_table.c.id == agent_id)).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Agente nao encontrado.")
    return row


def _get_form_template(conn: Any, template_id: int) -> Any:
    row = conn.execute(
        select(field_form_template_table).where(field_form_template_table.c.id == template_id)
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Template de formulario nao encontrado.")
    return row


def _get_form_template_version(conn: Any, template_id: int, version_number: int) -> Any:
    row = conn.execute(
        select(field_form_template_version_table).where(
            field_form_template_version_table.c.template_id == template_id,
            field_form_template_version_table.c.version_number == version_number,
        )
    ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Versao de template nao encontrada.")
    return row


def _latest_form_template_version(conn: Any, template_id: int) -> Optional[Any]:
    return conn.execute(
        select(field_form_template_version_table)
        .where(field_form_template_version_table.c.template_id == template_id)
        .order_by(field_form_template_version_table.c.version_number.desc())
        .limit(1)
    ).fetchone()


def _published_form_template_version(conn: Any, template_id: int, version_number: Optional[int]) -> Any:
    template_row = _get_form_template(conn, template_id)
    version_to_use = version_number if version_number is not None else template_row.active_version
    if version_to_use is None:
        raise HTTPException(status_code=400, detail="Template sem versao publicada para vincular.")
    version_row = _get_form_template_version(conn, template_id, int(version_to_use))
    if str(version_row.status) != "published":
        raise HTTPException(status_code=400, detail="Somente versoes publicadas podem ser vinculadas.")
    return version_row


def _form_template_payload(conn: Any, template_row: Any) -> Dict[str, Any]:
    versions_rows = conn.execute(
        select(field_form_template_version_table)
        .where(field_form_template_version_table.c.template_id == template_row.id)
        .order_by(field_form_template_version_table.c.version_number.asc())
    ).fetchall()
    versions = [
        {
            "id": row.id,
            "templateId": row.template_id,
            "version": row.version_number,
            "status": row.status,
            "schema": _json_loads(row.schema_json, {"sections": []}),
            "createdBy": row.created_by,
            "createdAt": _iso(row.created_at),
            "updatedAt": _iso(row.updated_at),
            "publishedAt": _iso(row.published_at),
        }
        for row in versions_rows
    ]
    latest_version = versions[-1]["version"] if versions else None
    active_schema = None
    if template_row.active_version is not None:
        active_row = next((item for item in versions if item["version"] == template_row.active_version), None)
        active_schema = active_row.get("schema") if active_row else None
    return {
        "id": template_row.id,
        "externalId": template_row.external_id,
        "name": template_row.name,
        "description": template_row.description,
        "status": template_row.status,
        "activeVersion": template_row.active_version,
        "latestVersion": latest_version,
        "createdBy": template_row.created_by,
        "createdAt": _iso(template_row.created_at),
        "updatedAt": _iso(template_row.updated_at),
        "schema": active_schema,
        "versions": versions,
    }


def _get_task_form_submission(conn: Any, task_id: int) -> Optional[Any]:
    return conn.execute(
        select(field_task_form_submission_table)
        .where(field_task_form_submission_table.c.task_id == task_id)
        .order_by(field_task_form_submission_table.c.updated_at.desc())
        .limit(1)
    ).fetchone()


def _add_history(conn: Any, task_id: int, prev: Optional[str], new: str, by: str, note: Optional[str]) -> None:
    conn.execute(
        insert(field_task_status_history_table).values(
            task_id=task_id,
            previous_status=prev,
            new_status=new,
            changed_by=by,
            changed_at=datetime.utcnow(),
            note=note,
        )
    )


def _agent_context(request: Request) -> Dict[str, Any]:
    auth = request.headers.get("authorization") or ""
    if not auth.lower().startswith("bearer "):
        return {}
    token = auth.split(" ", 1)[1].strip()
    session = agent_sessions.get(token)
    if not session or session["expires_at"] <= datetime.utcnow():
        return {}
    return session


router = APIRouter(prefix="/api/field-dispatch", tags=["Field Dispatch"])
field_forms_router = APIRouter(prefix="/api/field-forms", tags=["Field Forms"])


class AgentLoginRequest(BaseModel):
    userId: str
    password: str


class AgentCreateRequest(BaseModel):
    userId: str = Field(..., min_length=3, max_length=80)
    name: str = Field(..., min_length=3, max_length=200)
    phone: Optional[str] = Field(default=None, max_length=40)
    password: str = Field(..., min_length=4, max_length=120)
    operationalStatus: str = Field(default="available", max_length=40)


class FormConditionalRule(BaseModel):
    sourceFieldId: str
    operator: str = Field(default="equals")
    value: Any = None


class FormSchemaField(BaseModel):
    id: str
    type: str = Field(default="text")
    label: str
    required: bool = False
    placeholder: Optional[str] = None
    helpText: Optional[str] = None
    options: Optional[List[Dict[str, str]]] = None
    validation: Optional[Dict[str, Any]] = None
    conditionalRule: Optional[FormConditionalRule] = None


class FormSchemaSection(BaseModel):
    id: str
    title: str
    fields: List[FormSchemaField] = Field(default_factory=list)


class FormTemplateCreateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(..., min_length=3, max_length=255)
    description: Optional[str] = None
    formSchema: Optional[Dict[str, Any]] = Field(default=None, alias="schema")


class FormTemplateUpdateRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    name: Optional[str] = Field(default=None, min_length=3, max_length=255)
    description: Optional[str] = None
    formSchema: Optional[Dict[str, Any]] = Field(default=None, alias="schema")


class TaskFormDraftRequest(BaseModel):
    answers: Dict[str, Any] = Field(default_factory=dict)


class TaskFormSubmitRequest(BaseModel):
    answers: Dict[str, Any] = Field(default_factory=dict)


class TaskCreateRequest(BaseModel):
    title: str = Field(..., min_length=3)
    description: Optional[str] = None
    category: str
    priority: str = Field(default="media", pattern="^(baixa|media|alta|critica)$")
    dueDate: Optional[date] = None
    assignedAgentId: Optional[int] = None
    instructions: Optional[str] = None
    geometry: Dict[str, Any]
    addressReference: Optional[str] = None
    initialStatus: str = "rascunho"
    formTemplateId: Optional[int] = None
    formTemplateVersion: Optional[int] = None
    formRequired: bool = False


class TaskUpdateRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    priority: Optional[str] = Field(default=None, pattern="^(baixa|media|alta|critica)$")
    dueDate: Optional[date] = None
    assignedAgentId: Optional[int] = None
    instructions: Optional[str] = None
    geometry: Optional[Dict[str, Any]] = None
    addressReference: Optional[str] = None
    resultSummary: Optional[str] = None
    formTemplateId: Optional[int] = None
    formTemplateVersion: Optional[int] = None
    formRequired: Optional[bool] = None


class TaskStatusRequest(BaseModel):
    newStatus: str
    note: Optional[str] = None
    resultSummary: Optional[str] = None
    force: bool = False


class LocationRequest(BaseModel):
    geometry: Dict[str, Any]
    accuracy: Optional[float] = None
    speed: Optional[float] = None
    heading: Optional[float] = None
    source: Optional[str] = "mobile_web"


class EvidenceRequest(BaseModel):
    type: str = "photo"
    fileUrl: str
    description: Optional[str] = None
    geometry: Optional[Dict[str, Any]] = None


class FieldDispatchMonthlyReportInterpretRequest(BaseModel):
    filtersApplied: Dict[str, Any]
    summary: Dict[str, Any]
    breakdowns: Dict[str, Any]


@router.get("/health")
async def field_dispatch_health():
    _ensure_schema()
    return {"ok": True, "dbSource": db_source}


@router.get("/agents")
async def list_agents(request: Request):
    _ensure_schema()
    ctx = _user_context(request)
    _require_roles(ctx, {ROLE_ADMIN, ROLE_DISPATCHER, ROLE_SUPERVISOR})
    with engine.connect() as conn:
        rows = conn.execute(select(field_agent_table).order_by(field_agent_table.c.name.asc())).fetchall()
    return [_agent_dict(row) for row in rows]


@router.post("/agents")
async def create_agent(payload: AgentCreateRequest, request: Request):
    _ensure_schema()
    ctx = _user_context(request)
    _require_roles(ctx, {ROLE_ADMIN, ROLE_DISPATCHER, ROLE_SUPERVISOR})

    user_id = payload.userId.strip()
    name = payload.name.strip()
    phone = payload.phone.strip() if payload.phone else None
    password = payload.password.strip()
    operational_status = payload.operationalStatus.strip() or "available"

    if not user_id:
        raise HTTPException(status_code=400, detail="userId do agente e obrigatorio.")
    if not name:
        raise HTTPException(status_code=400, detail="Nome do agente e obrigatorio.")
    if not password:
        raise HTTPException(status_code=400, detail="Senha inicial do agente e obrigatoria.")

    with engine.begin() as conn:
        existing = conn.execute(
            select(field_agent_table.c.id)
            .where(field_agent_table.c.user_id == user_id)
            .limit(1)
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail="Ja existe responsavel com este usuario.")

        res = conn.execute(
            insert(field_agent_table).values(
                user_id=user_id,
                name=name,
                phone=phone,
                role=ROLE_AGENT,
                operational_status=operational_status,
                auth_secret=password,
                created_at=datetime.utcnow(),
            )
        )
        created = _get_agent(conn, int(res.inserted_primary_key[0]))
    return _agent_dict(created)


@router.post("/agents/login")
async def agent_login(payload: AgentLoginRequest):
    _ensure_schema()
    normalized_user_id = payload.userId.strip().lower()
    normalized_password = payload.password.strip()
    with engine.connect() as conn:
        row = conn.execute(
            select(field_agent_table).where(func.lower(field_agent_table.c.user_id) == normalized_user_id)
        ).fetchone()
    if not row or row.auth_secret != normalized_password:
        raise HTTPException(status_code=401, detail="Credenciais invalidas.")
    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(hours=12)
    agent_sessions[token] = {"agent_id": int(row.id), "user_id": row.user_id, "expires_at": expires}
    return {"token": token, "expiresAt": expires.isoformat(), "agent": _agent_dict(row)}


@router.post("/tasks")
async def create_task(payload: TaskCreateRequest, request: Request):
    _ensure_schema()
    ctx = _user_context(request)
    _require_roles(ctx, {ROLE_ADMIN, ROLE_DISPATCHER})

    initial_status = _validate_status(payload.initialStatus)
    if initial_status not in {"rascunho", "despachada"}:
        raise HTTPException(status_code=400, detail="initialStatus deve ser rascunho ou despachada.")

    now = datetime.utcnow()
    task_values: Dict[str, Any] = {
        "external_id": str(uuid.uuid4()),
        "title": payload.title,
        "description": payload.description,
        "category": payload.category,
        "priority": payload.priority,
        "status": initial_status,
        "created_at": now,
        "updated_at": now,
        "dispatched_at": now if initial_status == "despachada" else None,
        "created_by": ctx["user_id"],
        "assigned_agent_id": payload.assignedAgentId,
        "geometry_json": _json_dumps(payload.geometry),
        "address_reference": payload.addressReference,
        "instructions": payload.instructions,
        "due_date": payload.dueDate,
        "form_template_id": None,
        "form_template_version": None,
        "form_required": bool(payload.formRequired),
    }
    with engine.begin() as conn:
        if payload.assignedAgentId is not None:
            _get_agent(conn, payload.assignedAgentId)
        if payload.formTemplateId is not None:
            version_row = _published_form_template_version(
                conn,
                int(payload.formTemplateId),
                int(payload.formTemplateVersion) if payload.formTemplateVersion is not None else None,
            )
            task_values["form_template_id"] = int(version_row.template_id)
            task_values["form_template_version"] = int(version_row.version_number)
        elif payload.formRequired:
            raise HTTPException(status_code=400, detail="Formulario obrigatorio requer template vinculado.")
        insert_result = conn.execute(insert(field_task_table).values(**task_values))
        task_id = int(insert_result.inserted_primary_key[0])
        _add_history(conn, task_id, None, initial_status, ctx["user_id"], "Criacao da atividade")
        row = _get_task(conn, task_id)
        history = _history(conn, task_id)
    return _task_dict(row, history=history)


@router.put("/tasks/{task_id}")
async def update_task(task_id: int, payload: TaskUpdateRequest, request: Request):
    _ensure_schema()
    ctx = _user_context(request)
    _require_roles(ctx, {ROLE_ADMIN, ROLE_DISPATCHER})

    with engine.begin() as conn:
        row = _get_task(conn, task_id)
        if row.status in {"concluida", "cancelada"}:
            raise HTTPException(status_code=400, detail="Atividade finalizada nao pode ser editada.")
        update_values: Dict[str, Any] = {"updated_at": datetime.utcnow()}
        if payload.title is not None:
            update_values["title"] = payload.title
        if payload.description is not None:
            update_values["description"] = payload.description
        if payload.category is not None:
            update_values["category"] = payload.category
        if payload.priority is not None:
            update_values["priority"] = payload.priority
        if payload.dueDate is not None:
            update_values["due_date"] = payload.dueDate
        if payload.assignedAgentId is not None:
            _get_agent(conn, payload.assignedAgentId)
            update_values["assigned_agent_id"] = payload.assignedAgentId
        if payload.instructions is not None:
            update_values["instructions"] = payload.instructions
        if payload.geometry is not None:
            update_values["geometry_json"] = _json_dumps(payload.geometry)
        if payload.addressReference is not None:
            update_values["address_reference"] = payload.addressReference
        if payload.resultSummary is not None:
            update_values["result_summary"] = payload.resultSummary
        provided_fields = set(payload.model_fields_set)
        if "formTemplateId" in provided_fields:
            if payload.formTemplateId is None:
                update_values["form_template_id"] = None
                update_values["form_template_version"] = None
            else:
                version_row = _published_form_template_version(
                    conn,
                    int(payload.formTemplateId),
                    int(payload.formTemplateVersion) if payload.formTemplateVersion is not None else None,
                )
                update_values["form_template_id"] = int(version_row.template_id)
                update_values["form_template_version"] = int(version_row.version_number)
        elif "formTemplateVersion" in provided_fields:
            raise HTTPException(status_code=400, detail="formTemplateVersion requer formTemplateId.")
        if payload.formRequired is not None:
            update_values["form_required"] = bool(payload.formRequired)
            pending_template_id = update_values.get("form_template_id", row.form_template_id)
            if bool(payload.formRequired) and pending_template_id is None:
                raise HTTPException(status_code=400, detail="Formulario obrigatorio requer template vinculado.")
        conn.execute(update(field_task_table).where(field_task_table.c.id == task_id).values(**update_values))
        refreshed = _get_task(conn, task_id)
        history = _history(conn, task_id)
    return _task_dict(refreshed, history=history)


@router.post("/tasks/{task_id}/dispatch")
async def dispatch_task(task_id: int, request: Request):
    _ensure_schema()
    ctx = _user_context(request)
    _require_roles(ctx, {ROLE_ADMIN, ROLE_DISPATCHER})
    with engine.begin() as conn:
        row = _get_task(conn, task_id)
        if row.assigned_agent_id is None:
            raise HTTPException(status_code=400, detail="Atribua um agente antes do despacho.")
        _assert_transition(str(row.status), "despachada", force=ctx["role"] == ROLE_ADMIN)
        conn.execute(
            update(field_task_table)
            .where(field_task_table.c.id == task_id)
            .values(status="despachada", dispatched_at=datetime.utcnow(), updated_at=datetime.utcnow())
        )
        _add_history(conn, task_id, str(row.status), "despachada", ctx["user_id"], "Despacho operacional")
        refreshed = _get_task(conn, task_id)
        history = _history(conn, task_id)
    return _task_dict(refreshed, history=history)


@router.get("/tasks")
async def list_tasks(
    request: Request,
    status: Optional[str] = None,
    agentId: Optional[int] = None,
    priority: Optional[str] = None,
    category: Optional[str] = None,
    dateFrom: Optional[date] = None,
    dateTo: Optional[date] = None,
):
    _ensure_schema()
    ctx = _user_context(request)
    _require_roles(ctx, {ROLE_ADMIN, ROLE_DISPATCHER, ROLE_SUPERVISOR, ROLE_AGENT})
    filters = []
    if status:
        filters.append(field_task_table.c.status == _validate_status(status))
    if agentId is not None:
        filters.append(field_task_table.c.assigned_agent_id == agentId)
    if priority:
        filters.append(field_task_table.c.priority == priority)
    if category:
        filters.append(field_task_table.c.category == category)
    if dateFrom:
        filters.append(field_task_table.c.created_at >= datetime.combine(dateFrom, datetime.min.time()))
    if dateTo:
        filters.append(field_task_table.c.created_at <= datetime.combine(dateTo, datetime.max.time()))
    if ctx["role"] == ROLE_AGENT:
        try:
            filters.append(field_task_table.c.assigned_agent_id == int(ctx["user_id"]))
        except Exception:
            filters.append(field_task_table.c.id == -1)
    query = select(field_task_table).order_by(desc(field_task_table.c.created_at))
    if filters:
        query = query.where(and_(*filters))
    with engine.connect() as conn:
        rows = conn.execute(query).fetchall()
    items = [_task_dict(row, history=[]) for row in rows]
    return {"items": items, "total": len(items)}


@router.get("/reports/monthly")
async def get_monthly_report(
    request: Request,
    month: int,
    year: int,
    timeBasis: str = "createdAt",
    category: Optional[str] = None,
    status: Optional[str] = None,
    priority: Optional[str] = None,
    agentId: Optional[int] = None,
    createdBy: Optional[str] = None,
    dueDateFrom: Optional[date] = None,
    dueDateTo: Optional[date] = None,
    overdueState: str = "all",
    hasForm: Optional[bool] = None,
    formRequired: Optional[bool] = None,
    formSubmitted: Optional[bool] = None,
    hasEvidence: Optional[bool] = None,
    search: Optional[str] = None,
):
    _ensure_schema()
    ctx = _user_context(request)
    _require_roles(ctx, {ROLE_ADMIN, ROLE_DISPATCHER, ROLE_SUPERVISOR})

    if month < 1 or month > 12:
        raise HTTPException(status_code=400, detail="Mes invalido.")
    if year < 2000 or year > 2100:
        raise HTTPException(status_code=400, detail="Ano invalido.")
    if timeBasis not in MONTHLY_REPORT_TIME_BASIS_FIELDS:
        raise HTTPException(status_code=400, detail="timeBasis invalido.")
    if overdueState not in MONTHLY_REPORT_OVERDUE_STATES:
        raise HTTPException(status_code=400, detail="overdueState invalido.")

    base_filters = []
    if category:
        base_filters.append(field_task_table.c.category == category)
    if status:
        base_filters.append(field_task_table.c.status == _validate_status(status))
    if priority:
        base_filters.append(field_task_table.c.priority == priority)
    if agentId is not None:
        base_filters.append(field_task_table.c.assigned_agent_id == agentId)
    if createdBy:
        base_filters.append(field_task_table.c.created_by == createdBy)
    if dueDateFrom:
        base_filters.append(field_task_table.c.due_date >= dueDateFrom)
    if dueDateTo:
        base_filters.append(field_task_table.c.due_date <= dueDateTo)
    if hasForm is True:
        base_filters.append(field_task_table.c.form_template_id.is_not(None))
    elif hasForm is False:
        base_filters.append(field_task_table.c.form_template_id.is_(None))
    if formRequired is not None:
        base_filters.append(field_task_table.c.form_required == formRequired)

    tasks_query = select(field_task_table).order_by(desc(field_task_table.c.created_at))
    if base_filters:
        tasks_query = tasks_query.where(and_(*base_filters))

    with engine.connect() as conn:
        task_rows = conn.execute(tasks_query).fetchall()
        task_ids = [int(row.id) for row in task_rows]

        agent_rows = conn.execute(select(field_agent_table)).fetchall()
        agent_names_by_id = {int(row.id): str(row.name) for row in agent_rows}

        histories_by_task_id: Dict[int, List[Dict[str, Any]]] = {task_id: [] for task_id in task_ids}
        evidence_by_task_id: Dict[int, int] = {task_id: 0 for task_id in task_ids}
        submissions_by_task_id: Dict[int, Dict[str, Any]] = {}

        if task_ids:
            history_rows = conn.execute(
                select(field_task_status_history_table)
                .where(field_task_status_history_table.c.task_id.in_(task_ids))
                .order_by(
                    field_task_status_history_table.c.task_id.asc(),
                    field_task_status_history_table.c.changed_at.asc(),
                )
            ).fetchall()
            for row in history_rows:
                histories_by_task_id[int(row.task_id)].append(
                    {
                        "id": row.id,
                        "taskId": row.task_id,
                        "previousStatus": row.previous_status,
                        "newStatus": row.new_status,
                        "changedBy": row.changed_by,
                        "changedAt": _iso(row.changed_at),
                        "note": row.note,
                    }
                )

            evidence_rows = conn.execute(
                select(field_evidence_table.c.task_id)
                .where(field_evidence_table.c.task_id.in_(task_ids))
            ).fetchall()
            for row in evidence_rows:
                evidence_by_task_id[int(row.task_id)] = evidence_by_task_id.get(int(row.task_id), 0) + 1

            submission_rows = conn.execute(
                select(field_task_form_submission_table)
                .where(field_task_form_submission_table.c.task_id.in_(task_ids))
                .order_by(
                    field_task_form_submission_table.c.task_id.asc(),
                    field_task_form_submission_table.c.updated_at.desc(),
                )
            ).fetchall()
            for row in submission_rows:
                task_id = int(row.task_id)
                if task_id in submissions_by_task_id:
                    continue
                submissions_by_task_id[task_id] = {
                    "id": row.id,
                    "status": row.status,
                    "updatedAt": _iso(row.updated_at),
                    "submittedAt": _iso(row.submitted_at),
                }

    tasks_payload = [_task_dict(row, history=[]) for row in task_rows]
    try:
        return build_field_dispatch_monthly_report(
            tasks=tasks_payload,
            histories_by_task_id=histories_by_task_id,
            evidence_by_task_id=evidence_by_task_id,
            submissions_by_task_id=submissions_by_task_id,
            agent_names_by_id=agent_names_by_id,
            filters={
                "month": month,
                "year": year,
                "timeBasis": timeBasis,
                "category": category,
                "status": status,
                "priority": priority,
                "agentId": agentId,
                "createdBy": createdBy,
                "dueDateFrom": _iso(dueDateFrom),
                "dueDateTo": _iso(dueDateTo),
                "overdueState": overdueState,
                "hasForm": hasForm,
                "formRequired": formRequired,
                "formSubmitted": formSubmitted,
                "hasEvidence": hasEvidence,
                "search": search,
            },
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/reports/monthly/interpret")
async def interpret_monthly_report(
    payload: FieldDispatchMonthlyReportInterpretRequest,
    request: Request,
):
    _ensure_schema()
    ctx = _user_context(request)
    _require_roles(ctx, {ROLE_ADMIN, ROLE_DISPATCHER, ROLE_SUPERVISOR})

    interpretation, source = await interpret_field_dispatch_monthly_report(payload.model_dump())
    return {"interpretation": interpretation, "source": source}


@router.get("/tasks/{task_id}")
async def get_task(task_id: int, request: Request):
    _ensure_schema()
    ctx = _user_context(request)
    agent_ctx = _agent_context(request)
    with engine.connect() as conn:
        row = _get_task(conn, task_id)
        if ctx["role"] == ROLE_AGENT:
            current_agent = agent_ctx.get("agent_id")
            if current_agent is None:
                try:
                    current_agent = int(ctx["user_id"])
                except Exception:
                    current_agent = -1
            if row.assigned_agent_id != current_agent:
                raise HTTPException(status_code=403, detail="Agente so pode acessar tarefas atribuidas.")
        history = _history(conn, task_id)
    return _task_dict(row, history=history)


@router.get("/tasks/{task_id}/history")
async def get_task_history(task_id: int, request: Request):
    _ensure_schema()
    _ = _user_context(request)
    with engine.connect() as conn:
        _get_task(conn, task_id)
        return _history(conn, task_id)


@router.patch("/tasks/{task_id}/status")
async def update_task_status(task_id: int, payload: TaskStatusRequest, request: Request):
    _ensure_schema()
    ctx = _user_context(request)
    agent_ctx = _agent_context(request)
    new_status = _validate_status(payload.newStatus)
    with engine.begin() as conn:
        row = _get_task(conn, task_id)
        if ctx["role"] == ROLE_AGENT:
            current_agent = agent_ctx.get("agent_id")
            if current_agent is None:
                try:
                    current_agent = int(ctx["user_id"])
                except Exception:
                    current_agent = -1
            if row.assigned_agent_id != current_agent:
                raise HTTPException(status_code=403, detail="Agente nao autorizado para esta tarefa.")
        if new_status == "concluida" and bool(row.form_required):
            if row.form_template_id is None or row.form_template_version is None:
                raise HTTPException(status_code=400, detail="Tarefa configurada com formulario obrigatorio invalido.")
            submission_row = _get_task_form_submission(conn, task_id)
            if not submission_row or str(submission_row.status) != "submitted":
                raise HTTPException(
                    status_code=400,
                    detail="Formulario obrigatorio pendente. Envie o formulario antes de concluir a atividade.",
                )
        _assert_transition(str(row.status), new_status, force=(payload.force and ctx["role"] == ROLE_ADMIN))
        update_values: Dict[str, Any] = {"status": new_status, "updated_at": datetime.utcnow()}
        if payload.resultSummary is not None:
            update_values["result_summary"] = payload.resultSummary
        ts_field = STATUS_TS_FIELD.get(new_status)
        if ts_field:
            update_values[ts_field] = datetime.utcnow()
        if new_status == "cancelada":
            update_values["cancel_reason"] = payload.note
        conn.execute(update(field_task_table).where(field_task_table.c.id == task_id).values(**update_values))
        changed_by = str(agent_ctx.get("user_id") or ctx["user_id"])
        _add_history(conn, task_id, str(row.status), new_status, changed_by, payload.note)
        refreshed = _get_task(conn, task_id)
        history = _history(conn, task_id)
    return _task_dict(refreshed, history=history)


@router.post("/tasks/{task_id}/reassign")
async def reassign_task(task_id: int, payload: Dict[str, Any], request: Request):
    _ensure_schema()
    ctx = _user_context(request)
    _require_roles(ctx, {ROLE_ADMIN, ROLE_DISPATCHER})
    assigned_agent_id = int(payload.get("assignedAgentId"))
    note = str(payload.get("note") or "")
    with engine.begin() as conn:
        _get_agent(conn, assigned_agent_id)
        row = _get_task(conn, task_id)
        if row.status in {"concluida", "cancelada"}:
            raise HTTPException(status_code=400, detail="Nao e possivel reatribuir tarefa finalizada.")
        conn.execute(
            update(field_task_table)
            .where(field_task_table.c.id == task_id)
            .values(assigned_agent_id=assigned_agent_id, updated_at=datetime.utcnow())
        )
        _add_history(
            conn,
            task_id,
            str(row.status),
            str(row.status),
            ctx["user_id"],
            note or f"Tarefa reatribuida para agente {assigned_agent_id}",
        )
        refreshed = _get_task(conn, task_id)
        history = _history(conn, task_id)
    return _task_dict(refreshed, history=history)


@router.post("/tasks/{task_id}/cancel")
async def cancel_task(task_id: int, payload: Dict[str, Any], request: Request):
    _ensure_schema()
    ctx = _user_context(request)
    _require_roles(ctx, {ROLE_ADMIN, ROLE_DISPATCHER})
    note = str(payload.get("note") or "Cancelada pelo despachante")
    with engine.begin() as conn:
        row = _get_task(conn, task_id)
        if row.status in {"concluida", "cancelada"}:
            raise HTTPException(status_code=400, detail="Tarefa ja finalizada.")
        conn.execute(
            update(field_task_table)
            .where(field_task_table.c.id == task_id)
            .values(
                status="cancelada",
                canceled_at=datetime.utcnow(),
                cancel_reason=note,
                updated_at=datetime.utcnow(),
            )
        )
        _add_history(conn, task_id, str(row.status), "cancelada", ctx["user_id"], note)
        refreshed = _get_task(conn, task_id)
        history = _history(conn, task_id)
    return _task_dict(refreshed, history=history)


@router.get("/agents/{agent_id}/tasks")
async def list_agent_tasks(agent_id: int, request: Request, includeClosed: bool = False):
    _ensure_schema()
    ctx = _user_context(request)
    agent_ctx = _agent_context(request)
    if ctx["role"] == ROLE_AGENT:
        token_agent = agent_ctx.get("agent_id")
        if token_agent is None:
            try:
                token_agent = int(ctx["user_id"])
            except Exception:
                token_agent = -1
        if token_agent != agent_id:
            raise HTTPException(status_code=403, detail="Agente nao pode acessar tarefas de outro agente.")
    with engine.connect() as conn:
        query = select(field_task_table).where(field_task_table.c.assigned_agent_id == agent_id)
        if not includeClosed:
            query = query.where(field_task_table.c.status.not_in(["concluida", "cancelada", "recusada"]))
        query = query.order_by(desc(field_task_table.c.updated_at))
        rows = conn.execute(query).fetchall()
    return [_task_dict(row, history=[]) for row in rows]


@router.post("/tasks/{task_id}/location")
async def send_location(task_id: int, payload: LocationRequest, request: Request):
    _ensure_schema()
    ctx = _user_context(request)
    agent_ctx = _agent_context(request)
    with engine.begin() as conn:
        row = _get_task(conn, task_id)
        agent_id = row.assigned_agent_id
        if ctx["role"] == ROLE_AGENT:
            token_agent = agent_ctx.get("agent_id")
            if token_agent is None:
                try:
                    token_agent = int(ctx["user_id"])
                except Exception:
                    token_agent = -1
            if row.assigned_agent_id != token_agent:
                raise HTTPException(status_code=403, detail="Agente nao autorizado para rastreamento.")
            agent_id = token_agent
        if agent_id is None:
            raise HTTPException(status_code=400, detail="Tarefa sem agente atribuido.")
        timestamp = datetime.utcnow()
        conn.execute(
            insert(agent_location_table).values(
                agent_id=agent_id,
                task_id=task_id,
                geometry_json=_json_dumps(payload.geometry),
                timestamp=timestamp,
                accuracy=payload.accuracy,
                speed=payload.speed,
                heading=payload.heading,
                source=payload.source or "mobile_web",
            )
        )
        conn.execute(
            update(field_agent_table)
            .where(field_agent_table.c.id == agent_id)
            .values(last_known_location_json=_json_dumps(payload.geometry), last_seen_at=timestamp)
        )
    return {"ok": True, "timestamp": timestamp.isoformat()}


@router.get("/tasks/{task_id}/tracking")
async def task_tracking(task_id: int, request: Request, limit: int = 120):
    _ensure_schema()
    ctx = _user_context(request)
    agent_ctx = _agent_context(request)
    with engine.connect() as conn:
        row = _get_task(conn, task_id)
        if ctx["role"] == ROLE_AGENT:
            token_agent = agent_ctx.get("agent_id")
            if token_agent is None:
                try:
                    token_agent = int(ctx["user_id"])
                except Exception:
                    token_agent = -1
            if row.assigned_agent_id != token_agent:
                raise HTTPException(status_code=403, detail="Agente nao autorizado para essa tarefa.")
        points_rows = conn.execute(
            select(agent_location_table)
            .where(agent_location_table.c.task_id == task_id)
            .order_by(agent_location_table.c.timestamp.asc())
            .limit(max(10, min(limit, 1000)))
        ).fetchall()
    points = [
        {
            "agentId": p.agent_id,
            "taskId": p.task_id,
            "geometry": _json_loads(p.geometry_json, default={}),
            "timestamp": _iso(p.timestamp),
            "accuracy": p.accuracy,
            "speed": p.speed,
            "heading": p.heading,
            "source": p.source,
        }
        for p in points_rows
    ]
    return {
        "lastLocation": points[-1] if points else None,
        "trajectory": points,
        "lastUpdateAt": points[-1]["timestamp"] if points else None,
    }


@router.post("/tasks/{task_id}/evidence/upload")
async def upload_evidence(task_id: int, request: Request, file: UploadFile = File(...)):
    _ensure_schema()
    _ = _user_context(request)
    with engine.connect() as conn:
        _get_task(conn, task_id)
    ext = Path(file.filename or "").suffix or ".bin"
    filename = f"{datetime.utcnow().strftime('%Y%m%d%H%M%S')}_{uuid.uuid4().hex}{ext}"
    target = uploads_dir / filename
    content = await file.read()
    target.write_bytes(content)
    return {"fileUrl": f"/uploads/field-dispatch/{filename}", "sizeBytes": len(content)}


@router.post("/tasks/{task_id}/evidence")
async def create_evidence(task_id: int, payload: EvidenceRequest, request: Request):
    _ensure_schema()
    ctx = _user_context(request)
    agent_ctx = _agent_context(request)
    with engine.begin() as conn:
        task_row = _get_task(conn, task_id)
        agent_id = task_row.assigned_agent_id
        if ctx["role"] == ROLE_AGENT:
            token_agent = agent_ctx.get("agent_id")
            if token_agent is None:
                try:
                    token_agent = int(ctx["user_id"])
                except Exception:
                    token_agent = -1
            if task_row.assigned_agent_id != token_agent:
                raise HTTPException(status_code=403, detail="Agente nao autorizado para anexar evidencia.")
            agent_id = token_agent
        if agent_id is None:
            raise HTTPException(status_code=400, detail="Tarefa sem agente atribuido.")
        res = conn.execute(
            insert(field_evidence_table).values(
                task_id=task_id,
                agent_id=agent_id,
                type=payload.type,
                file_url=payload.fileUrl,
                description=payload.description,
                geometry_json=_json_dumps(payload.geometry) if payload.geometry else None,
                timestamp=datetime.utcnow(),
            )
        )
        evidence_id = int(res.inserted_primary_key[0])
        row = conn.execute(select(field_evidence_table).where(field_evidence_table.c.id == evidence_id)).fetchone()
    return {
        "id": row.id,
        "taskId": row.task_id,
        "agentId": row.agent_id,
        "type": row.type,
        "fileUrl": row.file_url,
        "description": row.description,
        "geometry": _json_loads(row.geometry_json, default=None),
        "timestamp": _iso(row.timestamp),
    }


@router.get("/tasks/{task_id}/evidence")
async def list_evidence(task_id: int, request: Request):
    _ensure_schema()
    _ = _user_context(request)
    with engine.connect() as conn:
        _get_task(conn, task_id)
        rows = conn.execute(
            select(field_evidence_table)
            .where(field_evidence_table.c.task_id == task_id)
            .order_by(desc(field_evidence_table.c.timestamp))
        ).fetchall()
    return [
        {
            "id": row.id,
            "taskId": row.task_id,
            "agentId": row.agent_id,
            "type": row.type,
            "fileUrl": row.file_url,
            "description": row.description,
            "geometry": _json_loads(row.geometry_json, default=None),
            "timestamp": _iso(row.timestamp),
        }
        for row in rows
    ]


@field_forms_router.get("/templates")
async def list_form_templates(
    request: Request,
    status: Optional[str] = None,
    search: Optional[str] = None,
):
    _ensure_schema()
    ctx = _user_context(request)
    _require_roles(ctx, {ROLE_ADMIN, ROLE_DISPATCHER, ROLE_SUPERVISOR})
    query = select(field_form_template_table).order_by(desc(field_form_template_table.c.updated_at))
    filters = []
    if status:
        normalized = str(status).strip().lower()
        if normalized not in FORM_TEMPLATE_STATUSES:
            raise HTTPException(status_code=400, detail="Status de template invalido.")
        filters.append(field_form_template_table.c.status == normalized)
    if search:
        normalized_search = f"%{search.strip()}%"
        filters.append(field_form_template_table.c.name.ilike(normalized_search))
    if filters:
        query = query.where(and_(*filters))

    with engine.connect() as conn:
        rows = conn.execute(query).fetchall()
        items = [_form_template_payload(conn, row) for row in rows]
    return {"items": items, "total": len(items)}


@field_forms_router.post("/templates")
async def create_form_template(payload: FormTemplateCreateRequest, request: Request):
    _ensure_schema()
    ctx = _user_context(request)
    _require_roles(ctx, {ROLE_ADMIN, ROLE_DISPATCHER})
    schema = _normalize_form_schema(payload.formSchema)
    now = datetime.utcnow()
    with engine.begin() as conn:
        create_res = conn.execute(
            insert(field_form_template_table).values(
                external_id=str(uuid.uuid4()),
                name=payload.name.strip(),
                description=payload.description,
                status="draft",
                active_version=None,
                created_by=ctx["user_id"],
                created_at=now,
                updated_at=now,
            )
        )
        template_id = int(create_res.inserted_primary_key[0])
        conn.execute(
            insert(field_form_template_version_table).values(
                template_id=template_id,
                version_number=1,
                status="draft",
                schema_json=_json_dumps(schema),
                created_by=ctx["user_id"],
                created_at=now,
                updated_at=now,
                published_at=None,
            )
        )
        row = _get_form_template(conn, template_id)
        return _form_template_payload(conn, row)


@field_forms_router.get("/templates/{template_id}")
async def get_form_template(template_id: int, request: Request):
    _ensure_schema()
    ctx = _user_context(request)
    _require_roles(ctx, {ROLE_ADMIN, ROLE_DISPATCHER, ROLE_SUPERVISOR})
    with engine.connect() as conn:
        row = _get_form_template(conn, template_id)
        return _form_template_payload(conn, row)


@field_forms_router.put("/templates/{template_id}")
async def update_form_template(template_id: int, payload: FormTemplateUpdateRequest, request: Request):
    _ensure_schema()
    ctx = _user_context(request)
    _require_roles(ctx, {ROLE_ADMIN, ROLE_DISPATCHER})
    now = datetime.utcnow()
    with engine.begin() as conn:
        template_row = _get_form_template(conn, template_id)
        if str(template_row.status) == "archived":
            raise HTTPException(status_code=400, detail="Template arquivado nao pode ser alterado.")
        latest_version = _latest_form_template_version(conn, template_id)
        if latest_version is None:
            raise HTTPException(status_code=500, detail="Template sem versao inicial.")

        template_updates: Dict[str, Any] = {"updated_at": now}
        if payload.name is not None:
            template_updates["name"] = payload.name.strip()
        if payload.description is not None:
            template_updates["description"] = payload.description

        target_version_number = int(latest_version.version_number)
        if payload.formSchema is not None:
            schema = _normalize_form_schema(payload.formSchema)
            if str(latest_version.status) == "published":
                target_version_number = target_version_number + 1
                conn.execute(
                    insert(field_form_template_version_table).values(
                        template_id=template_id,
                        version_number=target_version_number,
                        status="draft",
                        schema_json=_json_dumps(schema),
                        created_by=ctx["user_id"],
                        created_at=now,
                        updated_at=now,
                        published_at=None,
                    )
                )
            else:
                conn.execute(
                    update(field_form_template_version_table)
                    .where(field_form_template_version_table.c.id == latest_version.id)
                    .values(schema_json=_json_dumps(schema), updated_at=now)
                )

        conn.execute(
            update(field_form_template_table)
            .where(field_form_template_table.c.id == template_id)
            .values(**template_updates)
        )
        refreshed = _get_form_template(conn, template_id)
        return _form_template_payload(conn, refreshed)


@field_forms_router.post("/templates/{template_id}/publish")
async def publish_form_template(template_id: int, request: Request):
    _ensure_schema()
    ctx = _user_context(request)
    _require_roles(ctx, {ROLE_ADMIN, ROLE_DISPATCHER})
    now = datetime.utcnow()
    with engine.begin() as conn:
        _get_form_template(conn, template_id)
        latest = _latest_form_template_version(conn, template_id)
        if latest is None:
            raise HTTPException(status_code=400, detail="Template sem versoes para publicar.")
        if str(latest.status) == "archived":
            raise HTTPException(status_code=400, detail="Ultima versao arquivada nao pode ser publicada.")
        conn.execute(
            update(field_form_template_version_table)
            .where(
                field_form_template_version_table.c.template_id == template_id,
                field_form_template_version_table.c.version_number == latest.version_number,
            )
            .values(status="published", published_at=now, updated_at=now)
        )
        conn.execute(
            update(field_form_template_table)
            .where(field_form_template_table.c.id == template_id)
            .values(status="published", active_version=int(latest.version_number), updated_at=now)
        )
        refreshed = _get_form_template(conn, template_id)
        return _form_template_payload(conn, refreshed)


@field_forms_router.post("/templates/{template_id}/duplicate")
async def duplicate_form_template(template_id: int, request: Request):
    _ensure_schema()
    ctx = _user_context(request)
    _require_roles(ctx, {ROLE_ADMIN, ROLE_DISPATCHER})
    now = datetime.utcnow()
    with engine.begin() as conn:
        source_template = _get_form_template(conn, template_id)
        source_version = _latest_form_template_version(conn, template_id)
        source_schema = _json_loads(source_version.schema_json if source_version else None, {"sections": []})
        create_res = conn.execute(
            insert(field_form_template_table).values(
                external_id=str(uuid.uuid4()),
                name=f"{source_template.name} (copia)",
                description=source_template.description,
                status="draft",
                active_version=None,
                created_by=ctx["user_id"],
                created_at=now,
                updated_at=now,
            )
        )
        new_template_id = int(create_res.inserted_primary_key[0])
        conn.execute(
            insert(field_form_template_version_table).values(
                template_id=new_template_id,
                version_number=1,
                status="draft",
                schema_json=_json_dumps(source_schema),
                created_by=ctx["user_id"],
                created_at=now,
                updated_at=now,
                published_at=None,
            )
        )
        new_template = _get_form_template(conn, new_template_id)
        return _form_template_payload(conn, new_template)


@field_forms_router.post("/templates/{template_id}/archive")
async def archive_form_template(template_id: int, request: Request):
    _ensure_schema()
    ctx = _user_context(request)
    _require_roles(ctx, {ROLE_ADMIN, ROLE_DISPATCHER})
    now = datetime.utcnow()
    with engine.begin() as conn:
        _get_form_template(conn, template_id)
        conn.execute(
            update(field_form_template_table)
            .where(field_form_template_table.c.id == template_id)
            .values(status="archived", updated_at=now)
        )
        conn.execute(
            update(field_form_template_version_table)
            .where(
                field_form_template_version_table.c.template_id == template_id,
                field_form_template_version_table.c.status != "published",
            )
            .values(status="archived", updated_at=now)
        )
        archived = _get_form_template(conn, template_id)
        return _form_template_payload(conn, archived)


@router.get("/tasks/{task_id}/form")
async def get_task_form(task_id: int, request: Request):
    _ensure_schema()
    ctx = _user_context(request)
    agent_ctx = _agent_context(request)
    with engine.connect() as conn:
        row = _get_task(conn, task_id)
        if ctx["role"] == ROLE_AGENT:
            token_agent = agent_ctx.get("agent_id")
            if token_agent is None:
                try:
                    token_agent = int(ctx["user_id"])
                except Exception:
                    token_agent = -1
            if row.assigned_agent_id != token_agent:
                raise HTTPException(status_code=403, detail="Agente nao autorizado para esta tarefa.")
        if row.form_template_id is None:
            return {"taskId": task_id, "hasForm": False, "formRequired": bool(row.form_required)}
        template = _get_form_template(conn, int(row.form_template_id))
        version = _get_form_template_version(conn, int(row.form_template_id), int(row.form_template_version))
        submission = _get_task_form_submission(conn, task_id)
    return {
        "taskId": task_id,
        "hasForm": True,
        "formRequired": bool(row.form_required),
        "template": {
            "id": template.id,
            "name": template.name,
            "description": template.description,
            "status": template.status,
        },
        "version": int(version.version_number),
        "schema": _json_loads(version.schema_json, {"sections": []}),
        "submission": (
            {
                "id": submission.id,
                "status": submission.status,
                "answers": _json_loads(submission.submission_json, {}),
                "validationErrors": _json_loads(submission.validation_errors_json, []),
                "submittedBy": submission.submitted_by,
                "submittedAt": _iso(submission.submitted_at),
                "updatedAt": _iso(submission.updated_at),
            }
            if submission
            else None
        ),
    }


@router.post("/tasks/{task_id}/form/draft")
async def save_task_form_draft(task_id: int, payload: TaskFormDraftRequest, request: Request):
    _ensure_schema()
    ctx = _user_context(request)
    agent_ctx = _agent_context(request)
    actor = str(agent_ctx.get("user_id") or ctx["user_id"])
    now = datetime.utcnow()
    with engine.begin() as conn:
        row = _get_task(conn, task_id)
        if row.form_template_id is None or row.form_template_version is None:
            raise HTTPException(status_code=400, detail="Tarefa sem formulario vinculado.")
        if ctx["role"] == ROLE_AGENT:
            token_agent = agent_ctx.get("agent_id")
            if token_agent is None:
                try:
                    token_agent = int(ctx["user_id"])
                except Exception:
                    token_agent = -1
            if row.assigned_agent_id != token_agent:
                raise HTTPException(status_code=403, detail="Agente nao autorizado para esta tarefa.")

        existing = _get_task_form_submission(conn, task_id)
        schema_row = _get_form_template_version(conn, int(row.form_template_id), int(row.form_template_version))
        normalized_answers = payload.answers or {}
        validation_errors = _validate_form_answers(
            _json_loads(schema_row.schema_json, {"sections": []}),
            normalized_answers,
        )
        values = {
            "task_id": int(task_id),
            "template_id": int(row.form_template_id),
            "template_version": int(row.form_template_version),
            "status": "draft",
            "submission_json": _json_dumps(normalized_answers),
            "validation_errors_json": _json_dumps(validation_errors),
            "submitted_by": actor,
            "updated_at": now,
        }
        if existing:
            conn.execute(
                update(field_task_form_submission_table)
                .where(field_task_form_submission_table.c.id == existing.id)
                .values(**values)
            )
            submission_id = int(existing.id)
        else:
            insert_values = {**values, "created_at": now, "submitted_at": None}
            res = conn.execute(insert(field_task_form_submission_table).values(**insert_values))
            submission_id = int(res.inserted_primary_key[0])
        submission = conn.execute(
            select(field_task_form_submission_table).where(field_task_form_submission_table.c.id == submission_id)
        ).fetchone()
    return {
        "id": submission.id,
        "taskId": submission.task_id,
        "status": submission.status,
        "answers": _json_loads(submission.submission_json, {}),
        "validationErrors": _json_loads(submission.validation_errors_json, []),
        "submittedBy": submission.submitted_by,
        "submittedAt": _iso(submission.submitted_at),
        "updatedAt": _iso(submission.updated_at),
    }


@router.post("/tasks/{task_id}/form/submit")
async def submit_task_form(task_id: int, payload: TaskFormSubmitRequest, request: Request):
    _ensure_schema()
    ctx = _user_context(request)
    agent_ctx = _agent_context(request)
    actor = str(agent_ctx.get("user_id") or ctx["user_id"])
    now = datetime.utcnow()
    with engine.begin() as conn:
        row = _get_task(conn, task_id)
        if row.form_template_id is None or row.form_template_version is None:
            raise HTTPException(status_code=400, detail="Tarefa sem formulario vinculado.")
        if ctx["role"] == ROLE_AGENT:
            token_agent = agent_ctx.get("agent_id")
            if token_agent is None:
                try:
                    token_agent = int(ctx["user_id"])
                except Exception:
                    token_agent = -1
            if row.assigned_agent_id != token_agent:
                raise HTTPException(status_code=403, detail="Agente nao autorizado para esta tarefa.")

        schema_row = _get_form_template_version(conn, int(row.form_template_id), int(row.form_template_version))
        answers = payload.answers or {}
        validation_errors = _validate_form_answers(
            _json_loads(schema_row.schema_json, {"sections": []}),
            answers,
        )
        if validation_errors:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "Formulario invalido.",
                    "validationErrors": validation_errors,
                },
            )
        existing = _get_task_form_submission(conn, task_id)
        values = {
            "task_id": int(task_id),
            "template_id": int(row.form_template_id),
            "template_version": int(row.form_template_version),
            "status": "submitted",
            "submission_json": _json_dumps(answers),
            "validation_errors_json": _json_dumps([]),
            "submitted_by": actor,
            "updated_at": now,
            "submitted_at": now,
        }
        if existing:
            conn.execute(
                update(field_task_form_submission_table)
                .where(field_task_form_submission_table.c.id == existing.id)
                .values(**values)
            )
            submission_id = int(existing.id)
        else:
            insert_values = {**values, "created_at": now}
            res = conn.execute(insert(field_task_form_submission_table).values(**insert_values))
            submission_id = int(res.inserted_primary_key[0])
        submission = conn.execute(
            select(field_task_form_submission_table).where(field_task_form_submission_table.c.id == submission_id)
        ).fetchone()
    return {
        "id": submission.id,
        "taskId": submission.task_id,
        "status": submission.status,
        "answers": _json_loads(submission.submission_json, {}),
        "validationErrors": _json_loads(submission.validation_errors_json, []),
        "submittedBy": submission.submitted_by,
        "submittedAt": _iso(submission.submitted_at),
        "updatedAt": _iso(submission.updated_at),
    }
