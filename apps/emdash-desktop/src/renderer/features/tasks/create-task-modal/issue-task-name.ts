import { normalizeTaskName } from '@renderer/utils/taskNames';
import type { LinkedIssue } from '@shared/core/linked-issue';

const MAX_JIRA_TASK_NAME_LENGTH = 50;

export function getIssueTaskName(
  issue: LinkedIssue | null | undefined,
  options?: { preserveCapitalization?: boolean; generatedName?: string }
): string | null {
  if (!issue) {
    return null;
  }

  const branchName = issue.branchName?.trim();
  if (branchName) {
    const normalized = normalizeTaskName(branchName.replace(/\//g, '-'), options);
    return normalized || null;
  }

  if (issue.provider === 'jira') {
    const identifier = normalizeTaskName(issue.identifier, { preserveCapitalization: true });
    const title = normalizeTaskName(options?.generatedName ?? issue.title);
    const maxTitleLength = MAX_JIRA_TASK_NAME_LENGTH - identifier.length - 1;
    const words = title.split('-').filter(Boolean);
    let shortenedTitle = '';
    for (const word of words) {
      const candidate = shortenedTitle ? `${shortenedTitle}-${word}` : word;
      if (candidate.length > maxTitleLength) break;
      shortenedTitle = candidate;
    }
    return shortenedTitle ? `${identifier}-${shortenedTitle}` : identifier || null;
  }

  return null;
}
