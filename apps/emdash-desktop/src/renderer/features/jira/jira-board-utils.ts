import type {
  JiraBoardColumn,
  JiraBoardIssue,
  JiraSprintSummary,
} from '@shared/core/jira/jira-board';

export type JiraBoardColumnWithIssues = {
  column: JiraBoardColumn;
  issues: JiraBoardIssue[];
};

export const JIRA_UNASSIGNED_FILTER = '__emdash_unassigned__';

export type JiraIssueFilters = {
  search?: string;
  status?: string;
  assignee?: string;
  issueType?: string;
  priority?: string;
};

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
