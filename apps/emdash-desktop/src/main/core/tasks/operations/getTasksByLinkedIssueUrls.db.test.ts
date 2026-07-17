import { openFixture } from '@tooling/utils/db';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppDb } from '@main/db/client';
import { getTasksByLinkedIssueUrls } from './getTasksByLinkedIssueUrls';

const mocks = vi.hoisted(() => ({
  db: undefined as AppDb | undefined,
}));

vi.mock('@main/db/client', () => ({
  get db() {
    if (!mocks.db) throw new Error('Test database not initialized');
    return mocks.db;
  },
}));

describe('getTasksByLinkedIssueUrls', () => {
  let fixture: Awaited<ReturnType<typeof openFixture>>;

  beforeEach(async () => {
    fixture = await openFixture('empty');
    mocks.db = fixture.db;

    fixture.sqlite
      .prepare(
        `INSERT INTO projects (id, name, path, created_at, updated_at)
         VALUES
           ('project-1', 'Alpha', '/alpha', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
           ('project-2', 'Beta', '/beta', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      )
      .run();
    fixture.sqlite
      .prepare(
        `INSERT INTO workspaces (id, type, branch_name, created_at, updated_at)
         VALUES ('workspace-1', 'local', 'feature/plat-7', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      )
      .run();
  });

  afterEach(() => {
    fixture?.close();
    mocks.db = undefined;
  });

  it('returns persisted task context across projects, including archived tasks', async () => {
    insertTask({
      id: 'task-1',
      projectId: 'project-1',
      name: 'Implement endpoint',
      issueUrl: 'https://example.atlassian.net/browse/PLAT-7',
      workspaceId: 'workspace-1',
    });
    insertTask({
      id: 'task-2',
      projectId: 'project-2',
      name: 'Update client',
      issueUrl: 'https://example.atlassian.net/browse/PLAT-7',
      archivedAt: '2026-07-16 12:00:00',
    });
    insertTask({
      id: 'task-other',
      projectId: 'project-1',
      name: 'Other issue',
      issueUrl: 'https://example.atlassian.net/browse/PLAT-8',
    });
    fixture.sqlite
      .prepare(
        `INSERT INTO conversations (
           id, project_id, task_id, title, provider, agent_status, created_at, updated_at
         ) VALUES
           ('conversation-1', 'project-1', 'task-1', 'Coding', 'claude-code', 'working', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
           ('conversation-2', 'project-1', 'task-1', 'Review', 'claude-code', 'idle', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      )
      .run();
    fixture.sqlite
      .prepare(
        `INSERT INTO project_remotes (project_id, remote_name, remote_url)
         VALUES ('project-1', 'origin', 'https://github.com/emdash/emdash.git')`
      )
      .run();
    fixture.sqlite
      .prepare(
        `INSERT INTO pull_requests (
           url, provider, repository_url, base_ref_name, base_ref_oid,
           head_repository_url, head_ref_name, head_ref_oid, identifier, title, status, is_draft,
           pull_request_created_at, pull_request_updated_at
         ) VALUES (
           'https://github.com/emdash/emdash/pull/7', 'github',
           'https://github.com/emdash/emdash.git', 'main', 'base-sha',
           'https://github.com/emdash/emdash.git', 'feature/plat-7', 'head-sha', '#7',
           'Implement PLAT-7', 'open', 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
         )`
      )
      .run();

    const rows = await getTasksByLinkedIssueUrls([
      ' https://EXAMPLE.atlassian.net/browse/PLAT-7/ ',
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.projectName)).toEqual(['Alpha', 'Beta']);
    expect(rows[0]).toMatchObject({
      taskId: 'task-1',
      branchName: 'feature/plat-7',
      conversations: { 'claude-code': 2 },
      activeAgentStatuses: [{ provider: 'claude-code', status: 'working' }],
      pullRequests: [
        {
          identifier: '#7',
          status: 'open',
          isDraft: false,
        },
      ],
    });
    expect(rows[1]!.archivedAt).toBe('2026-07-16 12:00:00');
  });

  it('rejects non-HTTP issue URLs', async () => {
    await expect(getTasksByLinkedIssueUrls(['file:///tmp/issue'])).rejects.toThrow(
      'Linked issue URLs must use HTTP or HTTPS.'
    );
  });

  function insertTask({
    id,
    projectId,
    name,
    issueUrl,
    workspaceId = null,
    archivedAt = null,
  }: {
    id: string;
    projectId: string;
    name: string;
    issueUrl: string;
    workspaceId?: string | null;
    archivedAt?: string | null;
  }) {
    fixture.sqlite
      .prepare(
        `INSERT INTO tasks (
           id, project_id, name, status, linked_issue, archived_at, workspace_id,
           created_at, updated_at, status_changed_at
         ) VALUES (?, ?, ?, 'in_progress', ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
      )
      .run(
        id,
        projectId,
        name,
        JSON.stringify({
          provider: 'jira',
          url: issueUrl,
          title: name,
          identifier: 'PLAT-7',
        }),
        archivedAt,
        workspaceId
      );
  }
});
