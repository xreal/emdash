import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { JSDOM } from 'jsdom';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { JiraTransitionSuggestions } from './jira-transition-suggestions';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  getIssueTransitions: vi.fn(),
  showConfirmation: vi.fn(),
  toast: vi.fn(),
  transitionIssue: vi.fn(),
}));

vi.mock('@renderer/lib/ipc', () => ({
  rpc: {
    jira: {
      getIssueTransitions: mocks.getIssueTransitions,
      transitionIssue: mocks.transitionIssue,
    },
  },
}));

vi.mock('@renderer/lib/modal/modal-provider', () => ({
  useShowModal: () => mocks.showConfirmation,
}));

vi.mock('@renderer/lib/hooks/use-toast', () => ({
  toast: mocks.toast,
}));

const inProgressTransition = {
  id: '21',
  name: 'Start Progress',
  toStatusId: '3',
  toStatusName: 'In Progress',
  toStatusCategoryName: 'In Progress',
  requiredFields: [],
};
const columns = [
  { id: 'todo', name: 'To do', statusIds: ['1'], min: null, max: null },
  { id: 'progress', name: 'In progress', statusIds: ['3'], min: null, max: null },
  { id: 'done', name: 'Done', statusIds: ['4'], min: null, max: null },
];

describe('JiraTransitionSuggestions', () => {
  let dom: JSDOM;
  let root: Root;
  let container: HTMLDivElement;
  let queryClient: QueryClient;

  beforeEach(() => {
    mocks.getIssueTransitions.mockResolvedValue({
      success: true,
      data: [
        inProgressTransition,
        {
          ...inProgressTransition,
          id: '31',
          name: 'Done',
          toStatusId: '4',
          toStatusName: 'Done',
          toStatusCategoryName: 'Done',
        },
      ],
    });
    mocks.transitionIssue.mockResolvedValue({ success: true, data: undefined });

    dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>');
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('window', dom.window);
    vi.stubGlobal('document', dom.window.document);
    vi.stubGlobal('Element', dom.window.Element);
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement);
    vi.stubGlobal('Event', dom.window.Event);
    vi.stubGlobal('Node', dom.window.Node);

    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    container = dom.window.document.getElementById('root') as HTMLDivElement;
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    queryClient.clear();
    vi.unstubAllGlobals();
    vi.clearAllMocks();
    dom.window.close();
  });

  async function renderSuggestions(expectedText = 'Move to In Progress') {
    await act(async () => {
      root.render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(JiraTransitionSuggestions, {
            accountId: 'example.atlassian.net',
            boardId: 12,
            issueKey: 'PLAT-7',
            columns,
            currentStatusId: '1',
            currentStatus: 'To Do',
          })
        )
      );
    });
    await vi.waitFor(() => expect(container.textContent).toContain(expectedText));
  }

  it('requires confirmation before transitioning, then refreshes the issue and board', async () => {
    const refetchQueries = vi.spyOn(queryClient, 'refetchQueries');
    await renderSuggestions();
    const moveButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Move to In Progress'
    );

    expect(container.textContent).not.toContain('Move to Done');
    expect(container.querySelector('[aria-label="More Jira transitions (1)"]')).not.toBeNull();

    await act(async () => {
      moveButton!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });

    expect(mocks.transitionIssue).not.toHaveBeenCalled();
    expect(mocks.showConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Move PLAT-7 to In Progress?',
        confirmLabel: 'Move to In Progress',
        variant: 'default',
        onSuccess: expect.any(Function),
      })
    );

    await act(async () => {
      mocks.showConfirmation.mock.calls[0]![0].onSuccess();
    });
    await vi.waitFor(() => {
      expect(mocks.toast).toHaveBeenCalledWith({ title: 'Moved PLAT-7 to In Progress' });
    });

    expect(mocks.transitionIssue).toHaveBeenCalledWith({
      accountId: 'example.atlassian.net',
      issueKey: 'PLAT-7',
      transitionId: '21',
    });
    expect(refetchQueries).toHaveBeenCalledWith({
      queryKey: ['jira', 'issue', 'example.atlassian.net', 'PLAT-7'],
      exact: true,
    });
    expect(refetchQueries).toHaveBeenCalledWith({
      queryKey: ['jira', 'board', 'example.atlassian.net', 12, 'issues'],
    });
  });

  it('reports transition failures without refreshing local Jira queries', async () => {
    mocks.transitionIssue.mockResolvedValue({
      success: false,
      error: { type: 'auth_failed', message: 'You cannot transition this issue.' },
    });
    const refetchQueries = vi.spyOn(queryClient, 'refetchQueries');
    await renderSuggestions();
    const moveButton = [...container.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === 'Move to In Progress'
    );

    await act(async () => {
      moveButton!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      mocks.showConfirmation.mock.calls[0]![0].onSuccess();
    });

    await vi.waitFor(() => {
      expect(mocks.toast).toHaveBeenCalledWith({
        title: 'Could not move PLAT-7',
        description: 'You cannot transition this issue.',
        variant: 'destructive',
      });
    });
    expect(refetchQueries).not.toHaveBeenCalled();
  });

  it('keeps transitions requiring fields out of the default action', async () => {
    mocks.getIssueTransitions.mockResolvedValue({
      success: true,
      data: [{ ...inProgressTransition, requiredFields: ['Resolution'] }],
    });
    await renderSuggestions('No direct transition to the next board column.');

    expect(container.textContent).toContain('No direct transition to the next board column.');
    expect(container.querySelector('[aria-label="More Jira transitions (1)"]')).not.toBeNull();
  });

  it('shows permission and transition discovery failures in the inspector', async () => {
    mocks.getIssueTransitions.mockResolvedValue({
      success: false,
      error: { type: 'auth_failed', message: 'Jira transition permission is required.' },
    });

    await act(async () => {
      root.render(
        React.createElement(
          QueryClientProvider,
          { client: queryClient },
          React.createElement(JiraTransitionSuggestions, {
            accountId: 'example.atlassian.net',
            boardId: 12,
            issueKey: 'PLAT-7',
            columns,
            currentStatusId: '1',
            currentStatus: 'To Do',
          })
        )
      );
    });

    await vi.waitFor(() => {
      expect(container.textContent).toContain('Jira transition permission is required.');
    });
    expect(container.textContent).toContain('Try again');
  });
});
