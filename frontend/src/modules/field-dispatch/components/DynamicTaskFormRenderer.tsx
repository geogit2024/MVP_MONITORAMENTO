import React from 'react';
import type { FormSchemaField, FormTemplateSchema } from '../types';

interface DynamicTaskFormRendererProps {
  schema: FormTemplateSchema;
  values: Record<string, unknown>;
  onChange: (fieldId: string, value: unknown) => void;
  readOnly?: boolean;
  showAllFields?: boolean;
}

function shouldShowField(field: FormSchemaField, values: Record<string, unknown>): boolean {
  const rule = field.conditionalRule;
  if (!rule || !rule.sourceFieldId) return true;
  const sourceValue = values[rule.sourceFieldId];
  if (rule.operator === 'not_equals') return sourceValue !== rule.value;
  if (rule.operator === 'in') return Array.isArray(rule.value) && rule.value.includes(sourceValue);
  if (rule.operator === 'not_in') return Array.isArray(rule.value) && !rule.value.includes(sourceValue);
  return sourceValue === rule.value;
}

function toStringValue(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function renderInput(
  field: FormSchemaField,
  values: Record<string, unknown>,
  onChange: (fieldId: string, value: unknown) => void,
  readOnly: boolean
) {
  const commonProps = {
    id: field.id,
    disabled: readOnly,
    placeholder: field.placeholder || '',
  };
  const rawValue = values[field.id];
  const stringValue = toStringValue(rawValue);

  switch (field.type) {
    case 'textarea':
      return (
        <textarea
          {...commonProps}
          rows={3}
          value={stringValue}
          onChange={(event) => onChange(field.id, event.target.value)}
        />
      );
    case 'number':
      return (
        <input
          {...commonProps}
          type="number"
          value={stringValue}
          onChange={(event) =>
            onChange(field.id, event.target.value === '' ? '' : Number(event.target.value))
          }
        />
      );
    case 'date':
      return (
        <input
          {...commonProps}
          type="date"
          value={stringValue}
          onChange={(event) => onChange(field.id, event.target.value)}
        />
      );
    case 'select':
      return (
        <select
          {...commonProps}
          value={stringValue}
          onChange={(event) => onChange(field.id, event.target.value)}
        >
          <option value="">Selecione</option>
          {(field.options || []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    case 'multiselect': {
      const selected = Array.isArray(rawValue) ? rawValue.map(String) : [];
      return (
        <select
          {...commonProps}
          multiple
          value={selected}
          onChange={(event) => {
            const next = Array.from(event.target.selectedOptions).map((option) => option.value);
            onChange(field.id, next);
          }}
        >
          {(field.options || []).map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }
    case 'checkbox':
      return (
        <input
          id={field.id}
          type="checkbox"
          disabled={readOnly}
          checked={Boolean(rawValue)}
          onChange={(event) => onChange(field.id, event.target.checked)}
        />
      );
    case 'radio':
      return (
        <div className="dynamic-field-radio-group">
          {(field.options || []).map((option) => (
            <label key={option.value} className="dynamic-field-inline">
              <input
                type="radio"
                name={field.id}
                value={option.value}
                disabled={readOnly}
                checked={stringValue === option.value}
                onChange={(event) => onChange(field.id, event.target.value)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      );
    case 'photo':
    case 'signature':
    case 'geolocation':
    case 'file':
      return (
        <input
          {...commonProps}
          type="text"
          value={stringValue}
          onChange={(event) => onChange(field.id, event.target.value)}
        />
      );
    case 'text':
    default:
      return (
        <input
          {...commonProps}
          type="text"
          value={stringValue}
          onChange={(event) => onChange(field.id, event.target.value)}
        />
      );
  }
}

export function DynamicTaskFormRenderer({
  schema,
  values,
  onChange,
  readOnly = false,
  showAllFields = false,
}: DynamicTaskFormRendererProps) {
  return (
    <div className="dynamic-form-renderer">
      {schema.sections.map((section) => (
        <section key={section.id} className="dispatch-card">
          <h3>{section.title}</h3>
          {section.fields
            .filter((field) => showAllFields || shouldShowField(field, values))
            .map((field) => (
              <label key={field.id} className="dynamic-field-row">
                <span>
                  {field.label}
                  {field.required ? ' *' : ''}
                </span>
                {renderInput(field, values, onChange, readOnly)}
                {field.helpText ? <small>{field.helpText}</small> : null}
              </label>
            ))}
        </section>
      ))}
    </div>
  );
}
