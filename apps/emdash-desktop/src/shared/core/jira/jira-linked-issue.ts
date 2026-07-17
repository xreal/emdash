import type { LinkedIssue } from '@shared/core/linked-issue';
import type { JiraBoardIssue } from './jira-board';

export type JiraBoardIssueToLinkedIssueInput = Pick<
  JiraBoardIssue,
  'key' | 'summary' | 'statusName' | 'assigneeName' | 'updatedAt' | 'url'
> & {
  projectName?: string | null;
  description?: string | null;
  fetchedAt?: string;
};

/**
 * Map a board-loaded Jira issue and optional fetched detail into the linked-issue task snapshot.
 * Description is included only when Jira's issue-detail endpoint supplied it.
 */
export function jiraBoardIssueToLinkedIssue(issue: JiraBoardIssueToLinkedIssueInput): LinkedIssue {
  const assignees = issue.assigneeName ? [issue.assigneeName] : undefined;
  const project = issue.projectName?.trim() || undefined;
  const status = issue.statusName ?? undefined;
  const updatedAt = issue.updatedAt ?? undefined;
  const description = issue.description?.trim() || undefined;

  return {
    provider: 'jira',
    url: issue.url,
    identifier: issue.key,
    title: issue.summary,
    ...(description ? { description } : {}),
    ...(status ? { status } : {}),
    ...(assignees ? { assignees } : {}),
    ...(project ? { project } : {}),
    ...(updatedAt ? { updatedAt } : {}),
    fetchedAt: issue.fetchedAt ?? new Date().toISOString(),
  };
}
