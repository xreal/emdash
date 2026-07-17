import { err, ok, type Result } from '@emdash/shared';
import { AgileClient, type AgileModels, Version3Client } from 'jira.js';
import { parseCredentials } from '../../helpers/credentials';
import { toIntegrationError } from '../../helpers/error';
import type { ConnectedIntegrationHostContext } from '../../host';
import type { IntegrationCredentials } from '../../host';
import type { IntegrationError } from '../../types';
import { jiraAdfToMarkdown } from './adf';
import {
  type JiraClient,
  type JiraAgileClient,
  type JiraBoardConfiguration,
  type JiraBoardIssue,
  type JiraBoardIssuePage,
  type JiraBoardSummary,
  type JiraCredentials,
  type JiraIssueDetail,
  type JiraIssueTransition,
  type JiraSprintSummary,
  jiraCredentialsSchema,
  type JiraVerifiedConnection,
} from './types';

const BOARD_PAGE_SIZE = 50;
const MAX_BOARD_PAGES = 200;
const SPRINT_PAGE_SIZE = 50;
const MAX_SPRINT_PAGES = 200;
const ISSUE_FIELDS = ['summary', 'status', 'assignee', 'issuetype', 'priority', 'updated'];
const ISSUE_DETAIL_FIELDS = [
  'summary',
  'description',
  'status',
  'assignee',
  'reporter',
  'issuetype',
  'priority',
  'project',
  'parent',
  'labels',
  'components',
  'resolution',
  'created',
  'updated',
  'duedate',
  'resolutiondate',
];
const JIRA_ISSUE_KEY_PATTERN = /^[A-Za-z][A-Za-z0-9_]*-\d+$/;

export type ListJiraBoardIssuesInput = {
  boardId: number;
  sprintId?: number;
  startAt?: number;
  maxResults?: number;
};

class InvalidJiraBoardConfigurationError extends Error {}
class InvalidJiraIssueDetailError extends Error {}

export function readJiraCredentials(
  credentials: IntegrationCredentials
): Result<JiraCredentials, IntegrationError> {
  return parseCredentials(jiraCredentialsSchema, credentials);
}

export function createJiraClient(credentials: JiraCredentials): JiraClient {
  return new Version3Client({
    host: credentials.siteUrl,
    authentication: {
      basic: {
        email: credentials.email,
        apiToken: credentials.apiToken,
      },
    },
  });
}

export function createJiraAgileClient(credentials: JiraCredentials): JiraAgileClient {
  return new AgileClient({
    host: credentials.siteUrl,
    authentication: {
      basic: {
        email: credentials.email,
        apiToken: credentials.apiToken,
      },
    },
  });
}

export function getJiraAccountId(
  rawCredentials: IntegrationCredentials
): Result<string, IntegrationError> {
  const credentials = readJiraCredentials(rawCredentials);
  if (!credentials.success) return err(credentials.error);
  return ok(new URL(credentials.data.siteUrl).host.toLowerCase());
}

export async function fetchJiraBoards(
  client: Pick<JiraAgileClient, 'board'>
): Promise<JiraBoardSummary[]> {
  const boards: JiraBoardSummary[] = [];
  let startAt = 0;
  const visitedOffsets = new Set<number>();
  let pageCount = 0;

  while (!visitedOffsets.has(startAt)) {
    if (pageCount >= MAX_BOARD_PAGES) {
      throw new Error('Jira board discovery exceeded the pagination safety limit.');
    }
    pageCount += 1;
    visitedOffsets.add(startAt);
    const page: AgileModels.GetAllBoards = await client.board.getAllBoards({
      startAt,
      maxResults: BOARD_PAGE_SIZE,
      orderBy: 'name',
    });
    const values = page.values ?? [];

    for (const board of values) {
      if (
        typeof board.id !== 'number' ||
        !board.name?.trim() ||
        (board.type !== 'scrum' && board.type !== 'kanban')
      ) {
        continue;
      }

      boards.push({
        id: board.id,
        name: board.name.trim(),
        type: board.type,
        projectKey: board.location?.projectKey ?? null,
        projectName: board.location?.projectName ?? board.location?.name ?? null,
      });
    }

    const nextStartAt = (page.startAt ?? startAt) + values.length;
    if (
      page.isLast === true ||
      values.length === 0 ||
      (typeof page.total === 'number' && nextStartAt >= page.total)
    ) {
      break;
    }
    startAt = nextStartAt;
  }

  return boards;
}

export async function listJiraBoards(
  host: ConnectedIntegrationHostContext
): Promise<Result<JiraBoardSummary[], IntegrationError>> {
  const credentials = readJiraCredentials(host.credentials);
  if (!credentials.success) return err(credentials.error);

  try {
    return ok(await fetchJiraBoards(createJiraAgileClient(credentials.data)));
  } catch (error) {
    host.log.warn('Jira board discovery failed', { error });
    return err(toIntegrationError(error, 'Jira', 'Unable to discover Jira boards.'));
  }
}

export async function fetchJiraBoardConfiguration(
  client: Pick<JiraAgileClient, 'board'>,
  boardId: number
): Promise<JiraBoardConfiguration> {
  const rawConfiguration: unknown = await client.board.getConfiguration<unknown>({ boardId });
  const configuration = mapJiraBoardConfiguration(rawConfiguration);
  if (!configuration) {
    throw new InvalidJiraBoardConfigurationError('Jira returned an invalid board configuration.');
  }

  if (configuration.type === 'kanban') return configuration;

  return {
    ...configuration,
    activeSprint: await fetchActiveJiraSprint(client, boardId),
  };
}

export function mapJiraBoardConfiguration(raw: unknown): JiraBoardConfiguration | null {
  if (!isRecord(raw)) return null;

  const id = positiveInteger(raw.id);
  const name = nonemptyString(raw.name);
  const type = raw.type === 'scrum' || raw.type === 'kanban' ? raw.type : null;
  if (id === null || name === null || type === null) return null;

  const columnConfig = isRecord(raw.columnConfig) ? raw.columnConfig : null;
  const rawColumns =
    columnConfig && Array.isArray(columnConfig.columns) ? columnConfig.columns : [];
  const columns = rawColumns.flatMap((rawColumn, index) => {
    if (!isRecord(rawColumn)) return [];
    const columnName = nonemptyString(rawColumn.name);
    if (!columnName) return [];

    const statuses = Array.isArray(rawColumn.statuses) ? rawColumn.statuses : [];
    const statusIds = statuses.flatMap((status) => {
      if (!isRecord(status)) return [];
      const statusId = nonemptyString(status.id);
      return statusId ? [statusId] : [];
    });

    return [
      {
        id: `${id}:${index}`,
        name: columnName,
        statusIds,
        min: finiteNumber(rawColumn.min),
        max: finiteNumber(rawColumn.max),
      },
    ];
  });

  return {
    id,
    name,
    type,
    columns,
    constraintType: columnConfig ? nonemptyString(columnConfig.constraintType) : null,
    activeSprint: null,
  };
}

export async function fetchActiveJiraSprint(
  client: Pick<JiraAgileClient, 'board'>,
  boardId: number
): Promise<JiraSprintSummary | null> {
  const sprints = await fetchJiraSprints(client, boardId, 'active');
  return sprints[0] ?? null;
}

export async function fetchJiraSprints(
  client: Pick<JiraAgileClient, 'board'>,
  boardId: number,
  state?: 'active' | 'future' | 'closed'
): Promise<JiraSprintSummary[]> {
  const sprints: JiraSprintSummary[] = [];
  const visitedOffsets = new Set<number>();
  let startAt = 0;
  let pageCount = 0;

  while (!visitedOffsets.has(startAt)) {
    if (pageCount >= MAX_SPRINT_PAGES) {
      throw new Error('Jira sprint discovery exceeded the pagination safety limit.');
    }
    pageCount += 1;
    visitedOffsets.add(startAt);

    const rawPage: unknown = await client.board.getAllSprints<unknown>({
      boardId,
      startAt,
      maxResults: SPRINT_PAGE_SIZE,
      ...(state ? { state } : {}),
    });
    if (!isRecord(rawPage)) break;

    const values = Array.isArray(rawPage.values) ? rawPage.values : [];
    for (const rawSprint of values) {
      const sprint = mapJiraSprint(rawSprint);
      if (sprint && (!state || sprint.state === state)) sprints.push(sprint);
    }

    const pageStartAt = nonnegativeInteger(rawPage.startAt) ?? startAt;
    const nextStartAt = pageStartAt + values.length;
    const total = nonnegativeInteger(rawPage.total);
    if (
      rawPage.isLast === true ||
      values.length === 0 ||
      (total !== null && nextStartAt >= total) ||
      nextStartAt <= startAt
    ) {
      break;
    }
    startAt = nextStartAt;
  }

  sprints.sort((left, right) => left.id - right.id);
  return sprints;
}

export function mapJiraSprint(raw: unknown): JiraSprintSummary | null {
  if (!isRecord(raw)) return null;
  const id = positiveInteger(raw.id);
  const name = nonemptyString(raw.name);
  const state = nonemptyString(raw.state);
  if (id === null || name === null || state === null) return null;

  return {
    id,
    name,
    state,
    startDate: nonemptyString(raw.startDate),
    endDate: nonemptyString(raw.endDate),
    completeDate: nonemptyString(raw.completeDate),
    goal: nonemptyString(raw.goal),
  };
}

export async function getJiraBoardConfiguration(
  host: ConnectedIntegrationHostContext,
  boardId: number
): Promise<Result<JiraBoardConfiguration, IntegrationError>> {
  const credentials = readJiraCredentials(host.credentials);
  if (!credentials.success) return err(credentials.error);
  if (positiveInteger(boardId) === null) {
    return err({ type: 'invalid_input', message: 'Jira board ID must be a positive integer.' });
  }

  try {
    return ok(await fetchJiraBoardConfiguration(createJiraAgileClient(credentials.data), boardId));
  } catch (error) {
    host.log.warn('Jira board configuration failed', { error, boardId });
    if (error instanceof InvalidJiraBoardConfigurationError) {
      return err({ type: 'invalid_input', message: error.message });
    }
    return err(toIntegrationError(error, 'Jira', 'Unable to load the Jira board configuration.'));
  }
}

export async function listJiraBoardSprints(
  host: ConnectedIntegrationHostContext,
  boardId: number
): Promise<Result<JiraSprintSummary[], IntegrationError>> {
  const credentials = readJiraCredentials(host.credentials);
  if (!credentials.success) return err(credentials.error);
  if (positiveInteger(boardId) === null) {
    return err({ type: 'invalid_input', message: 'Jira board ID must be a positive integer.' });
  }

  try {
    return ok(await fetchJiraSprints(createJiraAgileClient(credentials.data), boardId));
  } catch (error) {
    host.log.warn('Jira sprint discovery failed', { error, boardId });
    return err(toIntegrationError(error, 'Jira', 'Unable to load Jira sprints.'));
  }
}

export async function fetchJiraBoardIssues(
  client: Pick<JiraAgileClient, 'board'>,
  siteUrl: string,
  input: ListJiraBoardIssuesInput
): Promise<JiraBoardIssuePage> {
  const startAt = clampInteger(input.startAt, 0, Number.MAX_SAFE_INTEGER, 0);
  const maxResults = clampInteger(input.maxResults, 1, 100, 50);
  const parameters = {
    boardId: input.boardId,
    startAt,
    maxResults,
    fields: ISSUE_FIELDS,
  };
  const rawPage: unknown =
    input.sprintId === undefined
      ? await client.board.getIssuesForBoard<unknown>(parameters)
      : await client.board.getBoardIssuesForSprint<unknown>({
          ...parameters,
          sprintId: input.sprintId,
        });

  return mapJiraBoardIssuePage(rawPage, siteUrl, startAt, maxResults);
}

export function mapJiraBoardIssuePage(
  raw: unknown,
  siteUrl: string,
  requestedStartAt: number,
  requestedMaxResults: number
): JiraBoardIssuePage {
  const page = isRecord(raw) ? raw : {};
  const rawIssues = Array.isArray(page.issues) ? page.issues : [];
  const startAt = nonnegativeInteger(page.startAt) ?? requestedStartAt;
  const maxResults = positiveInteger(page.maxResults) ?? requestedMaxResults;
  const total = nonnegativeInteger(page.total) ?? startAt + rawIssues.length;
  const issues = rawIssues.flatMap((rawIssue) => {
    const issue = mapJiraBoardIssue(rawIssue, siteUrl);
    return issue ? [issue] : [];
  });
  const endAt = startAt + rawIssues.length;

  return {
    startAt,
    maxResults,
    total,
    isLast: page.isLast === true || rawIssues.length === 0 || endAt >= total,
    issues,
  };
}

export function mapJiraBoardIssue(raw: unknown, siteUrl: string): JiraBoardIssue | null {
  if (!isRecord(raw)) return null;
  const id = nonemptyString(raw.id);
  const key = nonemptyString(raw.key);
  const fields = isRecord(raw.fields) ? raw.fields : null;
  const summary = fields ? nonemptyString(fields.summary) : null;
  if (!id || !key || !summary) return null;

  const status = fields && isRecord(fields.status) ? fields.status : null;
  const assignee = fields && isRecord(fields.assignee) ? fields.assignee : null;
  const avatarUrls = assignee && isRecord(assignee.avatarUrls) ? assignee.avatarUrls : null;
  const issueType = fields && isRecord(fields.issuetype) ? fields.issuetype : null;
  const priority = fields && isRecord(fields.priority) ? fields.priority : null;

  return {
    id,
    key,
    summary,
    statusId: status ? nonemptyString(status.id) : null,
    statusName: status ? nonemptyString(status.name) : null,
    assigneeName: assignee ? nonemptyString(assignee.displayName) : null,
    assigneeAvatarUrl: avatarUrls
      ? (nonemptyString(avatarUrls['48x48']) ??
        nonemptyString(avatarUrls['32x32']) ??
        nonemptyString(avatarUrls['24x24']) ??
        nonemptyString(avatarUrls['16x16']))
      : null,
    issueTypeName: issueType ? nonemptyString(issueType.name) : null,
    issueTypeIconUrl: issueType ? nonemptyString(issueType.iconUrl) : null,
    priorityName: priority ? nonemptyString(priority.name) : null,
    priorityIconUrl: priority ? nonemptyString(priority.iconUrl) : null,
    updatedAt: fields ? nonemptyString(fields.updated) : null,
    url: `${siteUrl.replace(/\/+$/, '')}/browse/${encodeURIComponent(key)}`,
  };
}

export async function listJiraBoardIssues(
  host: ConnectedIntegrationHostContext,
  input: ListJiraBoardIssuesInput
): Promise<Result<JiraBoardIssuePage, IntegrationError>> {
  const credentials = readJiraCredentials(host.credentials);
  if (!credentials.success) return err(credentials.error);
  if (
    positiveInteger(input.boardId) === null ||
    (input.sprintId !== undefined && positiveInteger(input.sprintId) === null)
  ) {
    return err({
      type: 'invalid_input',
      message: 'Jira board and sprint IDs must be positive integers.',
    });
  }

  try {
    return ok(
      await fetchJiraBoardIssues(
        createJiraAgileClient(credentials.data),
        credentials.data.siteUrl,
        input
      )
    );
  } catch (error) {
    host.log.warn('Jira board issue listing failed', { error, boardId: input.boardId });
    return err(toIntegrationError(error, 'Jira', 'Unable to load Jira board issues.'));
  }
}

export async function fetchJiraIssueDetail(
  client: Pick<JiraClient, 'issues'>,
  siteUrl: string,
  issueKey: string
): Promise<JiraIssueDetail> {
  const raw = await client.issues.getIssue<unknown>({
    issueIdOrKey: issueKey,
    fields: ISSUE_DETAIL_FIELDS,
    failFast: false,
  });
  const detail = mapJiraIssueDetail(raw, siteUrl);
  if (!detail) throw new InvalidJiraIssueDetailError('Jira returned an invalid issue response.');
  return detail;
}

export function mapJiraIssueDetail(raw: unknown, siteUrl: string): JiraIssueDetail | null {
  if (!isRecord(raw)) return null;
  const id = nonemptyString(raw.id);
  const key = nonemptyString(raw.key);
  const fields = isRecord(raw.fields) ? raw.fields : null;
  const summary = fields ? nonemptyString(fields.summary) : null;
  if (!id || !key || !summary || !fields) return null;

  const status = isRecord(fields.status) ? fields.status : null;
  const statusCategory = status && isRecord(status.statusCategory) ? status.statusCategory : null;
  const assignee = isRecord(fields.assignee) ? fields.assignee : null;
  const reporter = isRecord(fields.reporter) ? fields.reporter : null;
  const issueType = isRecord(fields.issuetype) ? fields.issuetype : null;
  const priority = isRecord(fields.priority) ? fields.priority : null;
  const project = isRecord(fields.project) ? fields.project : null;
  const parent = isRecord(fields.parent) ? fields.parent : null;
  const parentFields = parent && isRecord(parent.fields) ? parent.fields : null;
  const resolution = isRecord(fields.resolution) ? fields.resolution : null;

  return {
    id,
    key,
    summary,
    description: jiraAdfToMarkdown(fields.description),
    statusName: status ? nonemptyString(status.name) : null,
    statusCategoryName: statusCategory ? nonemptyString(statusCategory.name) : null,
    assigneeName: assignee ? nonemptyString(assignee.displayName) : null,
    reporterName: reporter ? nonemptyString(reporter.displayName) : null,
    issueTypeName: issueType ? nonemptyString(issueType.name) : null,
    priorityName: priority ? nonemptyString(priority.name) : null,
    projectKey: project ? nonemptyString(project.key) : null,
    projectName: project ? nonemptyString(project.name) : null,
    parentKey: parent ? nonemptyString(parent.key) : null,
    parentSummary: parentFields ? nonemptyString(parentFields.summary) : null,
    labels: stringArray(fields.labels),
    components: Array.isArray(fields.components)
      ? fields.components.flatMap((component) => {
          const name = isRecord(component) ? nonemptyString(component.name) : null;
          return name ? [name] : [];
        })
      : [],
    resolutionName: resolution ? nonemptyString(resolution.name) : null,
    createdAt: nonemptyString(fields.created),
    updatedAt: nonemptyString(fields.updated),
    dueDate: nonemptyString(fields.duedate),
    resolvedAt: nonemptyString(fields.resolutiondate),
    url: `${siteUrl.replace(/\/+$/, '')}/browse/${encodeURIComponent(key)}`,
  };
}

export async function getJiraIssueDetail(
  host: ConnectedIntegrationHostContext,
  issueKey: string
): Promise<Result<JiraIssueDetail, IntegrationError>> {
  const credentials = readJiraCredentials(host.credentials);
  if (!credentials.success) return err(credentials.error);
  if (!JIRA_ISSUE_KEY_PATTERN.test(issueKey)) {
    return err({ type: 'invalid_input', message: 'Jira issue key is invalid.' });
  }

  try {
    return ok(
      await fetchJiraIssueDetail(
        createJiraClient(credentials.data),
        credentials.data.siteUrl,
        issueKey
      )
    );
  } catch (error) {
    host.log.warn('Jira issue detail loading failed', { error, issueKey });
    return err(toIntegrationError(error, 'Jira', 'Unable to load Jira issue details.'));
  }
}

export async function fetchJiraIssueTransitions(
  client: Pick<JiraClient, 'issues'>,
  issueKey: string
): Promise<JiraIssueTransition[]> {
  const raw: unknown = await client.issues.getTransitions<unknown>({
    issueIdOrKey: issueKey,
    expand: 'transitions.fields',
    sortByOpsBarAndStatus: true,
  });
  if (!isRecord(raw) || !Array.isArray(raw.transitions)) return [];

  return raw.transitions.flatMap((entry) => {
    if (!isRecord(entry) || entry.isAvailable === false) return [];
    const id = nonemptyString(entry.id);
    const name = nonemptyString(entry.name);
    const to = isRecord(entry.to) ? entry.to : null;
    const toStatusId = to ? nonemptyString(to.id) : null;
    const toStatusName = to ? nonemptyString(to.name) : null;
    if (!id || !name || !toStatusId || !toStatusName) return [];

    const statusCategory = to && isRecord(to.statusCategory) ? to.statusCategory : null;
    const fields = isRecord(entry.fields) ? entry.fields : {};
    const requiredFields = Object.entries(fields).flatMap(([fieldId, field]) => {
      if (!isRecord(field) || field.required !== true) return [];
      return [nonemptyString(field.name) ?? fieldId];
    });

    return [
      {
        id,
        name,
        toStatusId,
        toStatusName,
        toStatusCategoryName: statusCategory ? nonemptyString(statusCategory.name) : null,
        requiredFields,
      },
    ];
  });
}

export async function getJiraIssueTransitions(
  host: ConnectedIntegrationHostContext,
  issueKey: string
): Promise<Result<JiraIssueTransition[], IntegrationError>> {
  const credentials = readJiraCredentials(host.credentials);
  if (!credentials.success) return err(credentials.error);
  if (!JIRA_ISSUE_KEY_PATTERN.test(issueKey)) {
    return err({ type: 'invalid_input', message: 'Jira issue key is invalid.' });
  }

  try {
    return ok(await fetchJiraIssueTransitions(createJiraClient(credentials.data), issueKey));
  } catch (error) {
    host.log.warn('Jira issue transition loading failed', { error, issueKey });
    return err(toIntegrationError(error, 'Jira', 'Unable to load Jira issue transitions.'));
  }
}

export async function transitionJiraIssue(
  host: ConnectedIntegrationHostContext,
  issueKey: string,
  transitionId: string
): Promise<Result<void, IntegrationError>> {
  const credentials = readJiraCredentials(host.credentials);
  if (!credentials.success) return err(credentials.error);
  if (!JIRA_ISSUE_KEY_PATTERN.test(issueKey)) {
    return err({ type: 'invalid_input', message: 'Jira issue key is invalid.' });
  }
  const normalizedTransitionId = nonemptyString(transitionId);
  if (!normalizedTransitionId) {
    return err({ type: 'invalid_input', message: 'Jira transition ID is required.' });
  }

  try {
    await executeJiraIssueTransition(
      createJiraClient(credentials.data),
      issueKey,
      normalizedTransitionId
    );
    return ok();
  } catch (error) {
    host.log.warn('Jira issue transition failed', { error, issueKey, transitionId });
    return err(toIntegrationError(error, 'Jira', 'Unable to transition the Jira issue.'));
  }
}

export async function executeJiraIssueTransition(
  client: Pick<JiraClient, 'issues'>,
  issueKey: string,
  transitionId: string
): Promise<void> {
  await client.issues.doTransition({
    issueIdOrKey: issueKey,
    transition: { id: transitionId },
  });
}

export async function verifyJiraCredentials(
  rawCredentials: IntegrationCredentials
): Promise<Result<JiraVerifiedConnection, IntegrationError>> {
  const credentials = readJiraCredentials(rawCredentials);
  if (!credentials.success) return err(credentials.error);

  const client = createJiraClient(credentials.data);
  try {
    const user = await client.myself.getCurrentUser();
    return ok({
      displayName: user.displayName,
      displayDetail: `${credentials.data.email} · ${new URL(credentials.data.siteUrl).host}`,
      credentials: credentials.data,
    });
  } catch (error) {
    return err(toIntegrationError(error, 'Jira'));
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function nonemptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value.flatMap((entry) => {
        const text = nonemptyString(entry);
        return text ? [text] : [];
      })
    ),
  ];
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function nonnegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function positiveInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;
}

function clampInteger(
  value: number | undefined,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.trunc(value)));
}
