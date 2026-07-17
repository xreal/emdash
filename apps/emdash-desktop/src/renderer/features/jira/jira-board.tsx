import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { AlertCircle, ExternalLink, RefreshCw } from 'lucide-react';
import { useDeferredValue, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { rpc } from '@renderer/lib/ipc';
import { useParams } from '@renderer/lib/layout/navigation-provider';
import { Button } from '@renderer/lib/ui/button';
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
  JiraBoardIssue,
  JiraBoardSummary,
  JiraSprintSummary,
} from '@shared/core/jira/jira-board';
import {
  filterJiraIssues,
  groupJiraIssuesByColumn,
  JIRA_UNASSIGNED_FILTER,
  resolveJiraSprintId,
  sortJiraSprints,
} from './jira-board-utils';

const ISSUE_PAGE_SIZE = 50;
const ALL_FILTER_VALUE = '__emdash_all__';

export function JiraBoard({ board }: { board: JiraBoardSummary }) {
  const { params, setParams } = useParams('jira');
  const deferredSearch = useDeferredValue(params.search ?? '');
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

  const issues = issuesQuery.data?.pages.flatMap((page) => page.issues) ?? [];
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
    configurationQuery.isFetching || sprintsQuery.isRefetching || issuesQuery.isRefetching;
  const lastRefreshedAt = Math.max(
    configurationQuery.dataUpdatedAt,
    sprintsQuery.dataUpdatedAt,
    issuesQuery.dataUpdatedAt
  );

  const refresh = async () => {
    await configurationQuery.refetch();
    if (configuration.type === 'scrum') await sprintsQuery.refetch();
    if (canLoadIssues) await issuesQuery.refetch();
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
                className="flex h-full w-[min(20rem,calc(100vw-2rem))] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-background/70"
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
        issue={selectedIssue}
        onClose={() => setParams({ issueKey: undefined })}
      />
    </div>
  );
}

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
  selected,
  onSelect,
}: {
  issue: JiraBoardIssue;
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

function JiraIssueInspector({
  issue,
  onClose,
}: {
  issue: JiraBoardIssue | null;
  onClose: () => void;
}) {
  return (
    <Sheet open={issue !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        {issue ? (
          <>
            <SheetHeader className="items-start border-b border-border p-5">
              <div className="min-w-0 pr-4">
                <p className="mb-2 font-mono text-xs text-foreground-muted">{issue.key}</p>
                <SheetTitle className="text-base leading-6">{issue.summary}</SheetTitle>
              </div>
            </SheetHeader>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <dl className="space-y-4">
                <IssueField label="Status" value={issue.statusName} />
                <IssueField label="Type" value={issue.issueTypeName} />
                <IssueField label="Priority" value={issue.priorityName} />
                <IssueField label="Assignee" value={issue.assigneeName ?? 'Unassigned'} />
                <IssueField
                  label="Updated"
                  value={
                    issue.updatedAt ? new Date(issue.updatedAt).toLocaleString() : 'Not available'
                  }
                />
              </dl>
            </div>
            <SheetFooter className="p-4">
              <Button className="w-full" onClick={() => void rpc.app.openExternal(issue.url)}>
                <ExternalLink className="size-4" />
                Open in Jira
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function IssueField({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
      <dt className="text-xs text-foreground-muted">{label}</dt>
      <dd className="min-w-0 text-sm text-foreground">{value ?? 'Not available'}</dd>
    </div>
  );
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Jira could not load this board.';
}
