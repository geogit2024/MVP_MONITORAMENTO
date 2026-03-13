import type { FieldPriority, FieldTaskStatus } from './types';

export type FieldDispatchMonthlyReportTimeBasis =
  | 'createdAt'
  | 'dispatchedAt'
  | 'completedAt'
  | 'updatedAt';

export type FieldDispatchMonthlyOverdueState =
  | 'all'
  | 'overdue'
  | 'on_time'
  | 'no_due_date';

export interface FieldDispatchMonthlyReportFilters {
  month: number;
  year: number;
  timeBasis: FieldDispatchMonthlyReportTimeBasis;
  category?: string;
  status?: FieldTaskStatus | '';
  priority?: FieldPriority | '';
  agentId?: number;
  createdBy?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
  overdueState?: FieldDispatchMonthlyOverdueState;
  hasForm?: boolean;
  formRequired?: boolean;
  formSubmitted?: boolean;
  hasEvidence?: boolean;
  search?: string;
}

export interface FieldDispatchMonthlyReportFilterFormState {
  month: number;
  year: number;
  timeBasis: FieldDispatchMonthlyReportTimeBasis;
  category: string;
  status: FieldTaskStatus | '';
  priority: FieldPriority | '';
  agentId: string;
  createdBy: string;
  dueDateFrom: string;
  dueDateTo: string;
  overdueState: FieldDispatchMonthlyOverdueState;
  hasForm: '';
  formRequired: '';
  formSubmitted: '';
  hasEvidence: '';
  search: string;
}

export interface FieldDispatchMonthlyReportBreakdownItem {
  label: string;
  count: number;
}

export interface FieldDispatchMonthlyReportAgentBreakdownItem {
  agentId: number | null;
  agentName: string;
  count: number;
  completed: number;
}

export interface FieldDispatchMonthlyReportSummary {
  total: number;
  created: number;
  dispatched: number;
  completed: number;
  canceled: number;
  refused: number;
  executionError: number;
  overdue: number;
  noDueDate: number;
  completionRate: number;
  overdueRate: number;
  cancellationRate: number;
  refusalRate: number;
  formSubmissionRate: number;
  evidenceRate: number;
  avgDispatchHours: number | null;
  avgAcceptanceHours: number | null;
  avgArrivalHours: number | null;
  avgCompletionHours: number | null;
  backlogEndOfMonth: number;
}

export interface FieldDispatchMonthlyReportRow {
  id: number;
  title: string;
  category: string;
  priority: FieldPriority;
  status: FieldTaskStatus;
  agentName: string | null;
  assignedAgentId?: number | null;
  createdAt: string;
  updatedAt?: string | null;
  dispatchedAt?: string | null;
  acceptedAt?: string | null;
  arrivedAt?: string | null;
  completedAt?: string | null;
  dueDate: string | null;
  createdBy?: string | null;
  overdueState: 'overdue' | 'on_time' | 'no_due_date' | 'open';
  hasForm: boolean;
  formRequired: boolean;
  formSubmitted: boolean;
  hasEvidence: boolean;
  evidenceCount?: number;
}

export interface FieldDispatchMonthlyReportAvailableFilters {
  categories: string[];
  priorities: string[];
  statuses: string[];
  agents: Array<{ id: number; name: string }>;
  creators: string[];
}

export interface FieldDispatchMonthlyReportResponse {
  filtersApplied: FieldDispatchMonthlyReportFilters;
  availableFilters: FieldDispatchMonthlyReportAvailableFilters;
  summary: FieldDispatchMonthlyReportSummary;
  breakdowns: {
    byCategory: FieldDispatchMonthlyReportBreakdownItem[];
    byStatus: FieldDispatchMonthlyReportBreakdownItem[];
    byPriority: FieldDispatchMonthlyReportBreakdownItem[];
    byAgent: FieldDispatchMonthlyReportAgentBreakdownItem[];
    byDay: FieldDispatchMonthlyReportBreakdownItem[];
    byWeek: FieldDispatchMonthlyReportBreakdownItem[];
    bySla: FieldDispatchMonthlyReportBreakdownItem[];
    byCompliance: FieldDispatchMonthlyReportBreakdownItem[];
  };
  rows: FieldDispatchMonthlyReportRow[];
  aiInterpretation?: string | null;
}

export interface FieldDispatchMonthlyReportInterpretationResponse {
  interpretation: string;
  source: 'openai' | 'heuristic' | string;
}
