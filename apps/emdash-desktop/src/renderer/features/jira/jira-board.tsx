import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ChevronDown,
  ExternalLink,
  GitBranch,
  GitPullRequest,
  Link2,
  RefreshCw,
} from 'lucide-react';
import { observer } from 'mobx-react-lite';
import { useDeferredValue, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  asMounted,
  getProjectManagerStore,
} from '@renderer/features/projects/stores/project-selectors';
import { AgentStatusIndicator } from '@renderer/lib/components/agent-status-indicator';
import { StackedAgentLogos } from '@renderer/lib/components/stacked-agent-logos';
import { rpc } from '@renderer/lib/ipc';
import { useNavigate, useParams } from '@renderer/lib/layout/navigation-provider';
import { useShowModal } from '@renderer/lib/modal/modal-provider';
import { Button } from '@renderer/lib/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@renderer/lib/ui/dropdown-menu';
import { MarkdownRenderer } from '@renderer/lib/ui/markdown-renderer';
import { RelativeTime } from '@renderer/lib/ui/relative-time';
import { SearchInput } from '@renderer/lib/ui/search-input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@renderer/lib/ui/select';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from '@renderer/lib/ui/sheet';
import { Spinner } from '@renderer/lib/ui/spinner';
import type {
  JiraBoardColumn,
  JiraBoardIssue,
  JiraBoardSummary,
  JiraIssueDetail,
  JiraSprintSummary,
} from '@shared/core/jira/jira-board';
import { jiraBoardIssueToLinkedIssue } from '@shared/core/jira/jira-linked-issue';
import type { LinkedIssueTaskSummary } from '@shared/core/tasks/tasks';
import {
  filterJiraIssues,
  groupJiraIssuesByColumn,
  groupLinkedTasksByProject,
  jiraBoardColumnWidthCss,
  JIRA_UNASSIGNED_FILTER,
  normalizeJiraDescriptionForDisplay,
  resolveBoardDefaultProjectId,
  resolveDefaultJiraTransition,
  resolveJiraSprintId,
  resolveLinkedWorkPrimaryAction,
  resolveStartTaskJiraTransition,
  sortJiraSprints,
} from './jira-board-utils';
import {
  JiraTransitionSuggestions,
  useConfirmedJiraTransition,
  useJiraIssueTransitions,
} from './jira-transition-suggestions';

const ISSUE_PAGE_SIZE = 50;
const ALL_FILTER_VALUE = '__emdash_all__';

export const JiraBoard = observer(function JiraBoard({ board }: { board: JiraBoardSummary }) {
  const { params, setParams } = useParams('jira');
  const deferredSearch = useDeferredValue(params.search ?? '');
  const mountedProjects = Array.from(getProjectManagerStore().projects.entries()).flatMap(
    ([id, store]) => {
      const mounted = asMounted(store);
      return mounted ? [{ id, name: mounted.data.name }] : [];
    }
  );
  const mountedProjectIds = new Set(mountedProjects.map((project) => project.id));
  const boardDefault = resolveBoardDefaultProjectId(board.defaultProjectId, mountedProjectIds);
  const defaultProjectId = boardDefault.projectId;
  const defaultProjectName =
    mountedProjects.find((project) => project.id === defaultProjectId)?.name ?? null;

  const configurationQuery = useQuery({
    queryKey: ['jira', 'board', board.accountId, board.id, 'configuration'],
    queryFn: async () => {
      const result = await rpc.jira.getBoardConfiguration({
        accountId: board.accountId,
        boardId: board.id,
      });
      if (!result.success) throw new Error(result.error.message);
      return result.data;
    },
    staleTime: 60_000,
  });
  const configuration = configurationQuery.data;
  const sprintsQuery = useQuery({
    queryKey: ['jira', 'board', board.accountId, board.id, 'sprints'],
    queryFn: async () => {
      const result = await rpc.jira.listBoardSprints({
        accountId: board.accountId,
        boardId: board.id,
      });
      if (!result.success) throw new Error(result.error.message);
      return result.data;
    },
    enabled: configuration?.type === 'scrum',
    staleTime: 60_000,
  });
  const sprints = sortJiraSprints(
    sprintsQuery.data ?? (configuration?.activeSprint ? [configuration.activeSprint] : [])
  );
  const sprintId =
    configuration?.type === 'scrum'
      ? sprintsQuery.data
        ? resolveJiraSprintId(params.sprintId, configuration.activeSprint, sprintsQuery.data)
        : (params.sprintId ?? configuration.activeSprint?.id)
      : undefined;
  const canLoadIssues =
    !!configuration && (configuration.type === 'kanban' || sprintId !== undefined);
  const issuesQuery = useInfiniteQuery({
    queryKey: ['jira', 'board', board.accountId, board.id, 'issues', sprintId ?? 'board'],
    queryFn: async ({ pageParam }: { pageParam: number }) => {
      const result = await rpc.jira.listBoardIssues({
        accountId: board.accountId,
        boardId: board.id,
        sprintId,
        startAt: pageParam,
        maxResults: ISSUE_PAGE_SIZE,
      });
      if (!result.success) throw new Error(result.error.message);
      return result.data;
    },
    initialPageParam: 0,
    getNextPageParam: (page) => (page.isLast ? undefined : page.startAt + page.maxResults),
    enabled: canLoadIssues,
    staleTime: 30_000,
  });
  const {
    data: issuePages,
    error: issuePageError,
    fetchNextPage: fetchNextIssuePage,
    hasNextPage: hasNextIssuePage,
    isFetchingNextPage,
    isLoading: isLoadingIssues,
  } = issuesQuery;

  useEffect(() => {
    if (configuration?.type !== 'scrum' || !sprintsQuery.data) return;
    if (params.sprintId !== sprintId) setParams({ sprintId });
  }, [configuration?.type, params.sprintId, setParams, sprintId, sprintsQuery.data]);

  useEffect(() => {
    if (!hasNextIssuePage || isFetchingNextPage || isLoadingIssues || issuePageError) return;
    void fetchNextIssuePage();
  }, [
    fetchNextIssuePage,
    hasNextIssuePage,
    isFetchingNextPage,
    isLoadingIssues,
    issuePageError,
    issuePages?.pages.length,
  ]);

  const issues = issuesQuery.data?.pages.flatMap((page) => page.issues) ?? [];
  const issueUrls = issues.map((issue) => issue.url);
  const linkedTasksQuery = useQuery({
    queryKey: ['tasks', 'linked-issue-urls', issueUrls],
    queryFn: () => rpc.tasks.getTasksByLinkedIssueUrls(issueUrls),
    enabled: issueUrls.length > 0,
    staleTime: 15_000,
  });

  if (configurationQuery.isLoading) {
    return <BoardState icon={<Spinner size="sm" />} title="Loading Jira board" />;
  }

  if (configurationQuery.error) {
    return (
      <BoardState
        icon={<AlertCircle className="size-5" />}
        title="Unable to load this Jira board"
        description={errorMessage(configurationQuery.error)}
        action={<Button onClick={() => void configurationQuery.refetch()}>Try again</Button>}
      />
    );
  }

  if (!configuration) return null;

  const linkedTasksByIssueUrl = groupLinkedTasksByIssueUrl(linkedTasksQuery.data ?? []);
  const filteredIssues = filterJiraIssues(issues, {
    search: deferredSearch,
    status: params.status,
    assignee: params.assignee,
    issueType: params.issueType,
    priority: params.priority,
  });
  const hasIssueFilters = !!(
    params.search ||
    params.status ||
    params.assignee ||
    params.issueType ||
    params.priority
  );
  const selectedIssue = issues.find((issue) => issue.key === params.issueKey) ?? null;
  const columns = groupJiraIssuesByColumn(configuration.columns, filteredIssues);
  const isRefreshing =
    configurationQuery.isFetching ||
    sprintsQuery.isRefetching ||
    issuesQuery.isRefetching ||
    linkedTasksQuery.isRefetching;
  const lastRefreshedAt = Math.max(
    configurationQuery.dataUpdatedAt,
    sprintsQuery.dataUpdatedAt,
    issuesQuery.dataUpdatedAt,
    linkedTasksQuery.dataUpdatedAt
  );

  const refresh = async () => {
    await configurationQuery.refetch();
    if (configuration.type === 'scrum') await sprintsQuery.refetch();
    if (canLoadIssues) await issuesQuery.refetch();
    if (issueUrls.length > 0) await linkedTasksQuery.refetch();
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background-secondary">
      <JiraIssueFilterBar
        issues={issues}
        isRefreshing={isRefreshing}
        onRefresh={() => void refresh()}
        sprints={configuration.type === 'scrum' ? sprints : null}
        sprintId={sprintId}
        isLoadingSprints={sprintsQuery.isLoading}
        onSprintChange={(nextSprintId) =>
          setParams({
            sprintId: nextSprintId,
            issueKey: undefined,
            search: undefined,
            status: undefined,
            assignee: undefined,
            issueType: undefined,
            priority: undefined,
          })
        }
        search={params.search ?? ''}
        status={params.status}
        assignee={params.assignee}
        issueType={params.issueType}
        priority={params.priority}
        onChange={(filters) => setParams(filters)}
      />
      <JiraTitlebarBoardStatus
        loadedCount={issues.length}
        visibleCount={filteredIssues.length}
        filtered={hasIssueFilters}
        loadingMore={issuesQuery.isFetchingNextPage}
        lastRefreshedAt={lastRefreshedAt}
      />

      {configuration.type === 'scrum' && !sprintId ? (
        <BoardState
          icon={<AlertCircle className="size-5" />}
          title={sprints.length === 0 ? 'No sprints found' : 'Select a sprint'}
          description={
            sprints.length === 0
              ? 'Create a sprint in Jira, then refresh this board.'
              : 'This board has no active sprint. Choose an upcoming or previous sprint above.'
          }
          action={
            sprintsQuery.error ? (
              <Button onClick={() => void sprintsQuery.refetch()}>Retry sprint loading</Button>
            ) : undefined
          }
        />
      ) : issuesQuery.isLoading ? (
        <BoardState icon={<Spinner size="sm" />} title="Loading Jira issues" />
      ) : issuesQuery.error ? (
        <BoardState
          icon={<AlertCircle className="size-5" />}
          title="Unable to load Jira issues"
          description={errorMessage(issuesQuery.error)}
          action={<Button onClick={() => void issuesQuery.refetch()}>Try again</Button>}
        />
      ) : configuration.columns.length === 0 ? (
        <BoardState
          icon={<AlertCircle className="size-5" />}
          title="No Jira columns found"
          description="This board did not return a native column configuration."
        />
      ) : hasIssueFilters && filteredIssues.length === 0 ? (
        <BoardState
          icon={<AlertCircle className="size-5" />}
          title="No loaded issues match"
          description={
            issuesQuery.hasNextPage
              ? 'Clear a filter or load more Jira issues to continue searching.'
              : 'Clear or change a filter to see issues on this board.'
          }
          action={
            <Button
              variant="outline"
              onClick={() =>
                setParams({
                  search: undefined,
                  status: undefined,
                  assignee: undefined,
                  issueType: undefined,
                  priority: undefined,
                })
              }
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <div
          className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-3 sm:p-4"
          role="region"
          aria-label={`${board.name} board columns`}
          aria-busy={issuesQuery.isFetching}
        >
          <div className="flex h-full min-w-max gap-3">
            {columns.map(({ column, issues: columnIssues }) => (
              <section
                key={column.id}
                className="flex h-full shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-background/70"
                style={{ width: jiraBoardColumnWidthCss(board.columnWidth) }}
                aria-labelledby={`jira-column-${column.id}`}
              >
                <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
                  <h2
                    id={`jira-column-${column.id}`}
                    className="truncate text-xs font-medium text-foreground"
                  >
                    {column.name}
                  </h2>
                  <span className="ml-2 shrink-0 rounded-full bg-background-1 px-2 py-0.5 text-[10px] text-foreground-muted">
                    {columnIssues.length}
                    {column.max !== null ? ` / ${column.max}` : ''}
                  </span>
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                  {columnIssues.map((issue) => (
                    <JiraIssueCard
                      key={issue.id}
                      issue={issue}
                      linkedTasks={linkedTasksByIssueUrl.get(issue.url) ?? []}
                      selected={issue.key === selectedIssue?.key}
                      onSelect={() => setParams({ issueKey: issue.key })}
                    />
                  ))}
                  {columnIssues.length === 0 ? (
                    <p className="text-foreground-disabled px-2 py-6 text-center text-xs">
                      No issues
                    </p>
                  ) : null}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
      <JiraIssueInspector
        board={board}
        columns={configuration.columns}
        issue={selectedIssue}
        linkedTasks={selectedIssue ? (linkedTasksByIssueUrl.get(selectedIssue.url) ?? []) : []}
        isLoadingLinkedTasks={linkedTasksQuery.isLoading}
        linkedTasksError={linkedTasksQuery.error}
        onRetryLinkedTasks={() => void linkedTasksQuery.refetch()}
        defaultProjectId={defaultProjectId}
        defaultProjectName={defaultProjectName}
        defaultProjectIsStale={boardDefault.isStale}
        onClose={() => setParams({ issueKey: undefined })}
      />
    </div>
  );
});

function JiraIssueFilterBar({
  issues,
  isRefreshing,
  onRefresh,
  sprints,
  sprintId,
  isLoadingSprints,
  onSprintChange,
  search,
  status,
  assignee,
  issueType,
  priority,
  onChange,
}: {
  issues: JiraBoardIssue[];
  isRefreshing: boolean;
  onRefresh: () => void;
  sprints: JiraSprintSummary[] | null;
  sprintId: number | undefined;
  isLoadingSprints: boolean;
  onSprintChange: (sprintId: number) => void;
  search: string;
  status: string | undefined;
  assignee: string | undefined;
  issueType: string | undefined;
  priority: string | undefined;
  onChange: (filters: {
    search?: string;
    status?: string;
    assignee?: string;
    issueType?: string;
    priority?: string;
  }) => void;
}) {
  const hasFilters = !!(search || status || assignee || issueType || priority);
  const assignees = uniqueIssueValues(issues, (issue) => issue.assigneeName);
  if (issues.some((issue) => issue.assigneeName === null)) {
    assignees.push(JIRA_UNASSIGNED_FILTER);
  }

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-background/40 px-3 py-2 sm:px-5">
      <SearchInput
        value={search}
        onChange={(event) => onChange({ search: event.target.value || undefined })}
        placeholder="Search issues..."
        aria-label="Search Jira issues by key or summary"
        className="w-full sm:w-56"
      />
      {sprints ? (
        <SprintSelect
          sprints={sprints}
          sprintId={sprintId}
          loading={isLoadingSprints}
          onChange={onSprintChange}
        />
      ) : null}
      <IssueFilterSelect
        label="Status"
        value={status}
        options={uniqueIssueValues(issues, (issue) => issue.statusName)}
        onChange={(value) => onChange({ status: value })}
      />
      <IssueFilterSelect
        label="Assignee"
        value={assignee}
        options={assignees}
        optionLabel={(value) => (value === JIRA_UNASSIGNED_FILTER ? 'Unassigned' : value)}
        onChange={(value) => onChange({ assignee: value })}
      />
      <IssueFilterSelect
        label="Type"
        value={issueType}
        options={uniqueIssueValues(issues, (issue) => issue.issueTypeName)}
        onChange={(value) => onChange({ issueType: value })}
      />
      <IssueFilterSelect
        label="Priority"
        value={priority}
        options={uniqueIssueValues(issues, (issue) => issue.priorityName)}
        onChange={(value) => onChange({ priority: value })}
      />
      {hasFilters ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onChange({
              search: undefined,
              status: undefined,
              assignee: undefined,
              issueType: undefined,
              priority: undefined,
            })
          }
        >
          Clear
        </Button>
      ) : null}
      <Button
        variant="ghost"
        size="icon-sm"
        className="ml-auto"
        aria-label="Refresh Jira board"
        disabled={isRefreshing}
        onClick={onRefresh}
      >
        <RefreshCw className={isRefreshing ? 'animate-spin' : ''} />
      </Button>
    </div>
  );
}

function JiraTitlebarBoardStatus({
  loadedCount,
  visibleCount,
  filtered,
  loadingMore,
  lastRefreshedAt,
}: {
  loadedCount: number;
  visibleCount: number;
  filtered: boolean;
  loadingMore: boolean;
  lastRefreshedAt: number;
}) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setTarget(document.getElementById('jira-titlebar-board-status'));
  }, []);

  if (!target) return null;
  return createPortal(
    <div className="flex items-center gap-3 text-[11px] whitespace-nowrap text-foreground-muted">
      <span>
        {filtered ? `${visibleCount} of ` : ''}
        {loadedCount} loaded{loadingMore ? ', loading more...' : ''}
      </span>
      {lastRefreshedAt > 0 ? <LastRefreshedAt value={lastRefreshedAt} /> : null}
    </div>,
    target
  );
}

function IssueFilterSelect({
  label,
  value,
  options,
  optionLabel = (option) => option,
  onChange,
}: {
  label: string;
  value: string | undefined;
  options: string[];
  optionLabel?: (option: string) => string;
  onChange: (value: string | undefined) => void;
}) {
  return (
    <Select
      value={value ?? ALL_FILTER_VALUE}
      onValueChange={(nextValue) => {
        if (nextValue !== null) onChange(nextValue === ALL_FILTER_VALUE ? undefined : nextValue);
      }}
    >
      <SelectTrigger size="sm" className="max-w-44" aria-label={`Filter by ${label.toLowerCase()}`}>
        <SelectValue>{value ? optionLabel(value) : `All ${filterLabelPlural(label)}`}</SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} className="min-w-48">
        <SelectItem value={ALL_FILTER_VALUE}>All {filterLabelPlural(label)}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            <span className="truncate">{optionLabel(option)}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function LastRefreshedAt({ value }: { value: number }) {
  const [, setTick] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((tick) => tick + 1), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <span className="whitespace-nowrap">
      Updated <RelativeTime value={value} />
    </span>
  );
}

function filterLabelPlural(label: string): string {
  if (label === 'Status') return 'statuses';
  if (label === 'Priority') return 'priorities';
  return `${label.toLowerCase()}s`;
}

function uniqueIssueValues(
  issues: JiraBoardIssue[],
  selectValue: (issue: JiraBoardIssue) => string | null
): string[] {
  return [
    ...new Set(issues.map(selectValue).filter((value): value is string => value !== null)),
  ].sort((left, right) => left.localeCompare(right));
}

function SprintSelect({
  sprints,
  sprintId,
  loading,
  onChange,
}: {
  sprints: JiraSprintSummary[];
  sprintId: number | undefined;
  loading: boolean;
  onChange: (sprintId: number) => void;
}) {
  const groups = [
    { state: 'active', label: 'Active' },
    { state: 'future', label: 'Upcoming' },
    { state: 'closed', label: 'Previous' },
  ];
  const selectedSprint = sprints.find((sprint) => sprint.id === sprintId);

  return (
    <Select
      value={sprintId === undefined ? null : String(sprintId)}
      onValueChange={(value) => {
        if (value !== null) onChange(Number(value));
      }}
      disabled={loading || sprints.length === 0}
    >
      <SelectTrigger size="sm" className="max-w-56" aria-label="Jira sprint">
        <SelectValue>
          {loading ? 'Loading sprints...' : (selectedSprint?.name ?? 'Select sprint')}
        </SelectValue>
      </SelectTrigger>
      <SelectContent align="end" alignItemWithTrigger={false} className="min-w-64">
        {groups.map((group) => {
          const groupSprints = sprints.filter((sprint) => sprint.state === group.state);
          if (groupSprints.length === 0) return null;
          return (
            <SelectGroup key={group.state}>
              <SelectLabel>{group.label}</SelectLabel>
              {groupSprints.map((sprint) => (
                <SelectItem key={sprint.id} value={String(sprint.id)}>
                  <span className="truncate">{sprint.name}</span>
                </SelectItem>
              ))}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function JiraIssueCard({
  issue,
  linkedTasks,
  selected,
  onSelect,
}: {
  issue: JiraBoardIssue;
  linkedTasks: LinkedIssueTaskSummary[];
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`focus-visible:ring-ring w-full rounded-lg border bg-background px-3 py-2.5 text-left shadow-xs transition-colors hover:bg-background-1 focus-visible:ring-2 focus-visible:outline-none ${selected ? 'border-foreground-muted' : 'border-border'}`}
      aria-label={`Open ${issue.key}: ${issue.summary}`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between gap-2 text-[10px] text-foreground-muted">
        <span className="font-mono text-foreground-passive">{issue.key}</span>
        {issue.priorityName ? <span className="truncate">{issue.priorityName}</span> : null}
      </div>
      <h3 className="mt-1.5 line-clamp-3 text-sm leading-5 text-foreground">{issue.summary}</h3>
      {linkedTasks.length > 0 ? (
        <div className="mt-2.5 flex min-w-0 items-center gap-2 border-t border-border pt-2 text-[10px] text-foreground-muted">
          <span className="flex shrink-0 items-center gap-1 font-medium text-foreground-passive">
            <Link2 className="size-3" />
            {linkedTasks.length} {linkedTasks.length === 1 ? 'task' : 'tasks'}
          </span>
          <span className="min-w-0 flex-1 truncate">
            {linkedTasks[0]!.projectName} / {linkedTasks[0]!.taskName}
          </span>
          <StackedAgentLogos stats={linkedTasks[0]!.conversations} />
          {linkedTasks[0]!.branchName ? (
            <GitBranch className="size-3 shrink-0" aria-label={linkedTasks[0]!.branchName} />
          ) : null}
          {linkedTasks[0]!.pullRequests[0] ? (
            <GitPullRequest
              className="size-3 shrink-0"
              aria-label={
                linkedTasks[0]!.pullRequests[0].identifier ?? linkedTasks[0]!.pullRequests[0].title
              }
            />
          ) : null}
        </div>
      ) : null}
      <div className="mt-3 flex min-w-0 items-center justify-between gap-2 text-[10px] text-foreground-muted">
        <span className="truncate">{issue.issueTypeName ?? issue.statusName ?? 'Issue'}</span>
        <span className="flex min-w-0 items-center gap-2">
          {issue.updatedAt ? <RelativeTime value={issue.updatedAt} compact ago /> : null}
          {issue.assigneeName ? (
            <span
              className="flex size-5 shrink-0 items-center justify-center rounded-full bg-background-1 text-[9px] font-medium text-foreground"
              title={issue.assigneeName}
              aria-label={`Assigned to ${issue.assigneeName}`}
            >
              {initials(issue.assigneeName)}
            </span>
          ) : null}
        </span>
      </div>
    </button>
  );
}

const JiraIssueInspector = observer(function JiraIssueInspector({
  board,
  columns,
  issue,
  linkedTasks,
  isLoadingLinkedTasks,
  linkedTasksError,
  onRetryLinkedTasks,
  defaultProjectId,
  defaultProjectName,
  defaultProjectIsStale,
  onClose,
}: {
  board: JiraBoardSummary;
  columns: JiraBoardColumn[];
  issue: JiraBoardIssue | null;
  linkedTasks: LinkedIssueTaskSummary[];
  isLoadingLinkedTasks: boolean;
  linkedTasksError: Error | null;
  onRetryLinkedTasks: () => void;
  defaultProjectId: string | null;
  defaultProjectName: string | null;
  defaultProjectIsStale: boolean;
  onClose: () => void;
}) {
  const { navigate } = useNavigate();
  const showCreateTaskModal = useShowModal('taskModal');
  const showBoardSettings = useShowModal('jiraBoardSettingsModal');
  const [projectError, setProjectError] = useState<string | null>(null);
  const tasksByProject = groupLinkedTasksByProject(linkedTasks);
  const primaryAction = resolveLinkedWorkPrimaryAction(linkedTasks);
  const issueDetailQuery = useQuery<JiraIssueDetail>({
    queryKey: ['jira', 'issue', board.accountId, issue?.key ?? null],
    queryFn: async () => {
      if (!issue) throw new Error('No Jira issue is selected.');
      const result = await rpc.jira.getIssueDetail({
        accountId: board.accountId,
        issueKey: issue.key,
      });
      if (!result.success) throw new Error(result.error.message);
      return result.data;
    },
    enabled: issue !== null,
    staleTime: 60_000,
  });
  const detail = issueDetailQuery.data;
  const transitionsQuery = useJiraIssueTransitions(board.accountId, issue?.key ?? null);
  const { confirmDetachedTransition } = useConfirmedJiraTransition({
    accountId: board.accountId,
    boardId: board.id,
    issueKey: issue?.key ?? '',
  });
  const defaultTransition = resolveDefaultJiraTransition(
    columns,
    issue?.statusId ?? null,
    transitionsQuery.data ?? []
  );
  const startTaskTransition = resolveStartTaskJiraTransition(
    detail?.statusCategoryName,
    defaultTransition
  );

  useEffect(() => {
    setProjectError(null);
  }, [issue?.key, defaultProjectId]);

  const startTask = () => {
    if (!issue) return;
    if (!defaultProjectId) {
      setProjectError(
        defaultProjectIsStale
          ? "This board's default project is unavailable. Choose another in Board settings."
          : 'Set a default Emdash project in Board settings before starting a task.'
      );
      return;
    }
    setProjectError(null);
    showCreateTaskModal({
      projectId: defaultProjectId,
      strategy: 'from-issue',
      initialIssue: jiraBoardIssueToLinkedIssue({
        key: issue.key,
        summary: detail?.summary ?? issue.summary,
        description: detail?.description,
        statusName: detail?.statusName ?? issue.statusName,
        assigneeName: detail?.assigneeName ?? issue.assigneeName,
        updatedAt: detail?.updatedAt ?? issue.updatedAt,
        url: issue.url,
        projectName: board.projectName,
      }),
      onSuccess: () => {
        if (!startTaskTransition) return;
        confirmDetachedTransition(startTaskTransition, {
          title: `Move ${issue.key} to ${startTaskTransition.toStatusName}?`,
          description: `The Emdash task has started. Move the Jira issue from Todo to ${startTaskTransition.toStatusName}?`,
        });
      },
    });
  };

  const openTask = (task: LinkedIssueTaskSummary) => {
    navigate('task', { projectId: task.projectId, taskId: task.taskId });
  };

  return (
    <Sheet open={issue !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        {issue ? (
          <>
            <SheetHeader className="items-start border-b border-border p-5">
              <div className="min-w-0 pr-4">
                <p className="mb-2 font-mono text-xs text-foreground-muted">{issue.key}</p>
                <SheetTitle className="text-base leading-6">{issue.summary}</SheetTitle>
              </div>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <section aria-labelledby="jira-issue-description">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 id="jira-issue-description" className="text-sm font-medium text-foreground">
                    Description
                  </h3>
                  {issueDetailQuery.isFetching && detail ? (
                    <span className="text-[10px] text-foreground-muted">Refreshing...</span>
                  ) : null}
                </div>
                {issueDetailQuery.isLoading ? (
                  <div className="flex items-center gap-2 py-3 text-xs text-foreground-muted">
                    <Spinner size="sm" /> Loading ticket details
                  </div>
                ) : issueDetailQuery.error ? (
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs leading-5 text-foreground-muted">
                      {errorMessage(issueDetailQuery.error)}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => void issueDetailQuery.refetch()}
                    >
                      Try again
                    </Button>
                  </div>
                ) : detail?.description ? (
                  <MarkdownRenderer
                    content={normalizeJiraDescriptionForDisplay(detail.description)}
                    variant="compact"
                    allowHtml={false}
                    enableMath={false}
                    className="text-sm leading-6 text-foreground"
                  />
                ) : (
                  <p className="text-xs text-foreground-muted">No description provided.</p>
                )}
              </section>

              <section
                className="mt-6 border-t border-border pt-5"
                aria-labelledby="jira-issue-details"
              >
                <h3 id="jira-issue-details" className="mb-4 text-sm font-medium text-foreground">
                  Ticket details
                </h3>
                <dl className="space-y-4">
                  <IssueField label="Status" value={detail?.statusName ?? issue.statusName} />
                  <IssueField label="Type" value={detail?.issueTypeName ?? issue.issueTypeName} />
                  <IssueField label="Priority" value={detail?.priorityName ?? issue.priorityName} />
                  <IssueField
                    label="Assignee"
                    value={detail?.assigneeName ?? issue.assigneeName ?? 'Unassigned'}
                  />
                  {detail?.reporterName ? (
                    <IssueField label="Reporter" value={detail.reporterName} />
                  ) : null}
                  {detail?.projectName ? (
                    <IssueField
                      label="Jira project"
                      value={
                        detail.projectKey
                          ? `${detail.projectName} (${detail.projectKey})`
                          : detail.projectName
                      }
                    />
                  ) : null}
                  {detail?.parentKey ? (
                    <IssueField
                      label="Parent"
                      value={
                        detail.parentSummary
                          ? `${detail.parentKey} · ${detail.parentSummary}`
                          : detail.parentKey
                      }
                    />
                  ) : null}
                  {detail?.createdAt ? (
                    <IssueField label="Created" value={formatJiraDate(detail.createdAt)} />
                  ) : null}
                  <IssueField
                    label="Updated"
                    value={formatJiraDate(detail?.updatedAt ?? issue.updatedAt)}
                  />
                  {detail?.dueDate ? (
                    <IssueField label="Due" value={formatJiraDate(detail.dueDate)} />
                  ) : null}
                  {detail?.resolutionName ? (
                    <IssueField label="Resolution" value={detail.resolutionName} />
                  ) : null}
                  {detail?.resolvedAt ? (
                    <IssueField label="Resolved" value={formatJiraDate(detail.resolvedAt)} />
                  ) : null}
                  <IssueField
                    label="Emdash project"
                    value={
                      defaultProjectName ??
                      (defaultProjectIsStale
                        ? 'Board default unavailable'
                        : 'Set in Board settings')
                    }
                  />
                </dl>
                {detail && (detail.labels.length > 0 || detail.components.length > 0) ? (
                  <div className="mt-4 space-y-3">
                    {detail.labels.length > 0 ? (
                      <IssueTags label="Labels" values={detail.labels} />
                    ) : null}
                    {detail.components.length > 0 ? (
                      <IssueTags label="Components" values={detail.components} />
                    ) : null}
                  </div>
                ) : null}
              </section>
              {projectError ? (
                <p className="mt-4 text-xs text-foreground-error">{projectError}</p>
              ) : null}
              {!defaultProjectId ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => showBoardSettings({ board })}
                >
                  Board settings
                </Button>
              ) : null}

              <JiraTransitionSuggestions
                accountId={board.accountId}
                boardId={board.id}
                issueKey={issue.key}
                columns={columns}
                currentStatusId={issue.statusId}
                currentStatus={detail?.statusName ?? issue.statusName}
              />

              <section
                className="mt-6 border-t border-border pt-5"
                aria-labelledby="jira-linked-tasks"
              >
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 id="jira-linked-tasks" className="text-sm font-medium text-foreground">
                    Emdash tasks
                  </h3>
                  {linkedTasks.length > 0 ? (
                    <span className="text-xs text-foreground-muted">
                      {linkedTasks.length} linked
                    </span>
                  ) : null}
                </div>
                {isLoadingLinkedTasks ? (
                  <div className="flex items-center gap-2 text-xs text-foreground-muted">
                    <Spinner size="sm" /> Loading linked tasks
                  </div>
                ) : linkedTasksError ? (
                  <div className="rounded-lg border border-border p-3">
                    <p className="text-xs leading-5 text-foreground-muted">
                      Unable to load linked Emdash tasks.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={onRetryLinkedTasks}
                    >
                      Try again
                    </Button>
                  </div>
                ) : tasksByProject.length === 0 ? (
                  <p className="text-xs leading-5 text-foreground-muted">
                    No Emdash tasks are linked to this Jira issue.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {tasksByProject.map(([projectName, tasks]) => (
                      <div key={projectName}>
                        <p className="mb-1.5 truncate text-[10px] font-medium tracking-wide text-foreground-muted uppercase">
                          {projectName}
                        </p>
                        <div className="space-y-1.5">
                          {tasks.map((task) => (
                            <button
                              key={task.taskId}
                              type="button"
                              className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-left transition-colors enabled:hover:bg-background-1 disabled:cursor-default"
                              disabled={task.archivedAt !== null}
                              onClick={() => openTask(task)}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                                  {task.taskName}
                                </span>
                                <StackedAgentLogos stats={task.conversations} />
                                {task.activeAgentStatuses[0] ? (
                                  <AgentStatusIndicator
                                    status={task.activeAgentStatuses[0].status}
                                  />
                                ) : null}
                              </div>
                              <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-foreground-muted">
                                <span>
                                  {task.archivedAt ? 'Archived' : taskStatusLabel(task.status)}
                                </span>
                                {task.branchName ? (
                                  <span className="flex min-w-0 items-center gap-1">
                                    <GitBranch className="size-3 shrink-0" />
                                    <span className="max-w-48 truncate">{task.branchName}</span>
                                  </span>
                                ) : null}
                                {task.pullRequests.length > 0 ? (
                                  <span className="flex items-center gap-1">
                                    <GitPullRequest className="size-3" />
                                    {task.pullRequests.length === 1
                                      ? (task.pullRequests[0]!.identifier ?? 'Pull request')
                                      : `${String(task.pullRequests.length)} pull requests`}
                                  </span>
                                ) : null}
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
            <SheetFooter className="flex flex-col gap-2 p-4 sm:flex-col">
              {primaryAction.kind === 'open-task' ? (
                <Button className="w-full" onClick={() => openTask(primaryAction.task)}>
                  Open task
                </Button>
              ) : null}
              {primaryAction.kind === 'choose-task' ? (
                <DropdownMenu>
                  <DropdownMenuTrigger render={<Button className="w-full" />}>
                    Choose task
                    <ChevronDown className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-64">
                    {groupLinkedTasksByProject(primaryAction.tasks).map(
                      ([projectName, projectTasks]) => (
                        <DropdownMenuGroup key={projectName}>
                          <DropdownMenuLabel>{projectName}</DropdownMenuLabel>
                          {projectTasks.map((task) => (
                            <DropdownMenuItem key={task.taskId} onClick={() => openTask(task)}>
                              <span className="min-w-0 flex-1 truncate">{task.taskName}</span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuGroup>
                      )
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
              <Button
                className="w-full"
                variant={primaryAction.kind === 'start-task' ? 'default' : 'outline'}
                onClick={startTask}
              >
                Start task
              </Button>
              <Button
                className="w-full"
                variant="outline"
                onClick={() => void rpc.app.openExternal(issue.url)}
              >
                <ExternalLink className="size-4" />
                Open in Jira
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
});

function IssueField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
      <dt className="text-xs text-foreground-muted">{label}</dt>
      <dd className="min-w-0 text-sm text-foreground">{value ?? 'Not available'}</dd>
    </div>
  );
}

function IssueTags({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
      <span className="text-xs text-foreground-muted">{label}</span>
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {values.map((value) => (
          <span
            key={value}
            className="rounded-md border border-border bg-background-1 px-2 py-0.5 text-[10px] text-foreground-passive"
          >
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

function formatJiraDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? date.toLocaleDateString(undefined, { timeZone: 'UTC' })
    : date.toLocaleString();
}

function BoardState({
  icon,
  title,
  description,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-8">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-4 flex size-10 items-center justify-center rounded-xl border border-border bg-background text-foreground-muted">
          {icon}
        </div>
        <h2 className="text-base font-medium text-foreground">{title}</h2>
        {description ? (
          <p className="mt-2 text-sm leading-6 text-foreground-muted">{description}</p>
        ) : null}
        {action ? <div className="mt-5">{action}</div> : null}
      </div>
    </div>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}

function groupLinkedTasksByIssueUrl(
  tasks: LinkedIssueTaskSummary[]
): Map<string, LinkedIssueTaskSummary[]> {
  const grouped = new Map<string, LinkedIssueTaskSummary[]>();
  for (const task of tasks) {
    const issueTasks = grouped.get(task.issueUrl) ?? [];
    issueTasks.push(task);
    grouped.set(task.issueUrl, issueTasks);
  }
  return grouped;
}

function taskStatusLabel(status: LinkedIssueTaskSummary['status']): string {
  return status.replaceAll('_', ' ').replace(/^./, (character) => character.toUpperCase());
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Jira could not load this board.';
}
