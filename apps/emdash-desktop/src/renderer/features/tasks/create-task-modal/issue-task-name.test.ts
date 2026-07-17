import { describe, expect, it } from 'vitest';
import { getIssueTaskName } from './issue-task-name';

describe('getIssueTaskName', () => {
  it('normalizes a Linear branch name into a lowercase task name by default', () => {
    expect(
      getIssueTaskName({
        provider: 'linear',
        url: 'https://linear.app/general-action/issue/ENG-1368',
        title: 'Allow capital letters in issue titles',
        identifier: 'ENG-1368',
        branchName: 'jan/ENG-1368-allow-capital-letters-in-issue-titles',
      })
    ).toBe('jan-eng-1368-allow-capital-letters-in-issue-titles');
  });

  it('preserves Linear branch name capitals when configured', () => {
    expect(
      getIssueTaskName(
        {
          provider: 'linear',
          url: 'https://linear.app/general-action/issue/ENG-1368',
          title: 'Allow capital letters in issue titles',
          identifier: 'ENG-1368',
          branchName: 'jan/ENG-1368-allow-capital-letters-in-issue-titles',
        },
        { preserveCapitalization: true }
      )
    ).toBe('jan-ENG-1368-allow-capital-letters-in-issue-titles');
  });

  it('uses a branch name supplied by any provider', () => {
    expect(
      getIssueTaskName({
        provider: 'jira',
        url: 'https://example.atlassian.net/browse/APP-42',
        title: 'Fix login bug',
        identifier: 'APP-42',
        branchName: 'jona/app-42-fix-login-bug',
      })
    ).toBe('jona-app-42-fix-login-bug');
  });

  it('builds a Jira fallback name from the uppercase key and whole lowercase title words', () => {
    expect(
      getIssueTaskName({
        provider: 'jira',
        url: 'https://example.atlassian.net/browse/PC-294',
        title: 'Fix invalid OXUSERIDs in Shop, IM and Emarsys',
        identifier: 'PC-294',
      })
    ).toBe('PC-294-fix-invalid-oxuserids-in-shop-im-and');
  });

  it('prefixes a generated Jira name with the uppercase issue key', () => {
    expect(
      getIssueTaskName(
        {
          provider: 'jira',
          url: 'https://example.atlassian.net/browse/PC-294',
          title: 'Fix invalid OXUSERIDs in Shop, IM and Emarsys',
          identifier: 'PC-294',
        },
        { generatedName: 'fix-invalid-oxuserids-shop-emarsys' }
      )
    ).toBe('PC-294-fix-invalid-oxuserids-shop-emarsys');
  });

  it('limits the complete Jira task name to 50 characters', () => {
    const name = getIssueTaskName({
      provider: 'jira',
      url: 'https://example.atlassian.net/browse/PC-294',
      title: 'A title that is long enough to require truncation at a separator',
      identifier: 'PC-294',
    });

    expect(name?.length).toBeLessThanOrEqual(50);
    expect(name).not.toMatch(/-$/);
    expect(name).toBe('PC-294-a-title-that-is-long-enough-to-require');
  });

  it('prefixes Plain task names with the synthesized thread ref branch name', () => {
    expect(
      getIssueTaskName({
        provider: 'plain',
        url: '',
        title: 'Fix login bug',
        identifier: 'T-1070',
        branchName: 'T-1070-Fix login bug',
      })
    ).toBe('t-1070-fix-login-bug');
  });

  it('returns null for Plain issues without a synthesized branch name', () => {
    expect(
      getIssueTaskName({
        provider: 'plain',
        url: '',
        title: 'Fix login bug',
        identifier: 'T-1070',
      })
    ).toBeNull();
  });

  it('returns null when Linear did not provide a branch name', () => {
    expect(
      getIssueTaskName({
        provider: 'linear',
        url: 'https://linear.app/general-action/issue/GEN-626',
        title: 'Linear issue branch name creation',
        identifier: 'GEN-626',
      })
    ).toBeNull();
  });

  it('applies existing task-name length limits', () => {
    expect(
      getIssueTaskName({
        provider: 'linear',
        url: 'https://linear.app/general-action/issue/GEN-626',
        title: 'Linear issue branch name creation',
        identifier: 'GEN-626',
        branchName:
          'jona/gen-626-a-very-long-linear-issue-branch-name-that-should-be-truncated-for-task-name-display',
      })
    ).toHaveLength(64);
  });
});
