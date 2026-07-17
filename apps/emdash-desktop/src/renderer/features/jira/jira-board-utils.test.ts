import { describe, expect, it } from 'vitest';
import type { JiraBoardIssue, JiraIssueTransition } from '@shared/core/jira/jira-board';
import type { LinkedIssueTaskSummary } from '@shared/core/tasks/tasks';
import {
  filterJiraIssues,
  groupJiraIssuesByColumn,
  jiraBoardColumnWidthCss,
  JIRA_UNASSIGNED_FILTER,
  normalizeJiraDescriptionForDisplay,
  resolveBoardDefaultProjectId,
  resolveDefaultJiraTransition,
  resolveJiraSprintId,
  resolveLinkedWorkPrimaryAction,
  resolveStartTaskJiraTransition,
  sortJiraSprints,
} from './jira-board-utils';

describe('normalizeJiraDescriptionForDisplay', () => {
  it('replaces plain and Markdown-escaped Jira emoji shortcodes', () => {
    expect(
      normalizeJiraDescriptionForDisplay(
        ':check_mark: :white\\_check\\_mark: :warning: :custom\\_team:'
      )
    ).toBe('✅ ✅ ⚠️ :custom\\_team:');
  });
});

function issue(id: string, statusId: string | null): JiraBoardIssue {
  return {
    id,
    key: `PLAT-${id}`,
    summary: `Issue ${id}`,
    statusId,
    statusName: null,
    assigneeName: null,
    assigneeAvatarUrl: null,
    issueTypeName: null,
    issueTypeIconUrl: null,
    priorityName: null,
    priorityIconUrl: null,
    updatedAt: null,
    url: `https://example.atlassian.net/browse/PLAT-${id}`,
  };
}

describe('groupJiraIssuesByColumn', () => {
  it('preserves native column order and keeps unmapped statuses visible', () => {
    const result = groupJiraIssuesByColumn(
      [
        { id: 'todo', name: 'To do', statusIds: ['1'], min: null, max: null },
        { id: 'done', name: 'Done', statusIds: ['3'], min: null, max: null },
      ],
      [issue('1', '3'), issue('2', '2'), issue('3', '1')]
    );

    expect(result.map(({ column }) => column.name)).toEqual(['To do', 'Done', 'Other']);
    expect(result.map(({ issues }) => issues.map(({ id }) => id))).toEqual([['3'], ['1'], ['2']]);
  });
});

describe('filterJiraIssues', () => {
  const issues = [
    {
      ...issue('1', '1'),
      summary: 'Fix deployment failure',
      statusName: 'In progress',
      assigneeName: 'Ada Lovelace',
      issueTypeName: 'Bug',
      priorityName: 'High',
    },
    {
      ...issue('2', '2'),
      summary: 'Write release notes',
      statusName: 'To do',
      issueTypeName: 'Task',
      priorityName: 'Low',
    },
  ];

  it('searches issue keys and summaries case-insensitively', () => {
    expect(filterJiraIssues(issues, { search: 'DEPLOYMENT' })).toEqual([issues[0]]);
    expect(filterJiraIssues(issues, { search: 'plat-2' })).toEqual([issues[1]]);
  });

  it('combines common field filters and supports unassigned issues', () => {
    expect(
      filterJiraIssues(issues, {
        status: 'In progress',
        assignee: 'Ada Lovelace',
        issueType: 'Bug',
        priority: 'High',
      })
    ).toEqual([issues[0]]);
    expect(filterJiraIssues(issues, { assignee: JIRA_UNASSIGNED_FILTER })).toEqual([issues[1]]);
  });
});

describe('Jira sprint selection', () => {
  const sprint = (id: number, state: string, endDate: string | null = null) => ({
    id,
    name: `Sprint ${id}`,
    state,
    startDate: null,
    endDate,
    completeDate: null,
    goal: null,
  });

  it('preserves a valid restored sprint and falls back to the active sprint', () => {
    const active = sprint(20, 'active');
    const sprints = [active, sprint(30, 'future'), sprint(10, 'closed')];

    expect(resolveJiraSprintId(10, active, sprints)).toBe(10);
    expect(resolveJiraSprintId(999, active, sprints)).toBe(20);
    expect(resolveJiraSprintId(999, null, sprints)).toBeUndefined();
  });

  it('orders active and upcoming sprints before newest previous sprints', () => {
    const sprints = [
      sprint(10, 'closed', '2026-05-01'),
      sprint(30, 'future', '2026-08-01'),
      sprint(20, 'active', '2026-07-01'),
      sprint(11, 'closed', '2026-06-01'),
    ];

    expect(sortJiraSprints(sprints).map(({ id }) => id)).toEqual([20, 30, 11, 10]);
  });
});

function linkedTask(
  overrides: Partial<LinkedIssueTaskSummary> & Pick<LinkedIssueTaskSummary, 'taskId' | 'projectId'>
): LinkedIssueTaskSummary {
  return {
    taskId: overrides.taskId,
    taskName: overrides.taskName ?? `Task ${overrides.taskId}`,
    projectId: overrides.projectId,
    projectName: overrides.projectName ?? `Project ${overrides.projectId}`,
    status: overrides.status ?? 'in_progress',
    issueUrl: overrides.issueUrl ?? 'https://example.atlassian.net/browse/PLAT-1',
    archivedAt: overrides.archivedAt ?? null,
    updatedAt: overrides.updatedAt ?? '2026-07-17T12:00:00.000Z',
    branchName: overrides.branchName ?? null,
    conversations: overrides.conversations ?? {},
    activeAgentStatuses: overrides.activeAgentStatuses ?? [],
    pullRequests: overrides.pullRequests ?? [],
  };
}

describe('resolveLinkedWorkPrimaryAction', () => {
  it('starts a task when only archived links exist', () => {
    expect(
      resolveLinkedWorkPrimaryAction([
        linkedTask({ taskId: 'a', projectId: 'p1', archivedAt: '2026-07-01T00:00:00.000Z' }),
      ])
    ).toEqual({ kind: 'start-task' });
  });

  it('opens a single active linked task and chooses among several', () => {
    const one = linkedTask({ taskId: 'a', projectId: 'p1' });
    const two = linkedTask({ taskId: 'b', projectId: 'p2' });
    expect(resolveLinkedWorkPrimaryAction([one])).toEqual({ kind: 'open-task', task: one });
    expect(resolveLinkedWorkPrimaryAction([one, two])).toEqual({
      kind: 'choose-task',
      tasks: [one, two],
    });
  });
});

describe('resolveBoardDefaultProjectId', () => {
  it('keeps mounted defaults and marks missing defaults stale', () => {
    expect(resolveBoardDefaultProjectId('p1', new Set(['p1', 'p2']))).toEqual({
      projectId: 'p1',
      isStale: false,
    });
    expect(resolveBoardDefaultProjectId('missing', new Set(['p1']))).toEqual({
      projectId: null,
      isStale: true,
    });
    expect(resolveBoardDefaultProjectId(null, new Set(['p1']))).toEqual({
      projectId: null,
      isStale: false,
    });
  });
});

describe('jiraBoardColumnWidthCss', () => {
  it('uses the current comfortable width for legacy boards and maps each preset', () => {
    expect(jiraBoardColumnWidthCss(undefined)).toBe('min(20rem, calc(100vw - 2rem))');
    expect(jiraBoardColumnWidthCss('compact')).toBe('min(17rem, calc(100vw - 2rem))');
    expect(jiraBoardColumnWidthCss('comfortable')).toBe('min(20rem, calc(100vw - 2rem))');
    expect(jiraBoardColumnWidthCss('wide')).toBe('min(24rem, calc(100vw - 2rem))');
  });
});

describe('Jira transition suggestions', () => {
  const inProgress: JiraIssueTransition = {
    id: '21',
    name: 'Start Progress',
    toStatusId: '2',
    toStatusName: 'In Progress',
    toStatusCategoryName: 'In Progress',
    requiredFields: [],
  };
  const done: JiraIssueTransition = {
    id: '31',
    name: 'Done',
    toStatusId: '3',
    toStatusName: 'Done',
    toStatusCategoryName: 'Done',
    requiredFields: [],
  };
  const columns = [
    { id: 'todo', name: 'To do', statusIds: ['1'], min: null, max: null },
    { id: 'progress', name: 'In progress', statusIds: ['2'], min: null, max: null },
    { id: 'done', name: 'Done', statusIds: ['3'], min: null, max: null },
  ];

  it('uses the first valid transition into the next native board column', () => {
    expect(resolveDefaultJiraTransition(columns, '1', [done, inProgress])).toEqual(inProgress);
    expect(resolveDefaultJiraTransition(columns, '2', [inProgress, done])).toEqual(done);
  });

  it('does not use a transition requiring Jira fields as the default', () => {
    expect(
      resolveDefaultJiraTransition(columns, '1', [
        { ...inProgress, requiredFields: ['Resolution'] },
        done,
      ])
    ).toBeNull();
  });

  it('offers In Progress after starting a task only from the Todo category', () => {
    expect(resolveStartTaskJiraTransition('To Do', inProgress)).toEqual(inProgress);
    expect(resolveStartTaskJiraTransition('In Progress', done)).toBeNull();
    expect(resolveStartTaskJiraTransition('To Do', done)).toBeNull();
  });
});
