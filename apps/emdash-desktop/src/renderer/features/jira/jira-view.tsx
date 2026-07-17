import { AlertCircle, Columns3, Link2, Plus, Settings2 } from 'lucide-react';
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { useIntegrationsContext } from '@renderer/features/integrations/integrations-provider';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import { Titlebar } from '@renderer/lib/components/titlebar/Titlebar';
import { useParams } from '@renderer/lib/layout/navigation-provider';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { Button } from '@renderer/lib/ui/button';
import { Spinner } from '@renderer/lib/ui/spinner';
import { JiraBoard } from './jira-board';
import { useJiraConnection } from './use-jira-connection';
import { useOpenJiraBoardPicker } from './use-open-jira-board-picker';

type JiraViewParams = {
  boardId?: number;
  sprintId?: number;
  issueKey?: string;
  search?: string;
  status?: string;
  assignee?: string;
  issueType?: string;
  priority?: string;
};

export function JiraViewWrapper({
  children,
  boardId: _boardId,
  sprintId: _sprintId,
  issueKey: _issueKey,
  search: _search,
  status: _status,
  assignee: _assignee,
  issueType: _issueType,
  priority: _priority,
}: JiraViewParams & { children: ReactNode }) {
  return <>{children}</>;
}

export function JiraTitlebar() {
  const { value: settings } = useAppSettingsKey('jiraWorkspace');
  const { params } = useParams('jira');
  const openBoardPicker = useOpenJiraBoardPicker();
  const showBoardSettings = useShowModal('jiraBoardSettingsModal');
  const connectionQuery = useJiraConnection();
  const accountId =
    connectionQuery.data?.accountId ??
    (connectionQuery.isLoading ? settings?.activeAccountId : null);
  const boards = (settings?.savedBoards ?? []).filter(
    (candidate) => candidate.accountId === accountId
  );
  const board = boards.find((candidate) => candidate.id === params.boardId) ?? boards[0];

  return (
    <Titlebar
      leftSlot={
        <div className="min-w-0 px-3 text-sm text-foreground">
          <span className="block truncate">
            Jira{board ? `: ${[board.projectName, board.name].filter(Boolean).join(' / ')}` : ''}
          </span>
        </div>
      }
      rightSlot={
        <div className="flex items-center gap-2">
          <div id="jira-titlebar-board-status" className="hidden items-center md:flex" />
          {board ? (
            <Button
              variant="ghost"
              size="sm"
              aria-label="Board settings"
              onClick={() => showBoardSettings({ board })}
            >
              <Settings2 className="size-3.5" />
              <span className="hidden sm:inline">Board settings</span>
            </Button>
          ) : null}
          <Button variant="ghost" size="sm" className="mr-1" onClick={openBoardPicker}>
            <Plus className="size-3.5" />
            Add board
          </Button>
        </div>
      }
    />
  );
}

export function JiraMainPanel() {
  return <JiraWorkspace />;
}

function JiraWorkspace() {
  const {
    configuredConnections,
    connectionStatus,
    isCheckingConfiguredConnections,
    isCheckingConnections,
  } = useIntegrationsContext();
  const { value: settings, isLoading: isLoadingSettings } = useAppSettingsKey('jiraWorkspace');
  const { params, setParams } = useParams('jira');
  const showIntegrationSetup = useShowModal('integrationSetupModal');
  const openBoardPicker = useOpenJiraBoardPicker();
  const connectionQuery = useJiraConnection();
  const isOnline = useOnlineStatus();
  const isConfigured = configuredConnections.jira === true;
  const status = connectionStatus.jira;
  const accountId =
    connectionQuery.data?.accountId ??
    (connectionQuery.isLoading ? settings?.activeAccountId : null);
  const boards = (settings?.savedBoards ?? []).filter(
    (candidate) => candidate.accountId === accountId
  );
  const board = boards.find((candidate) => candidate.id === params.boardId) ?? boards[0];
  const isWorkspaceLoading =
    isCheckingConfiguredConnections ||
    isLoadingSettings ||
    connectionQuery.isLoading ||
    connectionQuery.isFetching ||
    (isOnline && isConfigured && isCheckingConnections && status?.connected !== true);

  useEffect(() => {
    if (isWorkspaceLoading || connectionQuery.isError) return;
    if (params.boardId !== board?.id) {
      setParams({
        boardId: board?.id,
        sprintId: undefined,
        issueKey: undefined,
        search: undefined,
        status: undefined,
        assignee: undefined,
        issueType: undefined,
        priority: undefined,
      });
    }
  }, [board?.id, connectionQuery.isError, isWorkspaceLoading, params.boardId, setParams]);

  if (isWorkspaceLoading) {
    return <JiraState icon={<Spinner size="sm" />} title="Loading Jira workspace" />;
  }

  if (!isConfigured) {
    return (
      <JiraState
        icon={<Link2 className="size-5" />}
        title="Connect Jira"
        description="Connect your Jira Cloud site to discover Scrum and Kanban boards."
        action={<Button onClick={openBoardPicker}>Connect Jira</Button>}
      />
    );
  }

  if (!isOnline) {
    return (
      <JiraState
        icon={<AlertCircle className="size-5" />}
        title="Jira is unavailable while offline"
        description="Reconnect to the internet to load your Jira boards and issues."
      />
    );
  }

  if (connectionQuery.isError) {
    return (
      <JiraState
        icon={<AlertCircle className="size-5" />}
        title="Unable to load the Jira connection"
        description={
          connectionQuery.error instanceof Error
            ? connectionQuery.error.message
            : 'Try loading the Jira connection again.'
        }
        action={<Button onClick={() => void connectionQuery.refetch()}>Try again</Button>}
      />
    );
  }

  if (status?.connected !== true) {
    return (
      <JiraState
        icon={<AlertCircle className="size-5" />}
        title="Jira needs attention"
        description={status?.error ?? 'Reconnect Jira to load your boards.'}
        action={
          <Button onClick={() => showIntegrationSetup({ integration: 'jira' })}>
            Reconnect Jira
          </Button>
        }
      />
    );
  }

  if (!board) {
    return (
      <JiraState
        icon={<Columns3 className="size-5" />}
        title="Add your first board"
        description="Choose the Jira boards you want available beside your Emdash projects."
        action={<Button onClick={openBoardPicker}>Choose boards</Button>}
      />
    );
  }

  return <JiraBoard board={board} />;
}

function JiraState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex h-full items-center justify-center bg-background-secondary p-8">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-xl border border-border bg-background text-foreground-muted">
          {icon}
        </div>
        <h1 className="text-base font-medium text-foreground">{title}</h1>
        {description ? (
          <p className="mt-2 text-sm leading-6 text-foreground-muted">{description}</p>
        ) : null}
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  );
}

export const jiraView = {
  WrapView: JiraViewWrapper,
  TitlebarSlot: JiraTitlebar,
  MainPanel: JiraMainPanel,
};

function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribeToOnlineStatus,
    () => navigator.onLine,
    () => true
  );
}

function subscribeToOnlineStatus(onStoreChange: () => void): () => void {
  window.addEventListener('online', onStoreChange);
  window.addEventListener('offline', onStoreChange);
  return () => {
    window.removeEventListener('online', onStoreChange);
    window.removeEventListener('offline', onStoreChange);
  };
}
