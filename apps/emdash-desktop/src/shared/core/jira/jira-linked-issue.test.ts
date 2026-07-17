import { describe, expect, it } from 'vitest';
import { jiraBoardIssueToLinkedIssue } from './jira-linked-issue';

describe('jiraBoardIssueToLinkedIssue', () => {
  it('maps board and fetched detail fields into a Jira LinkedIssue', () => {
    const linked = jiraBoardIssueToLinkedIssue({
      key: 'PLAT-12',
      summary: 'Render native columns',
      statusName: 'In Progress',
      assigneeName: 'Ada Lovelace',
      updatedAt: '2026-07-17T12:00:00.000Z',
      url: 'https://example.atlassian.net/browse/PLAT-12',
      projectName: 'Platform',
      description: 'Implement the native board view.',
      fetchedAt: '2026-07-17T12:05:00.000Z',
    });

    expect(linked).toEqual({
      provider: 'jira',
      url: 'https://example.atlassian.net/browse/PLAT-12',
      identifier: 'PLAT-12',
      title: 'Render native columns',
      description: 'Implement the native board view.',
      status: 'In Progress',
      assignees: ['Ada Lovelace'],
      project: 'Platform',
      updatedAt: '2026-07-17T12:00:00.000Z',
      fetchedAt: '2026-07-17T12:05:00.000Z',
    });
    expect(linked).not.toHaveProperty('context');
  });

  it('omits optional fields when the board endpoint did not return them', () => {
    const linked = jiraBoardIssueToLinkedIssue({
      key: 'PLAT-1',
      summary: 'Minimal issue',
      statusName: null,
      assigneeName: null,
      updatedAt: null,
      url: 'https://example.atlassian.net/browse/PLAT-1',
      fetchedAt: '2026-07-17T12:05:00.000Z',
    });

    expect(linked).toEqual({
      provider: 'jira',
      url: 'https://example.atlassian.net/browse/PLAT-1',
      identifier: 'PLAT-1',
      title: 'Minimal issue',
      fetchedAt: '2026-07-17T12:05:00.000Z',
    });
  });
});
