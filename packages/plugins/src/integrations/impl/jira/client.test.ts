import type { AgileModels } from 'jira.js';
import { describe, expect, it, vi } from 'vitest';
import {
  fetchJiraBoardConfiguration,
  fetchJiraBoardIssues,
  fetchJiraBoards,
  fetchJiraIssueDetail,
  fetchJiraIssueTransitions,
  fetchJiraSprints,
  executeJiraIssueTransition,
  getJiraAccountId,
} from './client';
import type { JiraAgileClient, JiraClient } from './types';

function agileClient(board: Record<string, unknown>): Pick<JiraAgileClient, 'board'> {
  return { board } as unknown as Pick<JiraAgileClient, 'board'>;
}

function jiraClient(issues: Record<string, unknown>): Pick<JiraClient, 'issues'> {
  return { issues } as unknown as Pick<JiraClient, 'issues'>;
}

describe('fetchJiraBoards', () => {
  it('paginates and maps supported Jira Software boards', async () => {
    const pages: AgileModels.GetAllBoards[] = [
      {
        startAt: 0,
        total: 4,
        isLast: false,
        values: [
          {
            id: 12,
            name: ' Platform ',
            type: 'scrum',
            location: { projectKey: 'PLAT', projectName: 'Platform' },
          },
          { id: 13, name: 'Basic board', type: 'simple' },
          { name: 'Missing id', type: 'kanban' },
        ],
      },
      {
        startAt: 3,
        total: 4,
        isLast: true,
        values: [
          {
            id: 14,
            name: 'Operations',
            type: 'kanban',
            location: { name: 'Operations project' },
          },
        ],
      },
    ];
    const getAllBoards = vi.fn(async () => pages.shift()!);
    const client = {
      board: { getAllBoards },
    } as unknown as Pick<JiraAgileClient, 'board'>;

    await expect(fetchJiraBoards(client)).resolves.toEqual([
      {
        id: 12,
        name: 'Platform',
        type: 'scrum',
        projectKey: 'PLAT',
        projectName: 'Platform',
      },
      {
        id: 14,
        name: 'Operations',
        type: 'kanban',
        projectKey: null,
        projectName: 'Operations project',
      },
    ]);
    expect(getAllBoards).toHaveBeenNthCalledWith(1, {
      startAt: 0,
      maxResults: 50,
      orderBy: 'name',
    });
    expect(getAllBoards).toHaveBeenNthCalledWith(2, {
      startAt: 3,
      maxResults: 50,
      orderBy: 'name',
    });
  });
});

describe('getJiraAccountId', () => {
  it('uses the normalized Jira site host', () => {
    expect(
      getJiraAccountId({
        siteUrl: 'https://Example.ATLASSIAN.net/',
        email: 'developer@example.com',
        apiToken: 'token',
      })
    ).toEqual({ success: true, data: 'example.atlassian.net' });
  });
});

describe('fetchJiraBoardConfiguration', () => {
  it('maps columns and deterministically selects a valid active sprint', async () => {
    const getConfiguration = vi.fn(async () => ({
      id: 12,
      name: ' Platform ',
      type: 'scrum',
      columnConfig: {
        constraintType: 'issueCount',
        columns: [
          {
            name: ' To do ',
            min: 1,
            max: 5,
            statuses: [{ id: '10000' }, { id: ' ' }, {}],
          },
          { name: ' ', statuses: [{ id: 'ignored' }] },
          { name: 'Done', statuses: [{ id: '10002' }] },
        ],
      },
    }));
    const getAllSprints = vi
      .fn()
      .mockResolvedValueOnce({
        startAt: 0,
        total: 3,
        isLast: false,
        values: [
          { id: 40, name: 'Later active', state: 'active', goal: ' Ship it ' },
          { id: 10, name: 'Future', state: 'future' },
        ],
      })
      .mockResolvedValueOnce({
        startAt: 2,
        total: 3,
        isLast: true,
        values: [
          {
            id: 20,
            name: 'Current sprint',
            state: 'active',
            startDate: '2026-07-01',
            endDate: '2026-07-14',
          },
        ],
      });

    await expect(
      fetchJiraBoardConfiguration(agileClient({ getConfiguration, getAllSprints }), 12)
    ).resolves.toEqual({
      id: 12,
      name: 'Platform',
      type: 'scrum',
      columns: [
        { id: '12:0', name: 'To do', statusIds: ['10000'], min: 1, max: 5 },
        { id: '12:2', name: 'Done', statusIds: ['10002'], min: null, max: null },
      ],
      constraintType: 'issueCount',
      activeSprint: {
        id: 20,
        name: 'Current sprint',
        state: 'active',
        startDate: '2026-07-01',
        endDate: '2026-07-14',
        completeDate: null,
        goal: null,
      },
    });
    expect(getAllSprints).toHaveBeenNthCalledWith(1, {
      boardId: 12,
      startAt: 0,
      maxResults: 50,
      state: 'active',
    });
    expect(getAllSprints).toHaveBeenNthCalledWith(2, {
      boardId: 12,
      startAt: 2,
      maxResults: 50,
      state: 'active',
    });
  });

  it('does not request sprints for a Kanban board', async () => {
    const getConfiguration = vi.fn(async () => ({
      id: 14,
      name: 'Operations',
      type: 'kanban',
      columnConfig: { columns: [] },
    }));
    const getAllSprints = vi.fn();

    await expect(
      fetchJiraBoardConfiguration(agileClient({ getConfiguration, getAllSprints }), 14)
    ).resolves.toMatchObject({ id: 14, type: 'kanban', activeSprint: null });
    expect(getAllSprints).not.toHaveBeenCalled();
  });
});

describe('fetchJiraSprints', () => {
  it('paginates and maps active, future, and closed sprints', async () => {
    const getAllSprints = vi
      .fn()
      .mockResolvedValueOnce({
        startAt: 0,
        total: 3,
        isLast: false,
        values: [
          { id: 20, name: 'Current', state: 'active' },
          { id: 30, name: 'Next', state: 'future' },
        ],
      })
      .mockResolvedValueOnce({
        startAt: 2,
        total: 3,
        isLast: true,
        values: [{ id: 10, name: 'Previous', state: 'closed' }],
      });

    await expect(fetchJiraSprints(agileClient({ getAllSprints }), 12)).resolves.toEqual([
      {
        id: 10,
        name: 'Previous',
        state: 'closed',
        startDate: null,
        endDate: null,
        completeDate: null,
        goal: null,
      },
      {
        id: 20,
        name: 'Current',
        state: 'active',
        startDate: null,
        endDate: null,
        completeDate: null,
        goal: null,
      },
      {
        id: 30,
        name: 'Next',
        state: 'future',
        startDate: null,
        endDate: null,
        completeDate: null,
        goal: null,
      },
    ]);
    expect(getAllSprints).toHaveBeenNthCalledWith(1, {
      boardId: 12,
      startAt: 0,
      maxResults: 50,
    });
    expect(getAllSprints).toHaveBeenNthCalledWith(2, {
      boardId: 12,
      startAt: 2,
      maxResults: 50,
    });
  });
});

describe('fetchJiraBoardIssues', () => {
  const issue = {
    id: '10001',
    key: 'PLAT-7',
    fields: {
      summary: ' Ship the board ',
      status: { id: '3', name: 'In Progress' },
      assignee: {
        displayName: 'Ada Lovelace',
        avatarUrls: { '48x48': 'https://avatar.example/ada.png' },
      },
      issuetype: { name: 'Story', iconUrl: 'https://icons.example/story.svg' },
      priority: { name: 'High', iconUrl: 'https://icons.example/high.svg' },
      updated: '2026-07-17T10:00:00.000Z',
    },
  };

  it('uses the board endpoint, clamps pagination, maps fields, and computes isLast', async () => {
    const getIssuesForBoard = vi.fn(async () => ({
      startAt: 0,
      maxResults: 100,
      total: 1,
      issues: [issue, { id: 'invalid', key: 'PLAT-8', fields: { summary: ' ' } }],
    }));
    const getBoardIssuesForSprint = vi.fn();

    await expect(
      fetchJiraBoardIssues(
        agileClient({ getIssuesForBoard, getBoardIssuesForSprint }),
        'https://example.atlassian.net/',
        { boardId: 12, startAt: -4, maxResults: 500 }
      )
    ).resolves.toEqual({
      startAt: 0,
      maxResults: 100,
      total: 1,
      isLast: true,
      issues: [
        {
          id: '10001',
          key: 'PLAT-7',
          summary: 'Ship the board',
          statusId: '3',
          statusName: 'In Progress',
          assigneeName: 'Ada Lovelace',
          assigneeAvatarUrl: 'https://avatar.example/ada.png',
          issueTypeName: 'Story',
          issueTypeIconUrl: 'https://icons.example/story.svg',
          priorityName: 'High',
          priorityIconUrl: 'https://icons.example/high.svg',
          updatedAt: '2026-07-17T10:00:00.000Z',
          url: 'https://example.atlassian.net/browse/PLAT-7',
        },
      ],
    });
    expect(getIssuesForBoard).toHaveBeenCalledWith({
      boardId: 12,
      startAt: 0,
      maxResults: 100,
      fields: ['summary', 'status', 'assignee', 'issuetype', 'priority', 'updated'],
    });
    expect(getBoardIssuesForSprint).not.toHaveBeenCalled();
  });

  it('uses the sprint endpoint and reports a non-final page safely', async () => {
    const getIssuesForBoard = vi.fn();
    const getBoardIssuesForSprint = vi.fn(async () => ({
      startAt: 10,
      maxResults: 1,
      total: 20,
      issues: [issue],
    }));

    await expect(
      fetchJiraBoardIssues(
        agileClient({ getIssuesForBoard, getBoardIssuesForSprint }),
        'https://example.atlassian.net',
        { boardId: 12, sprintId: 20, startAt: 10, maxResults: 1 }
      )
    ).resolves.toMatchObject({ startAt: 10, maxResults: 1, total: 20, isLast: false });
    expect(getBoardIssuesForSprint).toHaveBeenCalledWith({
      boardId: 12,
      sprintId: 20,
      startAt: 10,
      maxResults: 1,
      fields: ['summary', 'status', 'assignee', 'issuetype', 'priority', 'updated'],
    });
    expect(getIssuesForBoard).not.toHaveBeenCalled();
  });
});

describe('fetchJiraIssueDetail', () => {
  it('requests bounded fields and maps rich issue metadata defensively', async () => {
    const getIssue = vi.fn(async () => ({
      id: '10001',
      key: 'PLAT-7',
      fields: {
        summary: 'Ship the board',
        description: {
          type: 'doc',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Developer context.' }] },
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'First item' }] }],
                },
                {
                  type: 'listItem',
                  content: [
                    { type: 'paragraph', content: [{ type: 'text', text: 'Second item' }] },
                  ],
                },
              ],
            },
          ],
        },
        status: { name: 'In Progress', statusCategory: { name: 'In Progress' } },
        assignee: { displayName: 'Ada Lovelace' },
        reporter: { displayName: 'Grace Hopper' },
        issuetype: { name: 'Story' },
        priority: { name: 'High' },
        project: { key: 'PLAT', name: 'Platform' },
        parent: { key: 'PLAT-1', fields: { summary: 'Board epic' } },
        labels: ['frontend', 'frontend', 'developer-experience'],
        components: [{ name: 'Desktop' }, { name: 'Jira' }, {}],
        resolution: { name: 'Done' },
        created: '2026-07-10T10:00:00.000Z',
        updated: '2026-07-17T10:00:00.000Z',
        duedate: '2026-07-31',
        resolutiondate: '2026-07-18T10:00:00.000Z',
      },
    }));

    await expect(
      fetchJiraIssueDetail(jiraClient({ getIssue }), 'https://example.atlassian.net/', 'PLAT-7')
    ).resolves.toEqual({
      id: '10001',
      key: 'PLAT-7',
      summary: 'Ship the board',
      description: 'Developer context.\n\n- First item\n- Second item',
      statusName: 'In Progress',
      statusCategoryName: 'In Progress',
      assigneeName: 'Ada Lovelace',
      reporterName: 'Grace Hopper',
      issueTypeName: 'Story',
      priorityName: 'High',
      projectKey: 'PLAT',
      projectName: 'Platform',
      parentKey: 'PLAT-1',
      parentSummary: 'Board epic',
      labels: ['frontend', 'developer-experience'],
      components: ['Desktop', 'Jira'],
      resolutionName: 'Done',
      createdAt: '2026-07-10T10:00:00.000Z',
      updatedAt: '2026-07-17T10:00:00.000Z',
      dueDate: '2026-07-31',
      resolvedAt: '2026-07-18T10:00:00.000Z',
      url: 'https://example.atlassian.net/browse/PLAT-7',
    });
    expect(getIssue).toHaveBeenCalledWith({
      issueIdOrKey: 'PLAT-7',
      fields: [
        'summary',
        'description',
        'status',
        'assignee',
        'reporter',
        'issuetype',
        'priority',
        'project',
        'parent',
        'labels',
        'components',
        'resolution',
        'created',
        'updated',
        'duedate',
        'resolutiondate',
      ],
      failFast: false,
    });
  });

  it('rejects issue responses without required identity fields', async () => {
    await expect(
      fetchJiraIssueDetail(
        jiraClient({ getIssue: vi.fn(async () => ({ key: 'PLAT-7', fields: {} })) }),
        'https://example.atlassian.net',
        'PLAT-7'
      )
    ).rejects.toThrow('invalid issue response');
  });
});

describe('Jira issue transitions', () => {
  it('maps available transitions and required fields defensively', async () => {
    const getTransitions = vi.fn(async () => ({
      transitions: [
        {
          id: '21',
          name: 'Start Progress',
          isAvailable: true,
          to: {
            id: '3',
            name: 'In Progress',
            statusCategory: { name: 'In Progress' },
          },
          fields: {},
        },
        {
          id: '31',
          name: 'Resolve',
          to: { id: '10002', name: 'Done' },
          fields: {
            resolution: { name: 'Resolution', required: true },
            comment: { name: 'Comment', required: false },
            customfield_10001: { required: true },
          },
        },
        {
          id: '41',
          name: 'Unavailable',
          isAvailable: false,
          to: { id: '4', name: 'Blocked' },
        },
        { id: 'invalid', name: 'Missing destination' },
      ],
    }));

    await expect(
      fetchJiraIssueTransitions(jiraClient({ getTransitions }), 'PLAT-7')
    ).resolves.toEqual([
      {
        id: '21',
        name: 'Start Progress',
        toStatusId: '3',
        toStatusName: 'In Progress',
        toStatusCategoryName: 'In Progress',
        requiredFields: [],
      },
      {
        id: '31',
        name: 'Resolve',
        toStatusId: '10002',
        toStatusName: 'Done',
        toStatusCategoryName: null,
        requiredFields: ['Resolution', 'customfield_10001'],
      },
    ]);
    expect(getTransitions).toHaveBeenCalledWith({
      issueIdOrKey: 'PLAT-7',
      expand: 'transitions.fields',
      sortByOpsBarAndStatus: true,
    });
  });

  it('executes only the selected transition ID', async () => {
    const doTransition = vi.fn(async () => undefined);

    await executeJiraIssueTransition(jiraClient({ doTransition }), 'PLAT-7', '21');

    expect(doTransition).toHaveBeenCalledWith({
      issueIdOrKey: 'PLAT-7',
      transition: { id: '21' },
    });
  });
});
