import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fieldDispatchApi } from '../services/fieldDispatchApi';
import type {
  CreateFieldTaskPayload,
  FieldAgent,
  FieldPriority,
  FieldTask,
  FormTemplate,
  PointGeometry,
  UpdateFieldTaskPayload,
} from '../types';

interface FieldTaskFormProps {
  agents: FieldAgent[];
  draftGeometry: PointGeometry | null;
  draftAddressReference?: string | null;
  selectedTask: FieldTask | null;
  onCreateTask: (payload: CreateFieldTaskPayload) => Promise<void>;
  onUpdateTask: (taskId: number, payload: UpdateFieldTaskPayload) => Promise<void>;
  onRefreshAgents?: () => void;
}

interface FormState {
  title: string;
  description: string;
  category: string;
  priority: FieldPriority;
  dueDate: string;
  assignedAgentId: string;
  instructions: string;
  addressReference: string;
  formTemplateId: string;
  formTemplateVersion: string;
  formRequired: boolean;
}

interface ResponsibleFormState {
  name: string;
  userId: string;
  phone: string;
  password: string;
}

const emptyFormState: FormState = {
  title: '',
  description: '',
  category: 'inspecao',
  priority: 'media',
  dueDate: '',
  assignedAgentId: '',
  instructions: '',
  addressReference: '',
  formTemplateId: '',
  formTemplateVersion: '',
  formRequired: false,
};

const emptyResponsibleFormState: ResponsibleFormState = {
  name: '',
  userId: '',
  phone: '',
  password: '',
};

const DISPATCHER_CONTEXT = { role: 'despachante' as const, userId: 'dispatcher.web' };

export function FieldTaskForm({
  agents,
  draftGeometry,
  draftAddressReference,
  selectedTask,
  onCreateTask,
  onUpdateTask,
  onRefreshAgents,
}: FieldTaskFormProps) {
  const [form, setForm] = useState<FormState>(emptyFormState);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState<string>('');
  const [templates, setTemplates] = useState<FormTemplate[]>([]);
  const [localAgents, setLocalAgents] = useState<FieldAgent[]>([]);
  const [showResponsibleForm, setShowResponsibleForm] = useState(false);
  const [responsibleForm, setResponsibleForm] = useState<ResponsibleFormState>(emptyResponsibleFormState);
  const [registeringResponsible, setRegisteringResponsible] = useState(false);
  const lastAutoAddressReferenceRef = useRef('');

  const selectedGeometry = useMemo<PointGeometry | null>(() => {
    if (selectedTask?.geometry?.type === 'Point') {
      return selectedTask.geometry;
    }
    return draftGeometry;
  }, [draftGeometry, selectedTask]);

  const isEditing = Boolean(selectedTask);

  const selectedTemplate = useMemo(
    () => templates.find((template) => String(template.id) === form.formTemplateId) || null,
    [form.formTemplateId, templates]
  );

  const availableAgents = useMemo(() => {
    const byId = new Map<number, FieldAgent>();
    for (const agent of agents) byId.set(agent.id, agent);
    for (const agent of localAgents) byId.set(agent.id, agent);
    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [agents, localAgents]);

  useEffect(() => {
    let ignore = false;
    void fieldDispatchApi
      .listFormTemplates({ status: 'published' }, DISPATCHER_CONTEXT)
      .then((response) => {
        if (!ignore) setTemplates(response.items || []);
      })
      .catch(() => {
        if (!ignore) setTemplates([]);
      });
    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!selectedTask) {
      setForm(emptyFormState);
      lastAutoAddressReferenceRef.current = '';
      return;
    }
    setForm({
      title: selectedTask.title || '',
      description: selectedTask.description || '',
      category: selectedTask.category || '',
      priority: selectedTask.priority,
      dueDate: selectedTask.dueDate ? selectedTask.dueDate.slice(0, 10) : '',
      assignedAgentId: selectedTask.assignedAgentId ? String(selectedTask.assignedAgentId) : '',
      instructions: selectedTask.instructions || '',
      addressReference: selectedTask.addressReference || '',
      formTemplateId: selectedTask.formTemplateId ? String(selectedTask.formTemplateId) : '',
      formTemplateVersion: selectedTask.formTemplateVersion ? String(selectedTask.formTemplateVersion) : '',
      formRequired: Boolean(selectedTask.formRequired),
    });
    lastAutoAddressReferenceRef.current = '';
  }, [selectedTask]);

  useEffect(() => {
    if (selectedTask || !draftAddressReference) return;

    setForm((current) => {
      if (current.addressReference && current.addressReference !== lastAutoAddressReferenceRef.current) {
        return current;
      }
      if (current.addressReference === draftAddressReference) {
        return current;
      }

      lastAutoAddressReferenceRef.current = draftAddressReference;
      return {
        ...current,
        addressReference: draftAddressReference,
      };
    });
  }, [draftAddressReference, selectedTask]);

  const setField = (key: keyof FormState, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const setResponsibleField = (key: keyof ResponsibleFormState, value: string) => {
    setResponsibleForm((prev) => ({ ...prev, [key]: value }));
  };

  const closeResponsibleForm = useCallback(() => {
    setShowResponsibleForm(false);
    setResponsibleForm(emptyResponsibleFormState);
  }, []);

  const openResponsibleForm = useCallback(() => {
    setShowResponsibleForm(true);
  }, []);

  const requestCloseResponsibleForm = useCallback(() => {
    if (working || registeringResponsible) return;
    closeResponsibleForm();
  }, [closeResponsibleForm, registeringResponsible, working]);

  useEffect(() => {
    if (!showResponsibleForm) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        requestCloseResponsibleForm();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [requestCloseResponsibleForm, showResponsibleForm]);

  const validate = () => {
    if (!form.title.trim()) return 'Informe o titulo da atividade.';
    if (!form.category.trim()) return 'Informe a categoria.';
    if (!selectedGeometry) return 'Defina um ponto no mapa antes de salvar.';
    if (form.formRequired && !form.formTemplateId) {
      return 'Formulario obrigatorio requer template publicado.';
    }
    return '';
  };

  const buildCreatePayload = (initialStatus: 'rascunho' | 'despachada'): CreateFieldTaskPayload => ({
    title: form.title.trim(),
    description: form.description.trim() || undefined,
    category: form.category.trim(),
    priority: form.priority,
    dueDate: form.dueDate || undefined,
    assignedAgentId: form.assignedAgentId ? Number(form.assignedAgentId) : undefined,
    instructions: form.instructions.trim() || undefined,
    geometry: selectedGeometry as PointGeometry,
    addressReference: form.addressReference.trim() || undefined,
    initialStatus,
    formTemplateId: form.formTemplateId ? Number(form.formTemplateId) : null,
    formTemplateVersion: form.formTemplateVersion ? Number(form.formTemplateVersion) : null,
    formRequired: form.formRequired,
  });

  const buildUpdatePayload = (): UpdateFieldTaskPayload => ({
    title: form.title.trim(),
    description: form.description.trim() || undefined,
    category: form.category.trim(),
    priority: form.priority,
    dueDate: form.dueDate || undefined,
    assignedAgentId: form.assignedAgentId ? Number(form.assignedAgentId) : undefined,
    instructions: form.instructions.trim() || undefined,
    geometry: selectedGeometry || undefined,
    addressReference: form.addressReference.trim() || undefined,
    formTemplateId: form.formTemplateId ? Number(form.formTemplateId) : null,
    formTemplateVersion: form.formTemplateVersion ? Number(form.formTemplateVersion) : null,
    formRequired: form.formRequired,
  });

  const handleCreate = async (mode: 'rascunho' | 'despachada') => {
    const error = validate();
    if (error) {
      setMessage(error);
      return;
    }
    try {
      setWorking(true);
      setMessage('');
      await onCreateTask(buildCreatePayload(mode));
      setMessage(mode === 'despachada' ? 'Atividade despachada.' : 'Rascunho salvo.');
    } catch (err: unknown) {
      setMessage((err as Error)?.message || 'Falha ao criar atividade.');
    } finally {
      setWorking(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedTask) return;
    const error = validate();
    if (error) {
      setMessage(error);
      return;
    }
    try {
      setWorking(true);
      setMessage('');
      await onUpdateTask(selectedTask.id, buildUpdatePayload());
      setMessage('Atividade atualizada.');
    } catch (err: unknown) {
      setMessage((err as Error)?.message || 'Falha ao atualizar atividade.');
    } finally {
      setWorking(false);
    }
  };

  const normalizeUserId = (value: string) => {
    return value
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '.')
      .replace(/[^a-z0-9._-]/g, '');
  };

  const handleCreateResponsible = async () => {
    const name = responsibleForm.name.trim();
    const userId = normalizeUserId(responsibleForm.userId);
    const password = responsibleForm.password.trim();
    const phone = responsibleForm.phone.trim();

    if (!name) {
      setMessage('Informe o nome do responsavel.');
      return;
    }
    if (!userId) {
      setMessage('Informe o usuario de login do responsavel.');
      return;
    }
    if (!password) {
      setMessage('Informe uma senha inicial para o responsavel.');
      return;
    }

    try {
      setRegisteringResponsible(true);
      setMessage('');
      const created = await fieldDispatchApi.createAgent(
        {
          name,
          userId,
          phone: phone || undefined,
          password,
          operationalStatus: 'available',
        },
        DISPATCHER_CONTEXT
      );
      setLocalAgents((prev) => [created, ...prev.filter((item) => item.id !== created.id)]);
      setForm((prev) => ({ ...prev, assignedAgentId: String(created.id) }));
      closeResponsibleForm();
      setMessage(`Responsavel "${created.name}" cadastrado e selecionado.`);
      onRefreshAgents?.();
    } catch (error: unknown) {
      setMessage((error as Error)?.message || 'Falha ao cadastrar responsavel.');
    } finally {
      setRegisteringResponsible(false);
    }
  };

  return (
    <section className="dispatch-card dispatch-form-card">
      <h3>{isEditing ? 'Editar atividade' : 'Nova atividade'}</h3>
      <label>
        Titulo
        <input type="text" value={form.title} onChange={(e) => setField('title', e.target.value)} />
      </label>
      <label>
        Descricao
        <textarea rows={2} value={form.description} onChange={(e) => setField('description', e.target.value)} />
      </label>
      <div className="dispatch-grid-2">
        <label>
          Categoria
          <input type="text" value={form.category} onChange={(e) => setField('category', e.target.value)} />
        </label>
        <label>
          Prioridade
          <select value={form.priority} onChange={(e) => setField('priority', e.target.value as FieldPriority)}>
            <option value="baixa">Baixa</option>
            <option value="media">Media</option>
            <option value="alta">Alta</option>
            <option value="critica">Critica</option>
          </select>
        </label>
        <label>
          Prazo
          <input type="date" value={form.dueDate} onChange={(e) => setField('dueDate', e.target.value)} />
        </label>
        <label>
          Responsavel
          <select value={form.assignedAgentId} onChange={(e) => setField('assignedAgentId', e.target.value)}>
            <option value="">Selecione</option>
            {availableAgents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="dispatch-inline-actions">
        <button
          type="button"
          className="dispatch-button ghost"
          onClick={() => {
            if (showResponsibleForm) {
              requestCloseResponsibleForm();
              return;
            }
            openResponsibleForm();
          }}
          disabled={working || registeringResponsible}
        >
          {showResponsibleForm ? 'Fechar cadastro de responsavel' : 'Cadastrar responsavel'}
        </button>
      </div>
      {showResponsibleForm ? (
        <div className="dispatch-modal-backdrop" onClick={requestCloseResponsibleForm}>
          <section
            className="dispatch-card dispatch-subform dispatch-modal-panel"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="dispatch-responsible-form-title"
          >
            <div className="dispatch-modal-header">
              <h3 id="dispatch-responsible-form-title">Novo responsavel</h3>
              <button
                type="button"
                className="dispatch-button ghost dispatch-modal-close"
                onClick={requestCloseResponsibleForm}
                disabled={working || registeringResponsible}
                aria-label="Fechar cadastro de responsavel"
              >
                Fechar
              </button>
            </div>
            <div className="dispatch-grid-2">
              <label>
                Nome
                <input
                  type="text"
                  value={responsibleForm.name}
                  onChange={(e) => setResponsibleField('name', e.target.value)}
                  placeholder="Nome completo"
                />
              </label>
              <label>
                Usuario (login)
                <input
                  type="text"
                  value={responsibleForm.userId}
                  onChange={(e) => setResponsibleField('userId', e.target.value)}
                  placeholder="agente.novo"
                />
              </label>
              <label>
                Telefone
                <input
                  type="text"
                  value={responsibleForm.phone}
                  onChange={(e) => setResponsibleField('phone', e.target.value)}
                  placeholder="+55 11 90000-0000"
                />
              </label>
              <label>
                Senha inicial
                <input
                  type="text"
                  value={responsibleForm.password}
                  onChange={(e) => setResponsibleField('password', e.target.value)}
                  placeholder="minimo 4 caracteres"
                />
              </label>
            </div>
            <div className="dispatch-grid-2">
              <button
                type="button"
                className="dispatch-button success"
                onClick={() => void handleCreateResponsible()}
                disabled={working || registeringResponsible}
              >
                {registeringResponsible ? 'Cadastrando...' : 'Salvar responsavel'}
              </button>
              <button
                type="button"
                className="dispatch-button ghost"
                onClick={requestCloseResponsibleForm}
                disabled={working || registeringResponsible}
              >
                Cancelar cadastro
              </button>
            </div>
          </section>
        </div>
      ) : null}
      <label>
        Instrucoes
        <textarea rows={2} value={form.instructions} onChange={(e) => setField('instructions', e.target.value)} />
      </label>
      <label>
        Referencia
        <input
          type="text"
          value={form.addressReference}
          placeholder="Portaria, margem norte..."
          onChange={(e) => setField('addressReference', e.target.value)}
        />
      </label>
      <div className="dispatch-grid-2">
        <label>
          Template formulario
          <select
            value={form.formTemplateId}
            onChange={(e) => {
              const nextTemplateId = e.target.value;
              const nextTemplate =
                templates.find((template) => String(template.id) === nextTemplateId) || null;
              setForm((prev) => ({
                ...prev,
                formTemplateId: nextTemplateId,
                formTemplateVersion: nextTemplate?.activeVersion ? String(nextTemplate.activeVersion) : '',
              }));
            }}
          >
            <option value="">Sem formulario</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>
                {template.name} (v{template.activeVersion ?? '-'})
              </option>
            ))}
          </select>
        </label>
        <label>
          Versao vinculada
          <input
            type="number"
            min={1}
            value={form.formTemplateVersion}
            onChange={(e) => setField('formTemplateVersion', e.target.value)}
            disabled={!form.formTemplateId}
          />
        </label>
      </div>
      <label className="dynamic-field-inline">
        <input
          type="checkbox"
          checked={form.formRequired}
          onChange={(e) => setField('formRequired', e.target.checked)}
        />
        <span>Formulario obrigatorio para concluir</span>
      </label>
      {selectedTemplate ? (
        <p className="subtitle">
          Template ativo: {selectedTemplate.name} (v{selectedTemplate.activeVersion ?? '-'})
        </p>
      ) : null}
      <p className="subtitle">
        Ponto atual:{' '}
        {selectedGeometry
          ? `${selectedGeometry.coordinates[1].toFixed(6)}, ${selectedGeometry.coordinates[0].toFixed(6)}`
          : 'nao definido'}
      </p>
      <div className="dispatch-grid-3">
        <button
          type="button"
          className="dispatch-button ghost"
          onClick={() => void handleCreate('rascunho')}
          disabled={working || isEditing}
        >
          Salvar rascunho
        </button>
        <button
          type="button"
          className="dispatch-button success"
          onClick={() => void handleCreate('despachada')}
          disabled={working || isEditing}
        >
          Despachar
        </button>
        <button
          type="button"
          className="dispatch-button"
          onClick={() => void handleUpdate()}
          disabled={working || !isEditing}
        >
          Atualizar
        </button>
      </div>
      {message ? <p className="subtitle">{message}</p> : null}
    </section>
  );
}
