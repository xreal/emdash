import { Columns3, Plus } from 'lucide-react';
import { useAppSettingsKey } from '@renderer/features/settings/use-app-settings-key';
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
} from '@renderer/features/sidebar/sidebar-primitives';
import {
  useNavigate,
  useParams,
  useWorkspaceSlots,
} from '@renderer/lib/layout/navigation-provider';
import { buttonVariants } from '@renderer/lib/ui/button';
import { MicroLabel } from '@renderer/lib/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/lib/ui/tooltip';
import { useJiraConnection } from './use-jira-connection';
import { useOpenJiraBoardPicker } from './use-open-jira-board-picker';

export function JiraSidebarGroup() {
  const { value: settings, isLoading } = useAppSettingsKey('jiraWorkspace');
  const { navigate } = useNavigate();
  const { currentView } = useWorkspaceSlots();
  const { params } = useParams('jira');
  const openBoardPicker = useOpenJiraBoardPicker();
  const connectionQuery = useJiraConnection();
  const accountId =
    connectionQuery.data?.accountId ??
    (connectionQuery.isLoading ? settings?.activeAccountId : null);
  const boards = (settings?.savedBoards ?? []).filter((board) => board.accountId === accountId);
  const selectedBoardId = boards.find((board) => board.id === params.boardId)?.id ?? boards[0]?.id;

  return (
    <SidebarGroup className="mb-0 min-h-0 shrink-0">
      <div className="flex h-10 items-center justify-between pr-2.5 pl-5">
        <MicroLabel className="font-medium text-foreground-tertiary-passive">Jira</MicroLabel>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label="Add Jira boards"
                onClick={openBoardPicker}
                className={buttonVariants({
                  size: 'icon-xs',
                  variant: 'ghost',
                  className: 'text-foreground-muted hover:bg-transparent hover:text-foreground',
                })}
              >
                <Plus />
              </button>
            }
          />
          <TooltipContent>Add Jira boards</TooltipContent>
        </Tooltip>
      </div>
      <SidebarGroupContent className="max-h-[35dvh] min-h-0 overflow-y-auto px-3 pb-1">
        <SidebarMenu>
          {boards.length > 0 ? (
            boards.map((board) => (
              <SidebarMenuButton
                key={`${board.accountId}:${board.id}`}
                isActive={currentView === 'jira' && selectedBoardId === board.id}
                onClick={() =>
                  navigate('jira', {
                    boardId: board.id,
                    sprintId: undefined,
                    issueKey: undefined,
                  })
                }
                aria-label={board.name}
              >
                <Columns3 className="size-4 shrink-0" />
                <span className="truncate">{board.name}</span>
              </SidebarMenuButton>
            ))
          ) : (
            <SidebarMenuButton
              isActive={currentView === 'jira'}
              onClick={() => navigate('jira')}
              aria-label="Jira"
              disabled={isLoading || connectionQuery.isLoading}
            >
              <Columns3 className="size-4 shrink-0" />
              <span className="truncate">
                {isLoading || connectionQuery.isLoading ? 'Loading...' : 'Open Jira'}
              </span>
            </SidebarMenuButton>
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
