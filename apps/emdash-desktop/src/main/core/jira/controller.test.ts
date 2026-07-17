import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jiraController } from './controller';

const mocks = vi.hoisted(() => ({
  getCredentials: vi.fn(),
  getJiraAccountId: vi.fn(),
  getJiraIssueTransitions: vi.fn(),
  transitionJiraIssue: vi.fn(),
}));

vi.mock('@emdash/plugins/integrations', () => ({
  getJiraAccountId: mocks.getJiraAccountId,
  getJiraBoardConfiguration: vi.fn(),
  getJiraIssueDetail: vi.fn(),
  getJiraIssueTransitions: mocks.getJiraIssueTransitions,
  listJiraBoardIssues: vi.fn(),
  listJiraBoardSprints: vi.fn(),
  listJiraBoards: vi.fn(),
  transitionJiraIssue: mocks.transitionJiraIssue,
}));

vi.mock('@main/core/integrations/integration-credential-store-instance', () => ({
  integrationCredentialStore: { get: mocks.getCredentials },
}));

vi.mock('@main/lib/logger', () => ({
  log: { child: () => ({ warn: vi.fn() }) },
}));

const credentials = {
  siteUrl: 'https://example.atlassian.net',
  email: 'developer@example.com',
  apiToken: 'token',
};

describe('Jira transition RPC', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCredentials.mockResolvedValue(credentials);
    mocks.getJiraAccountId.mockReturnValue({
      success: true,
      data: 'example.atlassian.net',
    });
  });

  it('fetches transitions for the selected issue through the account-scoped controller', async () => {
    const transitions = [
      {
        id: '21',
        name: 'Start Progress',
        toStatusId: '3',
        toStatusName: 'In Progress',
        toStatusCategoryName: 'In Progress',
        requiredFields: [],
      },
    ];
    mocks.getJiraIssueTransitions.mockResolvedValue({ success: true, data: transitions });

    await expect(
      jiraController.getIssueTransitions({
        accountId: 'example.atlassian.net',
        issueKey: 'PLAT-7',
      })
    ).resolves.toEqual({ success: true, data: transitions });
    expect(mocks.getJiraIssueTransitions).toHaveBeenCalledWith(
      expect.objectContaining({ credentials }),
      'PLAT-7'
    );
  });

  it('executes only the explicitly selected transition', async () => {
    mocks.transitionJiraIssue.mockResolvedValue({ success: true, data: undefined });

    await expect(
      jiraController.transitionIssue({
        accountId: 'example.atlassian.net',
        issueKey: 'PLAT-7',
        transitionId: '21',
      })
    ).resolves.toEqual({ success: true, data: undefined });
    expect(mocks.transitionJiraIssue).toHaveBeenCalledWith(
      expect.objectContaining({ credentials }),
      'PLAT-7',
      '21'
    );
  });

  it('rejects stale site-scoped requests before calling Jira', async () => {
    await expect(
      jiraController.transitionIssue({
        accountId: 'another.atlassian.net',
        issueKey: 'PLAT-7',
        transitionId: '21',
      })
    ).resolves.toEqual({
      success: false,
      error: {
        type: 'auth_failed',
        message: 'The Jira connection changed. Select a board from the connected site.',
      },
    });
    expect(mocks.transitionJiraIssue).not.toHaveBeenCalled();
  });

  it('returns permission or unavailable-transition failures unchanged', async () => {
    const failure = {
      success: false as const,
      error: { type: 'auth_failed' as const, message: 'Jira transition permission is required.' },
    };
    mocks.transitionJiraIssue.mockResolvedValue(failure);

    await expect(
      jiraController.transitionIssue({
        accountId: 'example.atlassian.net',
        issueKey: 'PLAT-7',
        transitionId: 'missing',
      })
    ).resolves.toEqual(failure);
  });
});
