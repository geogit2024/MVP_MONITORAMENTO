import { FIELD_TASK_STATUS_LABEL } from '../types';
import type {
  FieldTask,
  FormSchemaField,
  TaskFormDescriptor,
  TaskTrackingResponse,
} from '../types';

interface BuildTaskReportHtmlInput {
  task: FieldTask;
  assignedAgentName: string;
  taskForm: TaskFormDescriptor | null;
  tracking?: TaskTrackingResponse;
}

function escapeHtml(value: unknown): string {
  const source = String(value ?? '');
  return source
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(value?: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('pt-BR');
}

function formatDateTime(value?: string | null): string {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR');
}

function formatCoordinate(value: number): string {
  return value.toFixed(6);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function buildOsmEmbedUrl(lat: number, lon: number): string {
  const latDelta = 0.008;
  const lonScale = Math.max(Math.cos((lat * Math.PI) / 180), 0.2);
  const lonDelta = latDelta / lonScale;
  const minLat = clamp(lat - latDelta, -85, 85);
  const maxLat = clamp(lat + latDelta, -85, 85);
  const minLon = clamp(lon - lonDelta, -180, 180);
  const maxLon = clamp(lon + lonDelta, -180, 180);
  const bbox = `${minLon},${minLat},${maxLon},${maxLat}`;
  const marker = `${lat},${lon}`;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(
    bbox
  )}&layer=mapnik&marker=${encodeURIComponent(marker)}`;
}

function answerToText(field: FormSchemaField, answers: Record<string, unknown>): string {
  const raw = answers[field.id];
  if (raw === null || raw === undefined || raw === '') {
    return '-';
  }

  const optionByValue = new Map((field.options || []).map((option) => [String(option.value), option.label]));

  if (field.type === 'checkbox') {
    return raw ? 'Sim' : 'Nao';
  }

  if (field.type === 'multiselect' && Array.isArray(raw)) {
    return raw
      .map((value) => optionByValue.get(String(value)) || String(value))
      .join(', ');
  }

  if ((field.type === 'select' || field.type === 'radio') && !Array.isArray(raw)) {
    return optionByValue.get(String(raw)) || String(raw);
  }

  if (field.type === 'date') {
    return formatDate(String(raw));
  }

  if (Array.isArray(raw)) {
    return raw.map((item) => String(item)).join(', ');
  }

  if (typeof raw === 'object') {
    return JSON.stringify(raw);
  }

  return String(raw);
}

function renderFormTable(taskForm: TaskFormDescriptor | null): string {
  if (!taskForm || !taskForm.hasForm) {
    return '<div class="empty-state">A atividade nao possui formulario vinculado.</div>';
  }
  if (!taskForm.schema?.sections?.length) {
    return '<div class="empty-state">Formulario vinculado sem schema disponivel.</div>';
  }

  const submissionAnswers = taskForm.submission?.answers || {};
  const rows: string[] = [];

  for (const section of taskForm.schema.sections) {
    for (const field of section.fields) {
      const answer = answerToText(field, submissionAnswers);
      rows.push(`
        <tr>
          <td>${escapeHtml(section.title)}</td>
          <td>${escapeHtml(field.label)}</td>
          <td>${escapeHtml(field.type)}</td>
          <td>${field.required ? 'Sim' : 'Nao'}</td>
          <td>${escapeHtml(answer)}</td>
        </tr>
      `);
    }
  }

  if (!rows.length) {
    return '<div class="empty-state">Formulario sem campos configurados.</div>';
  }

  const templateName = taskForm.template?.name || 'Template sem nome';
  const version = taskForm.version ?? '-';
  const requirement = taskForm.formRequired ? 'Obrigatorio' : 'Opcional';
  const submissionStatus = taskForm.submission?.status === 'submitted' ? 'Enviado' : 'Nao enviado';
  const submittedAt = formatDateTime(taskForm.submission?.submittedAt);
  const validationErrors = taskForm.submission?.validationErrors || [];
  const validationBlock = validationErrors.length
    ? `
      <div class="warn-box">
        <strong>Pendencias de validacao (${validationErrors.length})</strong>
        <ul>
          ${validationErrors
            .map((item) => `<li>${escapeHtml(item.fieldId)}: ${escapeHtml(item.message)}</li>`)
            .join('')}
        </ul>
      </div>
    `
    : '';

  return `
    <div class="chips">
      <span class="chip">${escapeHtml(templateName)}</span>
      <span class="chip">Versao ${escapeHtml(version)}</span>
      <span class="chip">${requirement}</span>
      <span class="chip">${submissionStatus}</span>
      <span class="chip">Data envio: ${escapeHtml(submittedAt)}</span>
    </div>
    ${validationBlock}
    <table class="table">
      <thead>
        <tr>
          <th>Secao</th>
          <th>Campo</th>
          <th>Tipo</th>
          <th>Obrigatorio</th>
          <th>Resposta</th>
        </tr>
      </thead>
      <tbody>
        ${rows.join('')}
      </tbody>
    </table>
  `;
}

function renderTimeline(task: FieldTask): string {
  if (!task.history?.length) {
    return '<div class="empty-state">Sem eventos de timeline.</div>';
  }

  const ordered = [...task.history].sort((a, b) => {
    return new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime();
  });

  const rows = ordered
    .map((item) => {
      const previous = item.previousStatus ? FIELD_TASK_STATUS_LABEL[item.previousStatus] || item.previousStatus : '-';
      const current = FIELD_TASK_STATUS_LABEL[item.newStatus] || item.newStatus;
      return `
        <tr>
          <td>${escapeHtml(formatDateTime(item.changedAt))}</td>
          <td>${escapeHtml(previous)}</td>
          <td>${escapeHtml(current)}</td>
          <td>${escapeHtml(item.changedBy || '-')}</td>
          <td>${escapeHtml(item.note || '-')}</td>
        </tr>
      `;
    })
    .join('');

  return `
    <table class="table">
      <thead>
        <tr>
          <th>Data/hora</th>
          <th>Status anterior</th>
          <th>Novo status</th>
          <th>Usuario</th>
          <th>Nota</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

export function buildTaskReportHtml({
  task,
  assignedAgentName,
  taskForm,
  tracking,
}: BuildTaskReportHtmlInput): string {
  const [lon, lat] = task.geometry.coordinates;
  const generatedAt = new Date();
  const mapEmbedUrl = buildOsmEmbedUrl(lat, lon);
  const googleMapsUrl = `https://www.google.com/maps?q=${lat},${lon}`;
  const trackingLastLocation = tracking?.lastLocation
    ? `${formatCoordinate(tracking.lastLocation.geometry.coordinates[1])}, ${formatCoordinate(
        tracking.lastLocation.geometry.coordinates[0]
      )}`
    : '-';
  const statusLabel = FIELD_TASK_STATUS_LABEL[task.status] || task.status;

  return `
<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Relatorio da atividade #${escapeHtml(task.id)}</title>
    <style>
      :root {
        --ink: #0f172a;
        --ink-soft: #334155;
        --border: #cbd5e1;
        --panel: #f8fafc;
        --brand: #0f4c81;
        --brand-soft: #e6f0fa;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: "Segoe UI", "Calibri", Arial, sans-serif;
        color: var(--ink);
        background: #eef2f7;
      }
      .toolbar {
        position: sticky;
        top: 0;
        z-index: 5;
        display: flex;
        justify-content: center;
        gap: 10px;
        padding: 12px 16px;
        background: rgba(238, 242, 247, 0.98);
        border-bottom: 1px solid var(--border);
      }
      .toolbar button {
        border: 1px solid #2c5f8f;
        background: #0f4c81;
        color: #fff;
        border-radius: 8px;
        padding: 9px 14px;
        font-weight: 600;
        cursor: pointer;
      }
      .toolbar button.secondary {
        background: #fff;
        color: #0f4c81;
      }
      .report {
        max-width: 1100px;
        margin: 18px auto 28px;
        background: #fff;
        border: 1px solid var(--border);
        border-radius: 14px;
        overflow: hidden;
        box-shadow: 0 16px 35px rgba(15, 23, 42, 0.07);
      }
      .report-header {
        padding: 24px 28px;
        background: linear-gradient(140deg, #0b3a63 0%, #124f86 100%);
        color: #fff;
      }
      .report-header h1 {
        margin: 0;
        font-size: 25px;
        line-height: 1.25;
      }
      .report-header p {
        margin: 6px 0 0;
        color: #dbeafe;
        font-size: 14px;
      }
      .header-meta {
        margin-top: 14px;
        display: grid;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        gap: 12px;
      }
      .header-meta .box {
        background: rgba(255, 255, 255, 0.13);
        border: 1px solid rgba(255, 255, 255, 0.22);
        border-radius: 10px;
        padding: 10px 12px;
      }
      .header-meta .label {
        display: block;
        font-size: 12px;
        color: #dbeafe;
      }
      .header-meta .value {
        display: block;
        margin-top: 4px;
        font-size: 15px;
        font-weight: 700;
      }
      .section {
        padding: 20px 28px;
        border-top: 1px solid var(--border);
      }
      .section h2 {
        margin: 0 0 12px;
        font-size: 18px;
      }
      .kv-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px 18px;
      }
      .kv-item {
        background: var(--panel);
        border: 1px solid var(--border);
        border-radius: 10px;
        padding: 10px 12px;
      }
      .kv-item .k {
        font-size: 12px;
        color: var(--ink-soft);
        display: block;
      }
      .kv-item .v {
        font-size: 14px;
        margin-top: 3px;
        display: block;
        font-weight: 600;
        word-break: break-word;
      }
      .map-wrapper {
        border: 1px solid var(--border);
        border-radius: 12px;
        overflow: hidden;
        background: #fff;
      }
      .map-frame {
        display: block;
        width: 100%;
        height: 430px;
        border: 0;
        background: #e2e8f0;
      }
      .map-footer {
        padding: 10px 12px;
        border-top: 1px solid var(--border);
        font-size: 13px;
        color: var(--ink-soft);
      }
      .map-footer a {
        color: var(--brand);
        text-decoration: none;
        font-weight: 600;
      }
      .chips {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin-bottom: 12px;
      }
      .chip {
        border: 1px solid #b8c7da;
        background: var(--brand-soft);
        color: #103658;
        border-radius: 999px;
        padding: 5px 10px;
        font-size: 12px;
        font-weight: 700;
      }
      .table {
        width: 100%;
        border-collapse: collapse;
        table-layout: fixed;
      }
      .table th, .table td {
        border: 1px solid var(--border);
        padding: 9px 10px;
        text-align: left;
        font-size: 12px;
        vertical-align: top;
        word-wrap: break-word;
      }
      .table th {
        background: #e9eff7;
        color: #0f2f4b;
        font-weight: 700;
      }
      .table tbody tr:nth-child(even) td {
        background: #f8fbff;
      }
      .empty-state {
        border: 1px dashed #b9c9da;
        background: #f8fbff;
        border-radius: 10px;
        padding: 12px;
        color: #475569;
      }
      .warn-box {
        margin: 0 0 12px;
        border: 1px solid #f0b27a;
        background: #fff7ed;
        border-radius: 10px;
        padding: 10px 12px;
        color: #7c2d12;
        font-size: 12px;
      }
      .warn-box ul {
        margin: 6px 0 0;
        padding-left: 18px;
      }
      .report-footer {
        border-top: 1px solid var(--border);
        padding: 16px 28px 22px;
        color: #475569;
        font-size: 12px;
      }
      @media (max-width: 900px) {
        .header-meta { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .kv-grid { grid-template-columns: 1fr; }
      }
      @media print {
        body { background: #fff; }
        .toolbar { display: none; }
        .report {
          margin: 0;
          border: none;
          border-radius: 0;
          box-shadow: none;
          max-width: none;
        }
        .section { page-break-inside: avoid; }
      }
    </style>
  </head>
  <body>
    <div class="toolbar">
      <button onclick="window.print()">Imprimir / Salvar PDF</button>
      <button class="secondary" onclick="window.close()">Fechar</button>
    </div>

    <article class="report">
      <header class="report-header">
        <h1>Relatorio operacional de atividade em campo</h1>
        <p>Documento consolidado para auditoria, acompanhamento e evidencia de execucao.</p>
        <div class="header-meta">
          <div class="box">
            <span class="label">Atividade</span>
            <span class="value">#${escapeHtml(task.id)} - ${escapeHtml(task.title)}</span>
          </div>
          <div class="box">
            <span class="label">Status atual</span>
            <span class="value">${escapeHtml(statusLabel)}</span>
          </div>
          <div class="box">
            <span class="label">Responsavel</span>
            <span class="value">${escapeHtml(assignedAgentName)}</span>
          </div>
          <div class="box">
            <span class="label">Gerado em</span>
            <span class="value">${escapeHtml(formatDateTime(generatedAt.toISOString()))}</span>
          </div>
        </div>
      </header>

      <section class="section">
        <h2>Dados gerais da atividade</h2>
        <div class="kv-grid">
          <div class="kv-item"><span class="k">ID externo</span><span class="v">${escapeHtml(task.externalId)}</span></div>
          <div class="kv-item"><span class="k">Categoria</span><span class="v">${escapeHtml(task.category)}</span></div>
          <div class="kv-item"><span class="k">Prioridade</span><span class="v">${escapeHtml(task.priority)}</span></div>
          <div class="kv-item"><span class="k">Prazo</span><span class="v">${escapeHtml(formatDate(task.dueDate))}</span></div>
          <div class="kv-item"><span class="k">Criada em</span><span class="v">${escapeHtml(formatDateTime(task.createdAt))}</span></div>
          <div class="kv-item"><span class="k">Atualizada em</span><span class="v">${escapeHtml(formatDateTime(task.updatedAt))}</span></div>
          <div class="kv-item"><span class="k">Descricao</span><span class="v">${escapeHtml(task.description || '-')}</span></div>
          <div class="kv-item"><span class="k">Instrucoes</span><span class="v">${escapeHtml(task.instructions || '-')}</span></div>
          <div class="kv-item"><span class="k">Referencia</span><span class="v">${escapeHtml(task.addressReference || '-')}</span></div>
          <div class="kv-item"><span class="k">Resumo de resultado</span><span class="v">${escapeHtml(task.resultSummary || '-')}</span></div>
          <div class="kv-item"><span class="k">Formulario obrigatorio</span><span class="v">${task.formRequired ? 'Sim' : 'Nao'}</span></div>
          <div class="kv-item"><span class="k">Template vinculado</span><span class="v">${escapeHtml(
            task.formTemplateId ? `${task.formTemplateId} (v${task.formTemplateVersion || '-'})` : '-'
          )}</span></div>
          <div class="kv-item"><span class="k">Coordenadas da atividade</span><span class="v">${formatCoordinate(
            lat
          )}, ${formatCoordinate(lon)}</span></div>
          <div class="kv-item"><span class="k">Ultima localizacao monitorada</span><span class="v">${escapeHtml(
            trackingLastLocation
          )}</span></div>
          <div class="kv-item"><span class="k">Ultimo tracking</span><span class="v">${escapeHtml(
            formatDateTime(tracking?.lastUpdateAt || null)
          )}</span></div>
          <div class="kv-item"><span class="k">Pontos de trajeto</span><span class="v">${escapeHtml(
            tracking?.trajectory ? tracking.trajectory.length : '-'
          )}</span></div>
        </div>
      </section>

      <section class="section">
        <h2>Mapa da localizacao da atividade</h2>
        <div class="map-wrapper">
          <iframe
            class="map-frame"
            src="${mapEmbedUrl}"
            title="Mapa da localizacao da atividade"
            loading="lazy"
            referrerpolicy="no-referrer-when-downgrade"
          ></iframe>
          <div class="map-footer">
            Coordenadas: ${formatCoordinate(lat)}, ${formatCoordinate(lon)}.
            <a href="${googleMapsUrl}" target="_blank" rel="noreferrer noopener">Abrir no Google Maps</a>
          </div>
        </div>
      </section>

      <section class="section">
        <h2>Conteudo do formulario associado</h2>
        ${renderFormTable(taskForm)}
      </section>

      <section class="section">
        <h2>Timeline operacional</h2>
        ${renderTimeline(task)}
      </section>

      <footer class="report-footer">
        Documento emitido automaticamente pelo modulo de despacho em campo.
      </footer>
    </article>
  </body>
</html>
  `;
}
