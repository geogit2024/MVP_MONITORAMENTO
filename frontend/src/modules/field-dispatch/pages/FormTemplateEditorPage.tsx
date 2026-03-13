import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { DynamicTaskFormRenderer } from '../components/DynamicTaskFormRenderer';
import { fieldDispatchApi } from '../services/fieldDispatchApi';
import type { FormFieldType, FormSchemaField, FormTemplateSchema } from '../types';

const DISPATCHER_CONTEXT = { role: 'despachante' as const, userId: 'dispatcher.web' };
const FIELD_TYPES: Array<{ type: FormFieldType; label: string }> = [
  { type: 'text', label: 'Texto' },
  { type: 'number', label: 'Numero' },
  { type: 'date', label: 'Data' },
  { type: 'select', label: 'Selecao' },
  { type: 'multiselect', label: 'Multi-selecao' },
  { type: 'checkbox', label: 'Checkbox' },
  { type: 'radio', label: 'Radio' },
  { type: 'textarea', label: 'Texto longo' },
  { type: 'photo', label: 'Foto' },
  { type: 'signature', label: 'Assinatura' },
  { type: 'geolocation', label: 'Geolocalizacao' },
  { type: 'file', label: 'Arquivo' },
];

const DEFAULT_SCHEMA: FormTemplateSchema = {
  sections: [{ id: 'section_1', title: 'Formulario', fields: [] }],
};

function nextFieldId(schema: FormTemplateSchema, type: FormFieldType): string {
  const slug = type.replace(/[^a-z]/g, '') || 'campo';
  const count = schema.sections.flatMap((section) => section.fields).length;
  return `${slug}_${count + 1}`;
}

export default function FormTemplateEditorPage() {
  const navigate = useNavigate();
  const params = useParams<{ templateId: string }>();
  const templateParam = params.templateId || 'new';
  const isNew = templateParam === 'new';

  const [templateId, setTemplateId] = useState<number | null>(isNew ? null : Number(templateParam));
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [schema, setSchema] = useState<FormTemplateSchema>(DEFAULT_SCHEMA);
  const [selectedFieldId, setSelectedFieldId] = useState<string | null>(null);
  const [previewValues, setPreviewValues] = useState<Record<string, unknown>>({});
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [dirty, setDirty] = useState(false);

  const allFields = useMemo(
    () =>
      schema.sections.flatMap((section) =>
        section.fields.map((field) => ({ ...field, sectionId: section.id, sectionTitle: section.title }))
      ),
    [schema.sections]
  );

  const selectedField = useMemo(
    () => allFields.find((field) => field.id === selectedFieldId) || null,
    [allFields, selectedFieldId]
  );

  useEffect(() => {
    if (isNew) return;
    let ignore = false;
    setLoading(true);
    void fieldDispatchApi
      .getFormTemplate(Number(templateParam), DISPATCHER_CONTEXT)
      .then((template) => {
        if (ignore) return;
        setTemplateId(template.id);
        setName(template.name);
        setDescription(template.description || '');
        const fallback = template.versions[template.versions.length - 1]?.schema || DEFAULT_SCHEMA;
        setSchema(fallback);
        setSelectedFieldId(fallback.sections[0]?.fields[0]?.id || null);
      })
      .catch((error: unknown) => {
        if (!ignore) setFeedback((error as Error)?.message || 'Falha ao carregar template.');
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [isNew, templateParam]);

  useEffect(() => {
    if (!templateId || !dirty) return;
    const timer = window.setTimeout(() => {
      void fieldDispatchApi
        .updateFormTemplate(templateId, { name, description, schema }, DISPATCHER_CONTEXT)
        .then(() => {
          setFeedback('Rascunho salvo automaticamente.');
          setDirty(false);
        })
        .catch((error: unknown) => {
          setFeedback((error as Error)?.message || 'Falha no autosave.');
        });
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [description, dirty, name, schema, templateId]);

  const mutateSchema = (updater: (current: FormTemplateSchema) => FormTemplateSchema) => {
    setSchema((current) => {
      const next = updater(current);
      setDirty(true);
      return next;
    });
  };

  const addField = (type: FormFieldType) => {
    mutateSchema((current) => {
      const fieldId = nextFieldId(current, type);
      const nextField: FormSchemaField = {
        id: fieldId,
        type,
        label: `Campo ${fieldId}`,
        required: false,
        placeholder: '',
        helpText: '',
        options:
          type === 'select' || type === 'multiselect' || type === 'radio'
            ? [
                { value: 'opcao_1', label: 'Opcao 1' },
                { value: 'opcao_2', label: 'Opcao 2' },
              ]
            : [],
      };
      const firstSection = current.sections[0] || { id: 'section_1', title: 'Formulario', fields: [] };
      const nextSections = [...current.sections];
      if (!nextSections.length) {
        nextSections.push(firstSection);
      }
      nextSections[0] = { ...firstSection, fields: [...firstSection.fields, nextField] };
      setSelectedFieldId(fieldId);
      return { ...current, sections: nextSections };
    });
  };

  const removeField = (fieldId: string) => {
    mutateSchema((current) => ({
      ...current,
      sections: current.sections.map((section) => ({
        ...section,
        fields: section.fields.filter((field) => field.id !== fieldId),
      })),
    }));
    setSelectedFieldId(null);
  };

  const updateField = (fieldId: string, updater: (field: FormSchemaField) => FormSchemaField) => {
    mutateSchema((current) => ({
      ...current,
      sections: current.sections.map((section) => ({
        ...section,
        fields: section.fields.map((field) => (field.id === fieldId ? updater(field) : field)),
      })),
    }));
  };

  const moveField = (fieldId: string, direction: 'up' | 'down') => {
    mutateSchema((current) => {
      const nextSections = current.sections.map((section) => ({ ...section, fields: [...section.fields] }));
      for (const section of nextSections) {
        const idx = section.fields.findIndex((item) => item.id === fieldId);
        if (idx < 0) continue;
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx < 0 || swapIdx >= section.fields.length) return current;
        const clone = [...section.fields];
        const temp = clone[idx];
        clone[idx] = clone[swapIdx];
        clone[swapIdx] = temp;
        section.fields = clone;
        return { ...current, sections: nextSections };
      }
      return current;
    });
  };

  const saveTemplate = async () => {
    try {
      setLoading(true);
      const payload = { name, description, schema };
      if (!templateId) {
        const created = await fieldDispatchApi.createFormTemplate(payload, DISPATCHER_CONTEXT);
        setTemplateId(created.id);
        setFeedback('Template criado em rascunho.');
        setDirty(false);
        navigate(`/field-dispatch/forms/${created.id}`, { replace: true });
        return;
      }
      await fieldDispatchApi.updateFormTemplate(templateId, payload, DISPATCHER_CONTEXT);
      setFeedback('Template salvo.');
      setDirty(false);
    } catch (error: unknown) {
      setFeedback((error as Error)?.message || 'Falha ao salvar template.');
    } finally {
      setLoading(false);
    }
  };

  const publishTemplate = async () => {
    if (!templateId) return;
    try {
      setLoading(true);
      await fieldDispatchApi.publishFormTemplate(templateId, DISPATCHER_CONTEXT);
      setFeedback('Template publicado com sucesso.');
      setDirty(false);
    } catch (error: unknown) {
      setFeedback((error as Error)?.message || 'Falha ao publicar.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="field-dispatch-layout field-forms-layout">
      <aside className="field-dispatch-sidebar">
        <h2>Editor de template</h2>
        <p className="subtitle">Configure os campos e regras do formulario dinamico.</p>

        <section className="dispatch-card">
          <label>
            Nome do template
            <input
              type="text"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setDirty(true);
              }}
            />
          </label>
          <label>
            Descricao
            <textarea
              rows={2}
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                setDirty(true);
              }}
            />
          </label>
          <div className="dispatch-grid-2">
            <button type="button" className="dispatch-button" onClick={() => void saveTemplate()} disabled={loading}>
              Salvar rascunho
            </button>
            <button
              type="button"
              className="dispatch-button success"
              onClick={() => void publishTemplate()}
              disabled={loading || !templateId}
            >
              Publicar
            </button>
          </div>
          <button
            type="button"
            className="dispatch-button ghost"
            style={{ marginTop: 8, width: '100%' }}
            onClick={() => navigate('/field-dispatch/forms')}
          >
            Voltar lista
          </button>
        </section>

        <section className="dispatch-card">
          <h3>Paleta de campos</h3>
          <div className="dispatch-grid-2">
            {FIELD_TYPES.map((entry) => (
              <button
                key={entry.type}
                type="button"
                className="dispatch-button ghost"
                onClick={() => addField(entry.type)}
              >
                + {entry.label}
              </button>
            ))}
          </div>
        </section>

        <section className="dispatch-card dispatch-card--resizable-list">
          <h3>Campos do formulario</h3>
          <ul className="task-list">
            {allFields.map((field) => (
              <li
                key={field.id}
                className={selectedFieldId === field.id ? 'active' : ''}
                onClick={() => setSelectedFieldId(field.id)}
              >
                <strong>{field.label}</strong>
                <p className="task-meta">
                  <span>{field.type}</span>
                  <span>{field.sectionTitle}</span>
                </p>
              </li>
            ))}
            {!allFields.length ? <li>Nenhum campo configurado.</li> : null}
          </ul>
        </section>

        {feedback ? <div className="floating-toast">{feedback}</div> : null}
      </aside>

      <main className="field-dispatch-main">
        <section className="dispatch-card" style={{ marginTop: 0, overflow: 'auto' }}>
          <h3>Propriedades do campo</h3>
          {!selectedField ? (
            <p className="subtitle">Selecione um campo para editar propriedades.</p>
          ) : (
            <div className="dispatch-grid-2">
              <label>
                Label
                <input
                  type="text"
                  value={selectedField.label}
                  onChange={(event) =>
                    updateField(selectedField.id, (field) => ({ ...field, label: event.target.value }))
                  }
                />
              </label>
              <label>
                ID tecnico
                <input type="text" value={selectedField.id} disabled />
              </label>
              <label>
                Placeholder
                <input
                  type="text"
                  value={selectedField.placeholder || ''}
                  onChange={(event) =>
                    updateField(selectedField.id, (field) => ({ ...field, placeholder: event.target.value }))
                  }
                />
              </label>
              <label>
                Ajuda
                <input
                  type="text"
                  value={selectedField.helpText || ''}
                  onChange={(event) =>
                    updateField(selectedField.id, (field) => ({ ...field, helpText: event.target.value }))
                  }
                />
              </label>
              <label className="dynamic-field-inline">
                <input
                  type="checkbox"
                  checked={Boolean(selectedField.required)}
                  onChange={(event) =>
                    updateField(selectedField.id, (field) => ({ ...field, required: event.target.checked }))
                  }
                />
                <span>Obrigatorio</span>
              </label>
              <div className="dispatch-grid-3">
                <button type="button" className="dispatch-button ghost" onClick={() => moveField(selectedField.id, 'up')}>
                  Subir
                </button>
                <button type="button" className="dispatch-button ghost" onClick={() => moveField(selectedField.id, 'down')}>
                  Descer
                </button>
                <button type="button" className="dispatch-button danger" onClick={() => removeField(selectedField.id)}>
                  Remover
                </button>
              </div>

              {(selectedField.type === 'select' ||
                selectedField.type === 'multiselect' ||
                selectedField.type === 'radio') ? (
                <label style={{ gridColumn: '1 / -1' }}>
                  Opcoes (uma por linha, formato valor|rotulo)
                  <textarea
                    rows={4}
                    value={(selectedField.options || [])
                      .map((option) => `${option.value}|${option.label}`)
                      .join('\n')}
                    onChange={(event) => {
                      const parsed = event.target.value
                        .split('\n')
                        .map((line) => line.trim())
                        .filter(Boolean)
                        .map((line) => {
                          const [value, label] = line.split('|');
                          return { value: value?.trim() || '', label: (label || value || '').trim() };
                        })
                        .filter((item) => item.value);
                      updateField(selectedField.id, (field) => ({ ...field, options: parsed }));
                    }}
                  />
                </label>
              ) : null}
            </div>
          )}
        </section>

        <section className="dispatch-card" style={{ marginTop: 10, overflow: 'auto' }}>
          <h3>Preview mobile</h3>
          <DynamicTaskFormRenderer
            schema={schema}
            values={previewValues}
            onChange={(fieldId, value) =>
              setPreviewValues((current) => ({ ...current, [fieldId]: value }))
            }
          />
        </section>
      </main>
    </div>
  );
}

