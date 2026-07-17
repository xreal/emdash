import type {
  JiraBoardColumn,
  JiraBoardColumnWidth,
  JiraBoardIssue,
  JiraIssueTransition,
  JiraSprintSummary,
} from '@shared/core/jira/jira-board';
import type { LinkedIssueTaskSummary } from '@shared/core/tasks/tasks';

export type JiraBoardColumnWithIssues = {
  column: JiraBoardColumn;
  issues: JiraBoardIssue[];
};

export const JIRA_UNASSIGNED_FILTER = '__emdash_unassigned__';

const JIRA_DESCRIPTION_EMOJI: Record<string, string> = {
  ':bug:': '🐛',
  ':bulb:': '💡',
  ':check_mark:': '✅',
  ':construction:': '🚧',
  ':cross_mark:': '❌',
  ':eyes:': '👀',
  ':heavy_check_mark:': '✔️',
  ':information_source:': 'ℹ️',
  ':link:': '🔗',
  ':lock:': '🔒',
  ':memo:': '📝',
  ':rocket:': '🚀',
  ':sparkles:': '✨',
  ':tada:': '🎉',
  ':thumbsup:': '👍',
  ':warning:': '⚠️',
  ':wave:': '👋',
  ':white_check_mark:': '✅',
  ':x:': '❌',
};

export type JiraIssueFilters = {
  search?: string;
  status?: string;
  assignee?: string;
  issueType?: string;
  priority?: string;
};

export function normalizeJiraDescriptionForDisplay(description: string): string {
  return description.replace(/:[a-z0-9]+(?:(?:\\)?_[a-z0-9]+)*:/gi, (shortcode) => {
    const normalized = shortcode.replaceAll('\\_', '_').toLowerCase();
    return JIRA_DESCRIPTION_EMOJI[normalized] ?? shortcode;
  });
}

export function groupJiraIssuesByColumn(
  columns: JiraBoardColumn[],
  issues: JiraBoardIssue[]
): JiraBoardColumnWithIssues[] {
  const statusToColumn = new Map<string, string>();
  for (const column of columns) {
    for (const statusId of column.statusIds) statusToColumn.set(statusId, column.id);
  }

  const issuesByColumn = new Map(columns.map((column) => [column.id, [] as JiraBoardIssue[]]));
  const unmapped: JiraBoardIssue[] = [];

  for (const issue of issues) {
    const columnId = issue.statusId ? statusToColumn.get(issue.statusId) : undefined;
    const columnIssues = columnId ? issuesByColumn.get(columnId) : undefined;
    if (columnIssues) columnIssues.push(issue);
    else unmapped.push(issue);
  }

  const grouped = columns.map((column) => ({
    column,
    issues: issuesByColumn.get(column.id) ?? [],
  }));
  if (unmapped.length > 0) {
    grouped.push({
      column: {
        id: 'unmapped',
        name: 'Other',
        statusIds: [],
        min: null,
        max: null,
      },
      issues: unmapped,
    });
  }

  return grouped;
}

export function filterJiraIssues(
  issues: JiraBoardIssue[],
  filters: JiraIssueFilters
): JiraBoardIssue[] {
  const search = filters.search?.trim().toLocaleLowerCase();

  return issues.filter((issue) => {
    if (
      search &&
      !issue.key.toLocaleLowerCase().includes(search) &&
      !issue.summary.toLocaleLowerCase().includes(search)
    ) {
      return false;
    }
    if (filters.status && issue.statusName !== filters.status) return false;
    if (filters.assignee === JIRA_UNASSIGNED_FILTER && issue.assigneeName !== null) return false;
    if (
      filters.assignee &&
      filters.assignee !== JIRA_UNASSIGNED_FILTER &&
      issue.assigneeName !== filters.assignee
    )
      return false;
    if (filters.issueType && issue.issueTypeName !== filters.issueType) return false;
    if (filters.priority && issue.priorityName !== filters.priority) return false;
    return true;
  });
}

export function resolveJiraSprintId(
  requestedSprintId: number | undefined,
  activeSprint: JiraSprintSummary | null,
  sprints: JiraSprintSummary[]
): number | undefined {
  if (requestedSprintId && sprints.some((sprint) => sprint.id === requestedSprintId)) {
    return requestedSprintId;
  }
  return activeSprint?.id;
}

export function sortJiraSprints(sprints: JiraSprintSummary[]): JiraSprintSummary[] {
  return [...sprints].sort((left, right) => {
    const stateOrder = sprintStateOrder(left.state) - sprintStateOrder(right.state);
    if (stateOrder !== 0) return stateOrder;

    if (left.state === 'closed' && right.state === 'closed') {
      return sprintTimestamp(right) - sprintTimestamp(left) || right.id - left.id;
    }
    return sprintTimestamp(left) - sprintTimestamp(right) || left.id - right.id;
  });
}

function sprintStateOrder(state: string): number {
  if (state === 'active') return 0;
  if (state === 'future') return 1;
  if (state === 'closed') return 2;
  return 3;
}

function sprintTimestamp(sprint: JiraSprintSummary): number {
  const value = sprint.completeDate ?? sprint.endDate ?? sprint.startDate;
  const timestamp = value ? Date.parse(value) : Number.NaN;
  return Number.isNaN(timestamp) ? sprint.id : timestamp;
}

export type LinkedWorkPrimaryAction =
  | { kind: 'start-task' }
  | { kind: 'open-task'; task: LinkedIssueTaskSummary }
  | { kind: 'choose-task'; tasks: LinkedIssueTaskSummary[] };

/** Prefer active linked tasks for primary navigation; archived never block starting another. */
export function resolveLinkedWorkPrimaryAction(
  linkedTasks: LinkedIssueTaskSummary[]
): LinkedWorkPrimaryAction {
  const active = linkedTasks.filter((task) => task.archivedAt === null);
  if (active.length === 1) return { kind: 'open-task', task: active[0]! };
  if (active.length > 1) return { kind: 'choose-task', tasks: active };
  return { kind: 'start-task' };
}

export function groupLinkedTasksByProject(
  tasks: LinkedIssueTaskSummary[]
): Array<[string, LinkedIssueTaskSummary[]]> {
  const grouped = new Map<string, LinkedIssueTaskSummary[]>();
  for (const task of tasks) {
    const projectTasks = grouped.get(task.projectName) ?? [];
    projectTasks.push(task);
    grouped.set(task.projectName, projectTasks);
  }
  return [...grouped.entries()];
}

export function resolveBoardDefaultProjectId(
  savedDefaultProjectId: string | null | undefined,
  mountedProjectIds: ReadonlySet<string>
): { projectId: string | null; isStale: boolean } {
  if (!savedDefaultProjectId) return { projectId: null, isStale: false };
  if (mountedProjectIds.has(savedDefaultProjectId)) {
    return { projectId: savedDefaultProjectId, isStale: false };
  }
  return { projectId: null, isStale: true };
}

export function jiraBoardColumnWidthCss(width: JiraBoardColumnWidth | undefined): string {
  const widths: Record<JiraBoardColumnWidth, string> = {
    compact: '17rem',
    comfortable: '20rem',
    wide: '24rem',
  };
  return `min(${widths[width ?? 'comfortable']}, calc(100vw - 2rem))`;
}

export function resolveDefaultJiraTransition(
  columns: JiraBoardColumn[],
  currentStatusId: string | null,
  transitions: JiraIssueTransition[]
): JiraIssueTransition | null {
  if (!currentStatusId) return null;
  const currentColumnIndex = columns.findIndex((column) =>
    column.statusIds.includes(currentStatusId)
  );
  const nextColumn = columns[currentColumnIndex + 1];
  if (!nextColumn) return null;

  return (
    transitions.find(
      (transition) =>
        transition.requiredFields.length === 0 &&
        nextColumn.statusIds.includes(transition.toStatusId)
    ) ?? null
  );
}

export function resolveStartTaskJiraTransition(
  currentStatusCategoryName: string | null | undefined,
  defaultTransition: JiraIssueTransition | null
): JiraIssueTransition | null {
  if (currentStatusCategoryName?.trim().toLocaleLowerCase() !== 'to do') return null;
  if (defaultTransition?.toStatusCategoryName?.trim().toLocaleLowerCase() !== 'in progress') {
    return null;
  }
  return defaultTransition;
}
