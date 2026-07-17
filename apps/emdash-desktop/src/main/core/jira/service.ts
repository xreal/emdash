import {
  getJiraAccountId,
  getJiraBoardConfiguration,
  getJiraIssueDetail,
  getJiraIssueTransitions,
  listJiraBoardIssues,
  listJiraBoardSprints,
  listJiraBoards,
  transitionJiraIssue,
} from '@emdash/plugins/integrations';
import { err, ok } from '@emdash/shared';
import { integrationCredentialStore } from '@main/core/integrations/integration-credential-store-instance';
import { log } from '@main/lib/logger';
import type {
  GetJiraBoardConfigurationInput,
  GetJiraIssueDetailInput,
  GetJiraIssueTransitionsInput,
  JiraBoardConfiguration,
  JiraBoardIssuePage,
  JiraBoardSummary,
  JiraIssueDetail,
  JiraIssueTransition,
  JiraSprintSummary,
  ListJiraBoardIssuesInput,
  ListJiraBoardSprintsInput,
  TransitionJiraIssueInput,
} from '@shared/core/jira/jira-board';

const jiraLog = log.child({ integration: 'jira', feature: 'boards' });

export async function listAvailableJiraBoards() {
  const credentials = await integrationCredentialStore.get('jira');
  if (!credentials) {
    return err({
      type: 'auth_failed' as const,
      message: 'Jira is not connected.',
    });
  }

  const accountId = getJiraAccountId(credentials);
  if (!accountId.success) return accountId;

  const result = await listJiraBoards({ credentials, log: jiraLog });
  if (!result.success) return result;

  return ok<JiraBoardSummary[]>(
    result.data.map((board) => ({
      accountId: accountId.data,
      ...board,
    }))
  );
}

export async function getJiraConnection() {
  const credentials = await integrationCredentialStore.get('jira');
  if (!credentials) return null;

  const accountId = getJiraAccountId(credentials);
  return accountId.success ? { accountId: accountId.data } : null;
}

export async function getAvailableJiraBoardConfiguration(input: GetJiraBoardConfigurationInput) {
  const credentials = await integrationCredentialStore.get('jira');
  if (!credentials) return jiraAuthError();

  const accountId = getJiraAccountId(credentials);
  if (!accountId.success) return accountId;
  if (accountId.data !== input.accountId) return jiraAccountChangedError();

  const result = await getJiraBoardConfiguration({ credentials, log: jiraLog }, input.boardId);
  if (!result.success) return result;

  return ok<JiraBoardConfiguration>({ accountId: accountId.data, ...result.data });
}

export async function listAvailableJiraBoardIssues(input: ListJiraBoardIssuesInput) {
  const credentials = await integrationCredentialStore.get('jira');
  if (!credentials) return jiraAuthError();

  const accountId = getJiraAccountId(credentials);
  if (!accountId.success) return accountId;
  if (accountId.data !== input.accountId) return jiraAccountChangedError();

  const result = await listJiraBoardIssues(
    { credentials, log: jiraLog },
    {
      boardId: input.boardId,
      sprintId: input.sprintId,
      startAt: input.startAt,
      maxResults: input.maxResults,
    }
  );
  return result.success ? ok<JiraBoardIssuePage>(result.data) : result;
}

export async function getAvailableJiraIssueDetail(input: GetJiraIssueDetailInput) {
  const credentials = await integrationCredentialStore.get('jira');
  if (!credentials) return jiraAuthError();

  const accountId = getJiraAccountId(credentials);
  if (!accountId.success) return accountId;
  if (accountId.data !== input.accountId) return jiraAccountChangedError();

  const result = await getJiraIssueDetail({ credentials, log: jiraLog }, input.issueKey);
  return result.success ? ok<JiraIssueDetail>(result.data) : result;
}

export async function getAvailableJiraIssueTransitions(input: GetJiraIssueTransitionsInput) {
  const credentials = await integrationCredentialStore.get('jira');
  if (!credentials) return jiraAuthError();

  const accountId = getJiraAccountId(credentials);
  if (!accountId.success) return accountId;
  if (accountId.data !== input.accountId) return jiraAccountChangedError();

  const result = await getJiraIssueTransitions({ credentials, log: jiraLog }, input.issueKey);
  return result.success ? ok<JiraIssueTransition[]>(result.data) : result;
}

export async function transitionAvailableJiraIssue(input: TransitionJiraIssueInput) {
  const credentials = await integrationCredentialStore.get('jira');
  if (!credentials) return jiraAuthError();

  const accountId = getJiraAccountId(credentials);
  if (!accountId.success) return accountId;
  if (accountId.data !== input.accountId) return jiraAccountChangedError();

  return transitionJiraIssue({ credentials, log: jiraLog }, input.issueKey, input.transitionId);
}

export async function listAvailableJiraBoardSprints(input: ListJiraBoardSprintsInput) {
  const credentials = await integrationCredentialStore.get('jira');
  if (!credentials) return jiraAuthError();

  const accountId = getJiraAccountId(credentials);
  if (!accountId.success) return accountId;
  if (accountId.data !== input.accountId) return jiraAccountChangedError();

  const result = await listJiraBoardSprints({ credentials, log: jiraLog }, input.boardId);
  return result.success ? ok<JiraSprintSummary[]>(result.data) : result;
}

function jiraAuthError() {
  return err({ type: 'auth_failed' as const, message: 'Jira is not connected.' });
}

function jiraAccountChangedError() {
  return err({
    type: 'auth_failed' as const,
    message: 'The Jira connection changed. Select a board from the connected site.',
  });
}
