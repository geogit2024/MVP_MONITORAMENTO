export type FieldTaskStatus =
  | 'rascunho'
  | 'despachada'
  | 'recebida'
  | 'aceita'
  | 'em_deslocamento'
  | 'no_local'
  | 'em_execucao'
  | 'concluida'
  | 'recusada'
  | 'cancelada'
  | 'erro_execucao';

export type FieldPriority = 'baixa' | 'media' | 'alta' | 'critica';

export interface PointGeometry {
  type: 'Point';
  coordinates: [number, number];
}

export interface FieldTaskHistoryItem {
  id: number;
  taskId: number;
  previousStatus: FieldTaskStatus | null;
  newStatus: FieldTaskStatus;
  changedBy: string;
  changedAt: string;
  note?: string | null;
}

export interface FieldTask {
  id: number;
  externalId: string;
  title: string;
  description?: string | null;
  category: string;
  priority: FieldPriority;
  status: FieldTaskStatus;
  createdAt: string;
  updatedAt: string;
  dispatchedAt?: string | null;
  receivedAt?: string | null;
  acceptedAt?: string | null;
  startedAt?: string | null;
  arrivedAt?: string | null;
  completedAt?: string | null;
  canceledAt?: string | null;
  createdBy: string;
  assignedAgentId?: number | null;
  geometry: PointGeometry;
  addressReference?: string | null;
  instructions?: string | null;
  dueDate?: string | null;
  resultSummary?: string | null;
  cancelReason?: string | null;
  formTemplateId?: number | null;
  formTemplateVersion?: number | null;
  formRequired?: boolean;
  history: FieldTaskHistoryItem[];
}

export interface FieldTaskListResponse {
  items: FieldTask[];
  total: number;
}

export interface FieldAgent {
  id: number;
  userId: string;
  name: string;
  phone?: string | null;
  role: string;
  operationalStatus: string;
  lastKnownLocation?: PointGeometry | null;
  lastSeenAt?: string | null;
}

export interface TrackingPoint {
  agentId: number;
  taskId: number;
  geometry: PointGeometry;
  timestamp: string;
  accuracy?: number | null;
  speed?: number | null;
  heading?: number | null;
  source?: string | null;
}

export interface TaskTrackingResponse {
  lastLocation: TrackingPoint | null;
  trajectory: TrackingPoint[];
  lastUpdateAt: string | null;
}

export interface FieldEvidence {
  id: number;
  taskId: number;
  agentId: number;
  type: string;
  fileUrl: string;
  description?: string | null;
  geometry?: PointGeometry | null;
  timestamp: string;
}

export interface AgentLoginResponse {
  token: string;
  expiresAt: string;
  agent: FieldAgent;
}

export interface CreateFieldAgentPayload {
  userId: string;
  name: string;
  phone?: string;
  password: string;
  operationalStatus?: string;
}

export interface FieldTaskFiltersState {
  status: string;
  agentId: string;
  priority: string;
  category: string;
  dateFrom: string;
  dateTo: string;
}

export interface CreateFieldTaskPayload {
  title: string;
  description?: string;
  category: string;
  priority: FieldPriority;
  dueDate?: string;
  assignedAgentId?: number;
  instructions?: string;
  geometry: PointGeometry;
  addressReference?: string;
  initialStatus: 'rascunho' | 'despachada';
  formTemplateId?: number | null;
  formTemplateVersion?: number | null;
  formRequired?: boolean;
}

export interface UpdateFieldTaskPayload {
  title?: string;
  description?: string;
  category?: string;
  priority?: FieldPriority;
  dueDate?: string;
  assignedAgentId?: number;
  instructions?: string;
  geometry?: PointGeometry;
  addressReference?: string;
  resultSummary?: string;
  formTemplateId?: number | null;
  formTemplateVersion?: number | null;
  formRequired?: boolean;
}

export interface UpdateTaskStatusPayload {
  newStatus: FieldTaskStatus;
  note?: string;
  resultSummary?: string;
  force?: boolean;
}

export interface LocationPayload {
  geometry: PointGeometry;
  accuracy?: number;
  speed?: number;
  heading?: number;
  source?: string;
}

export interface CreateEvidencePayload {
  type: string;
  fileUrl: string;
  description?: string;
  geometry?: PointGeometry;
}

export type FormTemplateStatus = 'draft' | 'published' | 'archived';
export type FormSubmissionStatus = 'draft' | 'submitted';
export type FormFieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'multiselect'
  | 'checkbox'
  | 'radio'
  | 'textarea'
  | 'photo'
  | 'signature'
  | 'geolocation'
  | 'file';

export interface FormConditionalRule {
  sourceFieldId: string;
  operator: 'equals' | 'not_equals' | 'in' | 'not_in';
  value: unknown;
}

export interface FormFieldOption {
  value: string;
  label: string;
}

export interface FormSchemaField {
  id: string;
  type: FormFieldType;
  label: string;
  required?: boolean;
  placeholder?: string;
  helpText?: string;
  options?: FormFieldOption[];
  validation?: Record<string, unknown>;
  conditionalRule?: FormConditionalRule | null;
}

export interface FormSchemaSection {
  id: string;
  title: string;
  fields: FormSchemaField[];
}

export interface FormTemplateSchema {
  sections: FormSchemaSection[];
}

export interface FormTemplateVersion {
  id: number;
  templateId: number;
  version: number;
  status: FormTemplateStatus;
  schema: FormTemplateSchema;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
}

export interface FormTemplate {
  id: number;
  externalId: string;
  name: string;
  description?: string | null;
  status: FormTemplateStatus;
  activeVersion?: number | null;
  latestVersion?: number | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  schema?: FormTemplateSchema | null;
  versions: FormTemplateVersion[];
}

export interface FormTemplateListResponse {
  items: FormTemplate[];
  total: number;
}

export interface TaskFormSubmission {
  id: number;
  taskId: number;
  status: FormSubmissionStatus;
  answers: Record<string, unknown>;
  validationErrors: Array<{ fieldId: string; message: string }>;
  submittedBy: string;
  submittedAt?: string | null;
  updatedAt: string;
}

export interface TaskFormDescriptor {
  taskId: number;
  hasForm: boolean;
  formRequired: boolean;
  template?: Pick<FormTemplate, 'id' | 'name' | 'description' | 'status'>;
  version?: number;
  schema?: FormTemplateSchema;
  submission?: TaskFormSubmission | null;
}

export const FIELD_TASK_STATUS_LABEL: Record<FieldTaskStatus, string> = {
  rascunho: 'Rascunho',
  despachada: 'Despachada',
  recebida: 'Recebida',
  aceita: 'Aceita',
  em_deslocamento: 'Em deslocamento',
  no_local: 'No local',
  em_execucao: 'Em execução',
  concluida: 'Concluída',
  recusada: 'Recusada',
  cancelada: 'Cancelada',
  erro_execucao: 'Erro execução',
};

export const FIELD_TASK_STATUS_COLORS: Record<FieldTaskStatus, string> = {
  rascunho: '#94a3b8',
  despachada: '#3b82f6',
  recebida: '#2563eb',
  aceita: '#1d4ed8',
  em_deslocamento: '#0ea5e9',
  no_local: '#22c55e',
  em_execucao: 'Em execução',
  concluida: 'Concluída',
  recusada: '#ef4444',
  cancelada: '#dc2626',
  erro_execucao: 'Erro execução',
};
export const FIELD_STATUS_SEQUENCE: FieldTaskStatus[] = [
  'rascunho',
  'despachada',
  'recebida',
  'aceita',
  'em_deslocamento',
  'no_local',
  'em_execucao',
  'concluida',
];

