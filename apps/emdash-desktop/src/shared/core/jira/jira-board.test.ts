import { describe, expect, it } from 'vitest';
import {
  jiraBoardConfigurationSchema,
  jiraBoardIssuePageSchema,
  jiraIssueTransitionSchema,
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

  it('accepts legacy boards without preferences and preserves board order on update', () => {
    const legacyBoards = [board(1), board(2), board(3)];
    const parsed = jiraWorkspaceSettingsSchema.parse({
      activeAccountId: 'example.atlassian.net',
      savedBoards: legacyBoards,
    });
    expect(parsed.savedBoards.map((entry) => entry.id)).toEqual([1, 2, 3]);
    expect(parsed.savedBoards.every((entry) => entry.defaultProjectId === undefined)).toBe(true);
    expect(parsed.savedBoards.every((entry) => entry.columnWidth === undefined)).toBe(true);

    const updated = jiraWorkspaceSettingsSchema.parse({
      activeAccountId: 'example.atlassian.net',
      savedBoards: parsed.savedBoards.map((entry, index) =>
        index === 1
          ? {
              ...entry,
              defaultProjectId: 'project-missing-or-unknown',
              columnWidth: 'wide' as const,
            }
          : { ...entry, defaultProjectId: null }
      ),
    });
    expect(updated.savedBoards.map((entry) => entry.id)).toEqual([1, 2, 3]);
    expect(updated.savedBoards[1]?.defaultProjectId).toBe('project-missing-or-unknown');
    expect(updated.savedBoards[1]?.columnWidth).toBe('wide');
    expect(updated.savedBoards[0]?.defaultProjectId).toBeNull();
  });

  it('rejects unknown column width preferences', () => {
    expect(
      jiraWorkspaceSettingsSchema.safeParse({
        activeAccountId: 'example.atlassian.net',
        savedBoards: [{ ...board(1), columnWidth: 'extra-wide' }],
      }).success
    ).toBe(false);
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

  it('validates transition suggestions without exposing Jira response objects', () => {
    expect(
      jiraIssueTransitionSchema.parse({
        id: '21',
        name: 'Start Progress',
        toStatusId: '3',
        toStatusName: 'In Progress',
        toStatusCategoryName: 'In Progress',
        requiredFields: [],
      })
    ).toEqual({
      id: '21',
      name: 'Start Progress',
      toStatusId: '3',
      toStatusName: 'In Progress',
      toStatusCategoryName: 'In Progress',
      requiredFields: [],
    });
    expect(
      jiraIssueTransitionSchema.safeParse({
        id: '',
        name: 'Start Progress',
        toStatusId: '3',
        toStatusName: 'In Progress',
        toStatusCategoryName: null,
        requiredFields: [],
      }).success
    ).toBe(false);
  });
});
