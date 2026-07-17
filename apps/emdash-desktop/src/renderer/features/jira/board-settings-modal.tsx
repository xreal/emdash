import { observer } from 'mobx-react-lite';
import { useState } from 'react';
import {
  asMounted,
  getProjectManagerStore,
} from '@renderer/features/projects/stores/project-selectors';
import { requestAppSettingsMeta } from '@renderer/features/settings/app-settings-client';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import { ProjectSelector } from '@renderer/features/tasks/create-task-modal/project-selector';
import type { BaseModalProps } from '@renderer/lib/modal/modal-provider';
import { Button } from '@renderer/lib/ui/button';
import {
  DialogContentArea,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@renderer/lib/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@renderer/lib/ui/select';
import {
  DEFAULT_JIRA_BOARD_COLUMN_WIDTH,
  jiraBoardColumnWidthSchema,
  type JiraBoardColumnWidth,
  type JiraBoardSummary,
} from '@shared/core/jira/jira-board';
import { resolveBoardDefaultProjectId } from './jira-board-utils';

const COLUMN_WIDTH_OPTIONS: Array<{ value: JiraBoardColumnWidth; label: string }> = [
  { value: 'compact', label: 'Compact' },
  { value: 'comfortable', label: 'Comfortable' },
  { value: 'wide', label: 'Wide' },
];

type BoardSettingsModalProps = {
  board: JiraBoardSummary;
} & BaseModalProps<void>;

export const BoardSettingsModal = observer(function BoardSettingsModal({
  board,
  onSuccess,
  onClose,
}: BoardSettingsModalProps) {
  const { value: jiraWorkspace, updateAsync } = useAppSettingsKey('jiraWorkspace');
  const [defaultProjectId, setDefaultProjectId] = useState<string | null>(
    board.defaultProjectId ?? null
  );
  const [columnWidth, setColumnWidth] = useState<JiraBoardColumnWidth>(
    board.columnWidth ?? DEFAULT_JIRA_BOARD_COLUMN_WIDTH
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const mountedProjectIds = new Set(
    Array.from(getProjectManagerStore().projects.entries()).flatMap(([id, store]) =>
      asMounted(store) ? [id] : []
    )
  );
  const project = resolveBoardDefaultProjectId(defaultProjectId, mountedProjectIds);

  const save = async () => {
    if (!jiraWorkspace) {
      setSaveError('Jira board settings are still loading.');
      return;
    }
    if (
      !jiraWorkspace.savedBoards.some(
        (entry) => entry.accountId === board.accountId && entry.id === board.id
      )
    ) {
      setSaveError('This Jira board is no longer saved.');
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    try {
      await updateAsync({
        savedBoards: jiraWorkspace.savedBoards.map((entry) =>
          entry.accountId === board.accountId && entry.id === board.id
            ? { ...entry, defaultProjectId, columnWidth }
            : entry
        ),
      });
      const persisted = await requestAppSettingsMeta('jiraWorkspace');
      const persistedBoard = persisted.value.savedBoards.find(
        (entry) => entry.accountId === board.accountId && entry.id === board.id
      );
      if (
        !persistedBoard ||
        persistedBoard.defaultProjectId !== defaultProjectId ||
        persistedBoard.columnWidth !== columnWidth
      ) {
        throw new Error('Board settings were not persisted. Restart Emdash and try again.');
      }
      onSuccess();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save board settings.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <DialogHeader className="flex-col items-start gap-1">
        <DialogTitle>Board settings</DialogTitle>
        <DialogDescription className="max-w-full truncate">{board.name}</DialogDescription>
      </DialogHeader>

      <DialogContentArea className="space-y-4">
        <section className="space-y-2" aria-labelledby="jira-default-project-label">
          <h3 id="jira-default-project-label" className="text-xs text-foreground-muted">
            Default Emdash project
          </h3>
          {mountedProjectIds.size > 0 ? (
            <div className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <ProjectSelector
                  value={project.projectId ?? undefined}
                  onChange={(projectId) => {
                    setDefaultProjectId(projectId);
                    setSaveError(null);
                  }}
                />
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={!defaultProjectId}
                onClick={() => {
                  setDefaultProjectId(null);
                  setSaveError(null);
                }}
              >
                Clear
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
              <p className="text-xs text-foreground-muted">Mount a project to choose a default.</p>
              {defaultProjectId ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDefaultProjectId(null);
                    setSaveError(null);
                  }}
                >
                  Clear
                </Button>
              ) : null}
            </div>
          )}
          {project.isStale ? (
            <p className="text-xs text-foreground-error">
              Saved project unavailable. Choose another project or clear it.
            </p>
          ) : null}
        </section>

        <section className="space-y-2" aria-labelledby="jira-column-width-label">
          <h3 id="jira-column-width-label" className="text-xs text-foreground-muted">
            Column width
          </h3>
          <Select
            value={columnWidth}
            onValueChange={(value) => {
              const parsed = jiraBoardColumnWidthSchema.safeParse(value);
              if (parsed.success) setColumnWidth(parsed.data);
            }}
          >
            <SelectTrigger className="w-full" aria-labelledby="jira-column-width-label">
              <SelectValue>
                {COLUMN_WIDTH_OPTIONS.find((option) => option.value === columnWidth)?.label}
              </SelectValue>
            </SelectTrigger>
            <SelectContent alignItemWithTrigger={false} className="min-w-(--anchor-width)">
              {COLUMN_WIDTH_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>

        {saveError ? <p className="text-xs text-foreground-error">{saveError}</p> : null}
      </DialogContentArea>

      <DialogFooter>
        <Button variant="outline" size="sm" onClick={onClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => void save()} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save settings'}
        </Button>
      </DialogFooter>
    </>
  );
});
