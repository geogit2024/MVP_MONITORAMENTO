import importlib
import sys
from datetime import date, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.fixture
def dispatch_client(monkeypatch, tmp_path):
    db_path = tmp_path / "field_dispatch_test.db"
    monkeypatch.setenv("DATABASE_URL", f"sqlite:///{db_path.as_posix()}")

    sys.modules.pop("backend.routers.field_dispatch", None)
    sys.modules.pop("routers.field_dispatch", None)

    try:
        module = importlib.import_module("backend.routers.field_dispatch")
        module_name = "backend.routers.field_dispatch"
    except ModuleNotFoundError:
        module = importlib.import_module("routers.field_dispatch")
        module_name = "routers.field_dispatch"

    app = FastAPI()
    app.include_router(module.router)
    if hasattr(module, "field_forms_router"):
        app.include_router(module.field_forms_router)
    client = TestClient(app)

    yield client, module

    client.close()
    sys.modules.pop(module_name, None)


def _headers(role: str, user_id: str):
    return {"x-user-role": role, "x-user-id": user_id}


def test_dispatcher_can_register_responsavel(dispatch_client):
    client, _ = dispatch_client

    create_resp = client.post(
        "/api/field-dispatch/agents",
        headers=_headers("despachante", "dispatcher.register"),
        json={
            "userId": "agente.leste",
            "name": "Agente Leste",
            "phone": "+55 11 90000-1003",
            "password": "123456",
        },
    )
    assert create_resp.status_code == 200
    created = create_resp.json()
    assert created["userId"] == "agente.leste"
    assert created["name"] == "Agente Leste"

    duplicate_resp = client.post(
        "/api/field-dispatch/agents",
        headers=_headers("despachante", "dispatcher.register"),
        json={
            "userId": "agente.leste",
            "name": "Agente Leste 2",
            "password": "abcdef",
        },
    )
    assert duplicate_resp.status_code == 409

    list_resp = client.get(
        "/api/field-dispatch/agents",
        headers=_headers("despachante", "dispatcher.register"),
    )
    assert list_resp.status_code == 200
    users = [item["userId"] for item in list_resp.json()]
    assert "agente.leste" in users


def test_dispatch_flow_end_to_end(dispatch_client):
    client, _ = dispatch_client

    agents_resp = client.get(
        "/api/field-dispatch/agents",
        headers=_headers("despachante", "dispatcher.1"),
    )
    assert agents_resp.status_code == 200
    agents = agents_resp.json()
    assert len(agents) >= 2
    assigned_agent_id = int(agents[0]["id"])

    task_resp = client.post(
        "/api/field-dispatch/tasks",
        headers=_headers("despachante", "dispatcher.1"),
        json={
            "title": "Inspecao de margem",
            "description": "Verificar erosao e registrar fotos.",
            "category": "ambiental",
            "priority": "alta",
            "assignedAgentId": assigned_agent_id,
            "instructions": "Levar EPI e registrar coordenadas.",
            "geometry": {"type": "Point", "coordinates": [-43.2, -22.9]},
            "addressReference": "Margem Norte",
            "initialStatus": "despachada",
        },
    )
    assert task_resp.status_code == 200
    task = task_resp.json()
    task_id = int(task["id"])
    assert task["status"] == "despachada"

    login_resp = client.post(
        "/api/field-dispatch/agents/login",
        json={"userId": "agente.norte", "password": "123456"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["token"]
    agent_headers = {
        **_headers("agente_campo", str(assigned_agent_id)),
        "authorization": f"Bearer {token}",
    }

    for status_name in ["recebida", "aceita", "em_deslocamento", "no_local", "em_execucao", "concluida"]:
        status_resp = client.patch(
            f"/api/field-dispatch/tasks/{task_id}/status",
            headers=agent_headers,
            json={"newStatus": status_name, "note": f"Status -> {status_name}"},
        )
        assert status_resp.status_code == 200
        assert status_resp.json()["status"] == status_name

    tracking_post = client.post(
        f"/api/field-dispatch/tasks/{task_id}/location",
        headers=agent_headers,
        json={
            "geometry": {"type": "Point", "coordinates": [-43.201, -22.901]},
            "accuracy": 8.2,
            "speed": 14.4,
            "heading": 120.0,
            "source": "mobile_web",
        },
    )
    assert tracking_post.status_code == 200
    assert tracking_post.json()["ok"] is True

    tracking_get = client.get(
        f"/api/field-dispatch/tasks/{task_id}/tracking",
        headers=_headers("despachante", "dispatcher.1"),
    )
    assert tracking_get.status_code == 200
    tracking_payload = tracking_get.json()
    assert tracking_payload["lastLocation"] is not None
    assert len(tracking_payload["trajectory"]) >= 1

    upload_resp = client.post(
        f"/api/field-dispatch/tasks/{task_id}/evidence/upload",
        headers=agent_headers,
        files={"file": ("evidencia.jpg", b"mock-jpg-bytes", "image/jpeg")},
    )
    assert upload_resp.status_code == 200
    file_url = upload_resp.json()["fileUrl"]
    assert file_url.startswith("/uploads/field-dispatch/")

    evidence_resp = client.post(
        f"/api/field-dispatch/tasks/{task_id}/evidence",
        headers=agent_headers,
        json={
            "type": "photo",
            "fileUrl": file_url,
            "description": "Registro final da atividade",
            "geometry": {"type": "Point", "coordinates": [-43.201, -22.901]},
        },
    )
    assert evidence_resp.status_code == 200
    assert evidence_resp.json()["type"] == "photo"

    evidence_list = client.get(
        f"/api/field-dispatch/tasks/{task_id}/evidence",
        headers=_headers("despachante", "dispatcher.1"),
    )
    assert evidence_list.status_code == 200
    assert len(evidence_list.json()) >= 1

    history_resp = client.get(
        f"/api/field-dispatch/tasks/{task_id}/history",
        headers=_headers("despachante", "dispatcher.1"),
    )
    assert history_resp.status_code == 200
    assert len(history_resp.json()) >= 7


def test_dispatch_requires_agent_before_dispatch(dispatch_client):
    client, _ = dispatch_client

    create_resp = client.post(
        "/api/field-dispatch/tasks",
        headers=_headers("despachante", "dispatcher.2"),
        json={
            "title": "Inspecao sem responsavel",
            "category": "operacional",
            "priority": "media",
            "geometry": {"type": "Point", "coordinates": [-43.0, -22.8]},
            "initialStatus": "rascunho",
        },
    )
    assert create_resp.status_code == 200
    task_id = create_resp.json()["id"]

    dispatch_resp = client.post(
        f"/api/field-dispatch/tasks/{task_id}/dispatch",
        headers=_headers("despachante", "dispatcher.2"),
    )
    assert dispatch_resp.status_code == 400
    assert "Atribua um agente" in dispatch_resp.json()["detail"]


def test_agent_cannot_update_other_agent_task(dispatch_client):
    client, _ = dispatch_client

    agents_resp = client.get(
        "/api/field-dispatch/agents",
        headers=_headers("despachante", "dispatcher.3"),
    )
    assert agents_resp.status_code == 200
    agents = agents_resp.json()
    assert len(agents) >= 2
    agent_a = int(agents[0]["id"])

    create_resp = client.post(
        "/api/field-dispatch/tasks",
        headers=_headers("despachante", "dispatcher.3"),
        json={
            "title": "Atividade reservada",
            "category": "fiscalizacao",
            "priority": "alta",
            "assignedAgentId": agent_a,
            "geometry": {"type": "Point", "coordinates": [-43.5, -22.5]},
            "initialStatus": "despachada",
        },
    )
    assert create_resp.status_code == 200
    task_id = int(create_resp.json()["id"])

    login_other_resp = client.post(
        "/api/field-dispatch/agents/login",
        json={"userId": "agente.sul", "password": "123456"},
    )
    assert login_other_resp.status_code == 200
    other_token = login_other_resp.json()["token"]
    other_headers = {
        **_headers("agente_campo", "2"),
        "authorization": f"Bearer {other_token}",
    }

    status_resp = client.patch(
        f"/api/field-dispatch/tasks/{task_id}/status",
        headers=other_headers,
        json={"newStatus": "recebida"},
    )
    assert status_resp.status_code == 403
    assert "nao autorizado" in status_resp.json()["detail"].lower()


def test_task_with_required_form_must_submit_before_completion(dispatch_client):
    client, _ = dispatch_client

    agents_resp = client.get(
        "/api/field-dispatch/agents",
        headers=_headers("despachante", "dispatcher.forms"),
    )
    assert agents_resp.status_code == 200
    assigned_agent_id = int(agents_resp.json()[0]["id"])

    template_resp = client.post(
        "/api/field-forms/templates",
        headers=_headers("despachante", "dispatcher.forms"),
        json={
            "name": "Checklist de vistoria",
            "description": "Formulario dinamico para validacao em campo",
            "schema": {
                "sections": [
                    {
                        "id": "sec_1",
                        "title": "Dados",
                        "fields": [
                            {"id": "foto_local", "type": "photo", "label": "Foto do local", "required": True},
                            {"id": "observacao", "type": "textarea", "label": "Observacao", "required": False},
                        ],
                    }
                ]
            },
        },
    )
    assert template_resp.status_code == 200
    template_id = int(template_resp.json()["id"])

    publish_resp = client.post(
        f"/api/field-forms/templates/{template_id}/publish",
        headers=_headers("despachante", "dispatcher.forms"),
    )
    assert publish_resp.status_code == 200
    assert publish_resp.json()["status"] == "published"

    create_task_resp = client.post(
        "/api/field-dispatch/tasks",
        headers=_headers("despachante", "dispatcher.forms"),
        json={
            "title": "Inspecao com formulario",
            "category": "ambiental",
            "priority": "alta",
            "assignedAgentId": assigned_agent_id,
            "geometry": {"type": "Point", "coordinates": [-43.2, -22.9]},
            "initialStatus": "despachada",
            "formTemplateId": template_id,
            "formRequired": True,
        },
    )
    assert create_task_resp.status_code == 200
    task_id = int(create_task_resp.json()["id"])

    login_resp = client.post(
        "/api/field-dispatch/agents/login",
        json={"userId": "agente.norte", "password": "123456"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["token"]
    agent_headers = {
        **_headers("agente_campo", str(assigned_agent_id)),
        "authorization": f"Bearer {token}",
    }

    for status_name in ["recebida", "aceita", "em_deslocamento", "no_local", "em_execucao"]:
        status_resp = client.patch(
            f"/api/field-dispatch/tasks/{task_id}/status",
            headers=agent_headers,
            json={"newStatus": status_name},
        )
        assert status_resp.status_code == 200

    without_form_resp = client.patch(
        f"/api/field-dispatch/tasks/{task_id}/status",
        headers=agent_headers,
        json={"newStatus": "concluida"},
    )
    assert without_form_resp.status_code == 400
    assert "Formulario obrigatorio pendente" in str(without_form_resp.json()["detail"])

    task_form_resp = client.get(
        f"/api/field-dispatch/tasks/{task_id}/form",
        headers=agent_headers,
    )
    assert task_form_resp.status_code == 200
    assert task_form_resp.json()["hasForm"] is True

    draft_resp = client.post(
        f"/api/field-dispatch/tasks/{task_id}/form/draft",
        headers=agent_headers,
        json={"answers": {"observacao": "Rascunho sem foto obrigatoria"}},
    )
    assert draft_resp.status_code == 200
    assert draft_resp.json()["status"] == "draft"
    assert len(draft_resp.json()["validationErrors"]) == 1

    submit_invalid_resp = client.post(
        f"/api/field-dispatch/tasks/{task_id}/form/submit",
        headers=agent_headers,
        json={"answers": {"observacao": "Sem foto"}},
    )
    assert submit_invalid_resp.status_code == 400

    submit_valid_resp = client.post(
        f"/api/field-dispatch/tasks/{task_id}/form/submit",
        headers=agent_headers,
        json={"answers": {"foto_local": "arquivo://foto_1.jpg", "observacao": "Inspecao concluida"}},
    )
    assert submit_valid_resp.status_code == 200
    assert submit_valid_resp.json()["status"] == "submitted"

    conclude_resp = client.patch(
        f"/api/field-dispatch/tasks/{task_id}/status",
        headers=agent_headers,
        json={"newStatus": "concluida"},
    )
    assert conclude_resp.status_code == 200
    assert conclude_resp.json()["status"] == "concluida"


def test_cannot_link_unpublished_template_on_task(dispatch_client):
    client, _ = dispatch_client

    template_resp = client.post(
        "/api/field-forms/templates",
        headers=_headers("despachante", "dispatcher.forms"),
        json={
            "name": "Template em rascunho",
            "schema": {"sections": [{"id": "s1", "title": "A", "fields": []}]},
        },
    )
    assert template_resp.status_code == 200
    template_id = int(template_resp.json()["id"])

    create_task_resp = client.post(
        "/api/field-dispatch/tasks",
        headers=_headers("despachante", "dispatcher.forms"),
        json={
            "title": "Atividade com template nao publicado",
            "category": "ambiental",
            "priority": "media",
            "geometry": {"type": "Point", "coordinates": [-43.2, -22.9]},
            "initialStatus": "rascunho",
            "formTemplateId": template_id,
            "formRequired": False,
        },
    )
    assert create_task_resp.status_code == 400
    assert "versao publicada" in str(create_task_resp.json()["detail"]).lower()


def test_monthly_report_aggregates_and_filters(dispatch_client):
    client, _ = dispatch_client

    agents_resp = client.get(
        "/api/field-dispatch/agents",
        headers=_headers("despachante", "dispatcher.report"),
    )
    assert agents_resp.status_code == 200
    assigned_agent_id = int(agents_resp.json()[0]["id"])

    template_resp = client.post(
        "/api/field-forms/templates",
        headers=_headers("despachante", "dispatcher.report"),
        json={
            "name": "Formulario mensal",
            "schema": {
                "sections": [
                    {
                        "id": "s1",
                        "title": "Checklist",
                        "fields": [{"id": "foto", "type": "photo", "label": "Foto", "required": True}],
                    }
                ]
            },
        },
    )
    assert template_resp.status_code == 200
    template_id = int(template_resp.json()["id"])

    publish_resp = client.post(
        f"/api/field-forms/templates/{template_id}/publish",
        headers=_headers("despachante", "dispatcher.report"),
    )
    assert publish_resp.status_code == 200

    overdue_task_resp = client.post(
        "/api/field-dispatch/tasks",
        headers=_headers("despachante", "dispatcher.report"),
        json={
            "title": "Vistoria vencida",
            "category": "inspecao",
            "priority": "alta",
            "assignedAgentId": assigned_agent_id,
            "geometry": {"type": "Point", "coordinates": [-43.2, -22.9]},
            "dueDate": (date.today() - timedelta(days=2)).isoformat(),
            "initialStatus": "despachada",
        },
    )
    assert overdue_task_resp.status_code == 200

    form_task_resp = client.post(
        "/api/field-dispatch/tasks",
        headers=_headers("despachante", "dispatcher.report"),
        json={
            "title": "Vistoria com formulario",
            "category": "inspecao",
            "priority": "media",
            "assignedAgentId": assigned_agent_id,
            "geometry": {"type": "Point", "coordinates": [-43.25, -22.95]},
            "dueDate": (date.today() + timedelta(days=5)).isoformat(),
            "initialStatus": "despachada",
            "formTemplateId": template_id,
            "formRequired": True,
        },
    )
    assert form_task_resp.status_code == 200
    form_task_id = int(form_task_resp.json()["id"])

    login_resp = client.post(
        "/api/field-dispatch/agents/login",
        json={"userId": "agente.norte", "password": "123456"},
    )
    assert login_resp.status_code == 200
    token = login_resp.json()["token"]
    agent_headers = {
        **_headers("agente_campo", str(assigned_agent_id)),
        "authorization": f"Bearer {token}",
    }

    submit_form_resp = client.post(
        f"/api/field-dispatch/tasks/{form_task_id}/form/submit",
        headers=agent_headers,
        json={"answers": {"foto": "arquivo://foto.jpg"}},
    )
    assert submit_form_resp.status_code == 200

    upload_resp = client.post(
        f"/api/field-dispatch/tasks/{form_task_id}/evidence/upload",
        headers=agent_headers,
        files={"file": ("foto.jpg", b"mock", "image/jpeg")},
    )
    assert upload_resp.status_code == 200
    file_url = upload_resp.json()["fileUrl"]

    evidence_resp = client.post(
        f"/api/field-dispatch/tasks/{form_task_id}/evidence",
        headers=agent_headers,
        json={
            "type": "photo",
            "fileUrl": file_url,
            "description": "Registro mensal",
            "geometry": {"type": "Point", "coordinates": [-43.25, -22.95]},
        },
    )
    assert evidence_resp.status_code == 200

    today = date.today()
    report_resp = client.get(
        f"/api/field-dispatch/reports/monthly?month={today.month}&year={today.year}&timeBasis=createdAt",
        headers=_headers("despachante", "dispatcher.report"),
    )
    assert report_resp.status_code == 200
    payload = report_resp.json()
    assert payload["summary"]["total"] >= 2
    assert payload["summary"]["overdue"] >= 1
    assert payload["summary"]["formSubmissionRate"] >= 50
    assert payload["summary"]["evidenceRate"] >= 50
    assert "inspecao" in payload["availableFilters"]["categories"]
    assert any(row["formSubmitted"] for row in payload["rows"])
    assert any(row["hasEvidence"] for row in payload["rows"])

    evidence_only_resp = client.get(
        f"/api/field-dispatch/reports/monthly?month={today.month}&year={today.year}&timeBasis=createdAt&hasEvidence=true",
        headers=_headers("despachante", "dispatcher.report"),
    )
    assert evidence_only_resp.status_code == 200
    evidence_payload = evidence_only_resp.json()
    assert evidence_payload["summary"]["total"] == 1
    assert evidence_payload["rows"][0]["hasEvidence"] is True


def test_monthly_report_interpretation_fallback(dispatch_client, monkeypatch):
    client, _ = dispatch_client
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)

    response = client.post(
        "/api/field-dispatch/reports/monthly/interpret",
        headers=_headers("despachante", "dispatcher.ai"),
        json={
            "filtersApplied": {"month": 3, "year": 2026, "timeBasis": "createdAt"},
            "summary": {
                "total": 12,
                "completionRate": 75,
                "overdueRate": 18,
                "evidenceRate": 66,
                "formSubmissionRate": 50,
                "backlogEndOfMonth": 2,
            },
            "breakdowns": {
                "byCategory": [{"label": "inspecao", "count": 7}],
                "byStatus": [{"label": "concluida", "count": 9}],
                "byAgent": [{"agentName": "Agente Norte", "completed": 5, "count": 6}],
            },
        },
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["source"] == "heuristic"
    assert payload["interpretation"]
