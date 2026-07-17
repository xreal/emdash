import { describe, expect, it } from 'vitest';
import type { JiraBoardIssue } from '@shared/core/jira/jira-board';
import {
  filterJiraIssues,
  groupJiraIssuesByColumn,
  JIRA_UNASSIGNED_FILTER,
  resolveJiraSprintId,
  sortJiraSprints,
} from './jira-board-utils';

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
