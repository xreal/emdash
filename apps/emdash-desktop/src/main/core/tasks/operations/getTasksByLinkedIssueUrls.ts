import { count, eq, inArray } from 'drizzle-orm';
import { db } from '@main/db/client';
import {
  conversations,
  projectRemotes,
  projects,
  pullRequests,
  tasks,
  workspaces,
} from '@main/db/schema';
import type { LinkedIssueTaskSummary, TaskLifecycleStatus } from '@shared/core/tasks/tasks';

const MAX_ISSUE_URLS = 1_000;

export async function getTasksByLinkedIssueUrls(
  issueUrls: string[]
): Promise<LinkedIssueTaskSummary[]> {
  const canonicalUrls = new Set(issueUrls.map(canonicalizeIssueUrl));
  if (canonicalUrls.size === 0) return [];
  if (canonicalUrls.size > MAX_ISSUE_URLS) {
    throw new Error(`At most ${String(MAX_ISSUE_URLS)} linked issue URLs can be queried at once.`);
  }

  const rows = await db
    .select({
      taskId: tasks.id,
      taskName: tasks.name,
      projectId: tasks.projectId,
      projectName: projects.name,
      status: tasks.status,
      linkedIssue: tasks.linkedIssue,
      archivedAt: tasks.archivedAt,
      updatedAt: tasks.updatedAt,
      branchName: workspaces.branchName,
    })
    .from(tasks)
    .innerJoin(projects, eq(tasks.projectId, projects.id))
    .leftJoin(workspaces, eq(tasks.workspaceId, workspaces.id));

  const matchedRows = rows.filter(
    (row) =>
      row.linkedIssue && canonicalUrls.has(tryCanonicalizeIssueUrl(row.linkedIssue.url) ?? '')
  );
  if (matchedRows.length === 0) return [];

  const taskIds = matchedRows.map((row) => row.taskId);
  const projectIds = [...new Set(matchedRows.map((row) => row.projectId))];
  const branches = [
    ...new Set(
      matchedRows.map((row) => row.branchName).filter((value): value is string => !!value)
    ),
  ];
  const [conversationRows, remoteRows] = await Promise.all([
    db
      .select({
        taskId: conversations.taskId,
        provider: conversations.provider,
        agentStatus: conversations.agentStatus,
        count: count(),
      })
      .from(conversations)
      .where(inArray(conversations.taskId, taskIds))
      .groupBy(conversations.taskId, conversations.provider, conversations.agentStatus),
    db.select().from(projectRemotes).where(inArray(projectRemotes.projectId, projectIds)),
  ]);
  const pullRequestRows =
    branches.length === 0
      ? []
      : await db
          .select({
            url: pullRequests.url,
            repositoryUrl: pullRequests.repositoryUrl,
            headRepositoryUrl: pullRequests.headRepositoryUrl,
            headRefName: pullRequests.headRefName,
            identifier: pullRequests.identifier,
            title: pullRequests.title,
            status: pullRequests.status,
            isDraft: pullRequests.isDraft,
          })
          .from(pullRequests)
          .where(inArray(pullRequests.headRefName, branches));

  const remotesByProject = new Map<string, Set<string>>();
  for (const remote of remoteRows) {
    const remoteUrls = remotesByProject.get(remote.projectId) ?? new Set<string>();
    remoteUrls.add(remote.remoteUrl);
    remotesByProject.set(remote.projectId, remoteUrls);
  }

  return matchedRows
    .map((row): LinkedIssueTaskSummary => {
      const taskConversations = conversationRows.filter(
        (conversation) => conversation.taskId === row.taskId
      );
      const conversationStats: Record<string, number> = {};
      for (const conversation of taskConversations) {
        const provider = conversation.provider ?? 'unknown';
        conversationStats[provider] = (conversationStats[provider] ?? 0) + conversation.count;
      }
      const projectRemoteUrls = remotesByProject.get(row.projectId) ?? new Set<string>();

      return {
        taskId: row.taskId,
        taskName: row.taskName,
        projectId: row.projectId,
        projectName: row.projectName,
        status: row.status as TaskLifecycleStatus,
        issueUrl: canonicalizeIssueUrl(row.linkedIssue!.url),
        archivedAt: row.archivedAt,
        updatedAt: row.updatedAt,
        branchName: row.branchName,
        conversations: conversationStats,
        activeAgentStatuses: taskConversations.flatMap((conversation) => {
          if (
            conversation.agentStatus !== 'working' &&
            conversation.agentStatus !== 'awaiting-input' &&
            conversation.agentStatus !== 'error'
          ) {
            return [];
          }
          return [
            {
              provider: conversation.provider ?? 'unknown',
              status: conversation.agentStatus,
            },
          ];
        }),
        pullRequests: pullRequestRows
          .filter(
            (pullRequest) =>
              pullRequest.headRefName === row.branchName &&
              (projectRemoteUrls.has(pullRequest.repositoryUrl) ||
                projectRemoteUrls.has(pullRequest.headRepositoryUrl))
          )
          .map((pullRequest) => ({
            url: pullRequest.url,
            identifier: pullRequest.identifier,
            title: pullRequest.title,
            status: pullRequest.status as LinkedIssueTaskSummary['pullRequests'][number]['status'],
            isDraft: pullRequest.isDraft === 1,
          })),
      };
    })
    .sort((left, right) => {
      const projectOrder = left.projectName.localeCompare(right.projectName);
      return projectOrder !== 0 ? projectOrder : right.updatedAt.localeCompare(left.updatedAt);
    });
}

function canonicalizeIssueUrl(value: string): string {
  const url = new URL(value.trim());
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error('Linked issue URLs must use HTTP or HTTPS.');
  }
  url.hash = '';
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString();
}

function tryCanonicalizeIssueUrl(value: string): string | null {
  try {
    return canonicalizeIssueUrl(value);
  } catch {
    return null;
  }
}
