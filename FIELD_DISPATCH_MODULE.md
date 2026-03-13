# Modulo de Gestao e Despacho de Atividades em Campo

## Visao geral
O modulo de despacho em campo foi implementado em duas frentes:

- `Despachante (desktop)` no sistema principal: `/field-dispatch`
- `Agente de campo (web app movel)` em rota publica: `/mobile/field-agent`

Ele reutiliza a stack atual (React + Vite + Leaflet + FastAPI + SQLAlchemy) e adiciona fluxo operacional com historico auditavel, tracking e evidencias.

## Backend

### Router
- Arquivo: `backend/routers/field_dispatch.py`
- Prefixo: `/api/field-dispatch`

### Entidades operacionais
- `field_task`
- `field_task_status_history`
- `field_agent`
- `agent_location`
- `field_evidence`

### Status suportados
- `rascunho`
- `despachada`
- `recebida`
- `aceita`
- `em_deslocamento`
- `no_local`
- `em_execucao`
- `concluida`
- `recusada`
- `cancelada`
- `erro_execucao`

### Endpoints principais
- `GET /api/field-dispatch/agents`
- `POST /api/field-dispatch/agents/login`
- `POST /api/field-dispatch/tasks`
- `PUT /api/field-dispatch/tasks/{task_id}`
- `POST /api/field-dispatch/tasks/{task_id}/dispatch`
- `PATCH /api/field-dispatch/tasks/{task_id}/status`
- `POST /api/field-dispatch/tasks/{task_id}/reassign`
- `POST /api/field-dispatch/tasks/{task_id}/cancel`
- `GET /api/field-dispatch/tasks`
- `GET /api/field-dispatch/tasks/{task_id}`
- `GET /api/field-dispatch/tasks/{task_id}/history`
- `GET /api/field-dispatch/agents/{agent_id}/tasks`
- `POST /api/field-dispatch/tasks/{task_id}/location`
- `GET /api/field-dispatch/tasks/{task_id}/tracking`
- `POST /api/field-dispatch/tasks/{task_id}/evidence/upload`
- `POST /api/field-dispatch/tasks/{task_id}/evidence`
- `GET /api/field-dispatch/tasks/{task_id}/evidence`

### Endpoints de formulario dinamico
- `GET /api/field-forms/templates`
- `POST /api/field-forms/templates`
- `GET /api/field-forms/templates/{template_id}`
- `PUT /api/field-forms/templates/{template_id}`
- `POST /api/field-forms/templates/{template_id}/publish`
- `POST /api/field-forms/templates/{template_id}/duplicate`
- `POST /api/field-forms/templates/{template_id}/archive`
- `GET /api/field-dispatch/tasks/{task_id}/form`
- `POST /api/field-dispatch/tasks/{task_id}/form/draft`
- `POST /api/field-dispatch/tasks/{task_id}/form/submit`

### Integracao no app
- `backend/main.py` inclui `field_dispatch_router`
- `backend/main.py` monta `StaticFiles` em `/uploads` para evidencias

## Frontend

### Modulo do despachante
- Pasta base: `frontend/src/modules/field-dispatch`
- Pagina principal: `pages/FieldDispatchPage.tsx`
- Rota protegida: `/field-dispatch`

Componentes:
- `DispatchToolbar`
- `FieldTaskForm`
- `FieldTaskFilters`
- `FieldTaskList`
- `FieldTaskMap`
- `FieldTaskDetailsDrawer`
- `TaskStatusTimeline`
- `AgentTrackingLayer`
- `DynamicTaskFormRenderer`

Paginas novas:
- `pages/FormTemplatesPage.tsx`
- `pages/FormTemplateEditorPage.tsx`

Suporte:
- `hooks/useFieldDispatch.ts`
- `services/fieldDispatchApi.ts`
- `store/fieldDispatchStore.ts`
- `types.ts`
- `field-dispatch.css`

### Web app movel do agente
- Pasta base: `frontend/src/mobile/field-agent`
- Entrada: `FieldAgentMobileApp.tsx`
- Rota publica: `/mobile/field-agent`

Paginas/componentes:
- `pages/AgentLoginPage.tsx`
- `pages/AgentTaskListPage.tsx`
- `pages/AgentTaskDetailsPage.tsx`
- `pages/AgentTaskExecutionPage.tsx`
- `components/AgentLiveLocationController.tsx`
- `components/AgentEvidenceUploader.tsx`

No fluxo de execucao, o app agora:
- carrega formulario dinamico vinculado na tarefa;
- permite salvar rascunho;
- permite enviar formulario;
- bloqueia conclusao quando `formRequired=true` e submissao ainda nao enviada.

## Passo a passo operacional

### Despachante
1. Acesse `/field-dispatch`.
2. Clique em `Criar atividade no mapa`.
3. Clique no mapa no local da tarefa.
4. Preencha formulario (titulo, categoria, prioridade, responsavel, instrucoes).
5. Clique em `Salvar rascunho` ou `Despachar`.
6. Selecione a atividade na lista para abrir detalhes.
7. Atualize status, reatribua agente ou cancele quando necessario.
8. Acompanhe timeline e tracking no painel de detalhes.

### Agente de campo
1. Acesse `/mobile/field-agent`.
2. Faça login com usuario/senha do agente.
3. Abra uma tarefa na lista.
4. Confirme recebimento e aceite.
5. Inicie deslocamento e depois marque chegada.
6. Entre em `Executar tarefa`.
7. Envie evidencias (arquivo + observacao).
8. Conclua a atividade.

## Testes

### Backend
- Arquivo: `backend/tests/test_field_dispatch.py`
- Cobertura:
  - fluxo completo de despacho ate conclusao
  - tracking e evidencias
  - validacao de despacho sem agente
  - validacao de permissao por agente
  - fluxo de template + submissao obrigatoria para concluir atividade

Comando:
```bash
python -m pytest backend/tests/test_field_dispatch.py -q
```
