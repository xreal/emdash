import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Columns3 } from 'lucide-react';
import { useState } from 'react';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import { rpc } from '@renderer/lib/ipc';
import type { BaseModalProps } from '@renderer/lib/modal/modal-provider';
import { Button } from '@renderer/lib/ui/button';
import { Checkbox } from '@renderer/lib/ui/checkbox';
import {
  DialogContentArea,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/lib/ui/dialog';
import { SearchInput } from '@renderer/lib/ui/search-input';
import { Spinner } from '@renderer/lib/ui/spinner';
import { MAX_SAVED_JIRA_BOARDS, type JiraBoardSummary } from '@shared/core/jira/jira-board';
import { useJiraConnection } from './use-jira-connection';

export const JIRA_BOARDS_QUERY_KEY = ['jira', 'boards'] as const;

function boardKey(board: Pick<JiraBoardSummary, 'accountId' | 'id'>): string {
  return `${board.accountId}:${board.id}`;
}

export function AddJiraBoardsModal({ onSuccess, onClose }: BaseModalProps<void>) {
  const {
    value: settings,
    updateAsync,
    isLoading: isLoadingSettings,
  } = useAppSettingsKey('jiraWorkspace');
  const [selection, setSelection] = useState<Set<string> | null>(null);
  const [search, setSearch] = useState('');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const boardsQuery = useQuery({
    queryKey: JIRA_BOARDS_QUERY_KEY,
    queryFn: () => rpc.jira.listBoards(),
    staleTime: 60_000,
  });
  const connectionQuery = useJiraConnection();

  const savedBoards = settings?.savedBoards ?? [];
  const accountId = connectionQuery.data?.accountId;
  const accountBoards = accountId
    ? savedBoards.filter((board) => board.accountId === accountId)
    : [];
  const selectedKeys = selection ?? new Set(accountBoards.map(boardKey));
  const availableBoards = boardsQuery.data?.success
    ? boardsQuery.data.data.filter((board) => board.accountId === accountId)
    : [];
  const availableKeys = new Set(availableBoards.map(boardKey));
  const unavailableBoards = accountBoards.filter((board) => !availableKeys.has(boardKey(board)));
  const visibleBoards = [...availableBoards, ...unavailableBoards];
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const filteredBoards = normalizedSearch
    ? visibleBoards.filter((board) =>
        [board.name, board.projectName, board.type].some((value) =>
          value?.toLocaleLowerCase().includes(normalizedSearch)
        )
      )
    : visibleBoards;
  const resultError =
    boardsQuery.data && !boardsQuery.data.success ? boardsQuery.data.error.message : null;
  const boardsQueryError =
    boardsQuery.error instanceof Error ? boardsQuery.error.message : 'Unable to load Jira boards.';
  const connectionError =
    connectionQuery.error instanceof Error
      ? connectionQuery.error.message
      : 'Unable to load the Jira connection.';
  const discoveryError =
    (connectionQuery.isError ? connectionError : null) ??
    resultError ??
    (boardsQuery.isError ? boardsQueryError : null);

  const toggleBoard = (board: JiraBoardSummary, checked: boolean) => {
    setSelection((current) => {
      const next = new Set(current ?? accountBoards.map(boardKey));
      const key = boardKey(board);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
    setSaveError(null);
  };

  const saveBoards = async () => {
    if (!accountId) {
      setSaveError('Reconnect Jira before saving boards.');
      return;
    }
    if (selectedKeys.size > MAX_SAVED_JIRA_BOARDS) {
      setSaveError(`Select at most ${MAX_SAVED_JIRA_BOARDS} Jira boards.`);
      return;
    }

    const availableByKey = new Map(visibleBoards.map((board) => [boardKey(board), board]));
    const retained = accountBoards.filter((board) => selectedKeys.has(boardKey(board)));
    const retainedKeys = new Set(retained.map(boardKey));
    const added = [...selectedKeys]
      .filter((key) => !retainedKeys.has(key))
      .map((key) => availableByKey.get(key))
      .filter((board): board is JiraBoardSummary => board !== undefined);

    setIsSaving(true);
    setSaveError(null);
    try {
      await updateAsync({
        activeAccountId: accountId,
        savedBoards: [...retained, ...added],
      });
      onSuccess();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save Jira boards.');
    } finally {
      setIsSaving(false);
    }
  };

  const isLoading =
    isLoadingSettings ||
    boardsQuery.isLoading ||
    connectionQuery.isLoading ||
    connectionQuery.isFetching;

  return (
    <>
      <DialogHeader className="flex-col items-start gap-1">
        <DialogTitle>Add Jira boards</DialogTitle>
        <DialogDescription>
          Choose up to {MAX_SAVED_JIRA_BOARDS} Scrum or Kanban boards for the sidebar.
        </DialogDescription>
      </DialogHeader>

      <DialogContentArea className="min-h-64">
        {isLoading ? (
          <div className="flex h-48 items-center justify-center text-foreground-muted">
            <Spinner size="sm" />
          </div>
        ) : discoveryError ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3 text-center">
            <AlertCircle className="size-5 text-foreground-muted" />
            <div>
              <p className="text-sm text-foreground">Unable to load Jira boards</p>
              <p className="mt-1 max-w-sm text-xs text-foreground-muted">{discoveryError}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                void connectionQuery.refetch();
                void boardsQuery.refetch();
              }}
            >
              Try again
            </Button>
          </div>
        ) : visibleBoards.length === 0 ? (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-center">
            <Columns3 className="size-5 text-foreground-muted" />
            <p className="text-sm text-foreground">No Scrum or Kanban boards found</p>
            <p className="max-w-sm text-xs text-foreground-muted">
              Emdash only shows Jira Software boards available to the connected account.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <SearchInput
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search boards or projects..."
              aria-label="Search Jira boards"
              className="h-9"
              autoFocus
            />
            <div className="max-h-[50dvh] space-y-1 overflow-y-auto pr-1">
              {filteredBoards.map((board) => {
                const key = boardKey(board);
                const isSelected = selectedKeys.has(key);
                const isAtLimit = selectedKeys.size >= MAX_SAVED_JIRA_BOARDS;
                const isUnavailable = !availableKeys.has(key);

                return (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 hover:border-border hover:bg-background-1"
                  >
                    <Checkbox
                      checked={isSelected}
                      disabled={!isSelected && isAtLimit}
                      onCheckedChange={(checked) => toggleBoard(board, checked === true)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-foreground">{board.name}</span>
                      <span className="block truncate text-xs text-foreground-muted capitalize">
                        {board.type}
                        {board.projectName ? ` / ${board.projectName}` : ''}
                        {isUnavailable ? ' / unavailable' : ''}
                      </span>
                    </span>
                  </label>
                );
              })}
              {filteredBoards.length === 0 ? (
                <div className="flex h-32 items-center justify-center text-sm text-foreground-muted">
                  No boards match "{search.trim()}"
                </div>
              ) : null}
            </div>
          </div>
        )}
        {saveError ? <p className="text-destructive mt-3 text-xs">{saveError}</p> : null}
      </DialogContentArea>

      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button
          size="sm"
          onClick={() => void saveBoards()}
          disabled={isLoading || boardsQuery.isFetching || !!discoveryError || isSaving}
        >
          {isSaving ? 'Saving...' : `Save ${selectedKeys.size} boards`}
        </Button>
      </DialogFooter>
    </>
  );
}
