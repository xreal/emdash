import { describe, expect, it } from 'vitest';
import {
  jiraBoardConfigurationSchema,
  jiraBoardIssuePageSchema,
  jiraWorkspaceSettingsSchema,
  MAX_SAVED_JIRA_BOARDS,
  type JiraBoardSummary,
} from './jira-board';

function board(id: number): JiraBoardSummary {
  return {
    accountId: 'example.atlassian.net',
    id,
    name: `Board ${id}`,
    type: id % 2 === 0 ? 'scrum' : 'kanban',
    projectKey: null,
    projectName: null,
  };
}

describe('jiraWorkspaceSettingsSchema', () => {
  it('accepts up to ten unique saved boards', () => {
    const savedBoards = Array.from({ length: MAX_SAVED_JIRA_BOARDS }, (_, index) => board(index));

    expect(
      jiraWorkspaceSettingsSchema.parse({
        activeAccountId: 'example.atlassian.net',
        savedBoards,
      })
    ).toEqual({ activeAccountId: 'example.atlassian.net', savedBoards });
  });

  it('rejects duplicate boards and more than ten boards', () => {
    expect(
      jiraWorkspaceSettingsSchema.safeParse({
        activeAccountId: 'example.atlassian.net',
        savedBoards: [board(1), board(1)],
      }).success
    ).toBe(false);
    expect(
      jiraWorkspaceSettingsSchema.safeParse({
        activeAccountId: 'example.atlassian.net',
        savedBoards: Array.from({ length: MAX_SAVED_JIRA_BOARDS + 1 }, (_, index) => board(index)),
      }).success
    ).toBe(false);
  });
});

describe('Jira board data schemas', () => {
  it('validates native columns, the active sprint, and issue pages', () => {
    expect(
      jiraBoardConfigurationSchema.parse({
        accountId: 'example.atlassian.net',
        id: 12,
        name: 'Platform',
        type: 'scrum',
        columns: [
          {
            id: '12:0',
            name: 'To do',
            statusIds: ['10000'],
            min: null,
            max: 5,
          },
        ],
        constraintType: 'issueCount',
        activeSprint: {
          id: 20,
          name: 'Sprint 20',
          state: 'active',
          startDate: null,
          endDate: null,
          completeDate: null,
          goal: null,
        },
      }).activeSprint?.name
    ).toBe('Sprint 20');

    expect(
      jiraBoardIssuePageSchema.parse({
        startAt: 0,
        maxResults: 50,
        total: 1,
        isLast: true,
        issues: [
          {
            id: '10001',
            key: 'PLAT-1',
            summary: 'Render the Jira board',
            statusId: '10000',
            statusName: 'To do',
            assigneeName: null,
            assigneeAvatarUrl: null,
            issueTypeName: 'Story',
            issueTypeIconUrl: null,
            priorityName: null,
            priorityIconUrl: null,
            updatedAt: null,
            url: 'https://example.atlassian.net/browse/PLAT-1',
          },
        ],
      }).issues
    ).toHaveLength(1);
  });
});
