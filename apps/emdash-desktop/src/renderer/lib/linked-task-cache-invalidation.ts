import { events } from '@renderer/lib/ipc';
import { queryClient } from '@renderer/lib/query-client';
import {
  taskCreatedChannel,
  taskDeletedChannel,
  taskPrUpdatedChannel,
} from '@shared/core/tasks/taskEvents';

const LINKED_ISSUE_URLS_QUERY_KEY = ['tasks', 'linked-issue-urls'] as const;

/** Invalidate board-wide linked-task React Query caches. */
export function invalidateLinkedIssueUrlsCache(): void {
  void queryClient.invalidateQueries({ queryKey: LINKED_ISSUE_URLS_QUERY_KEY });
}

/**
 * Refresh board-wide linked-task summaries after task lifecycle events that
 * affect linkage or PR badges. Archive/restore/linked-issue updates call
 * `invalidateLinkedIssueUrlsCache` from the renderer mutation path because those
 * operations do not emit a dedicated IPC channel.
 */
export function wireLinkedTaskCacheInvalidation(): void {
  events.on(taskCreatedChannel, () => {
    invalidateLinkedIssueUrlsCache();
  });
  events.on(taskDeletedChannel, () => {
    invalidateLinkedIssueUrlsCache();
  });
  events.on(taskPrUpdatedChannel, () => {
    invalidateLinkedIssueUrlsCache();
  });
}
