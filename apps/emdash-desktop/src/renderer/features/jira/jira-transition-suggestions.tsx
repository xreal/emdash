import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ArrowRight, Ellipsis } from 'lucide-react';
import { toast } from '@renderer/lib/hooks/use-toast';
import { rpc } from '@renderer/lib/ipc';
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
import { Spinner } from '@renderer/lib/ui/spinner';
import type { JiraBoardColumn, JiraIssueTransition } from '@shared/core/jira/jira-board';
import { resolveDefaultJiraTransition } from './jira-board-utils';

export function useJiraIssueTransitions(accountId: string, issueKey: string | null) {
  return useQuery({
    queryKey: ['jira', 'issue', accountId, issueKey, 'transitions'],
    queryFn: async () => {
      if (!issueKey) throw new Error('No Jira issue is selected.');
      const result = await rpc.jira.getIssueTransitions({ accountId, issueKey });
      if (!result.success) throw new Error(result.error.message);
      return result.data;
    },
    enabled: issueKey !== null,
    staleTime: 30_000,
  });
}

export function useConfirmedJiraTransition({
  accountId,
  boardId,
  issueKey,
}: {
  accountId: string;
  boardId: number;
  issueKey: string;
}) {
  const queryClient = useQueryClient();
  const showConfirmation = useShowModal('confirmActionModal');
  const transitionMutation = useMutation({
    mutationFn: async (transition: JiraIssueTransition) => {
      await executeJiraTransition({
        accountId,
        boardId,
        issueKey,
        transition,
        queryClient,
      });
      return transition;
    },
    onSuccess: (transition) => {
      toast({ title: `Moved ${issueKey} to ${transition.toStatusName}` });
    },
    onError: (error) => {
      toast({
        title: `Could not move ${issueKey}`,
        description: errorMessage(error),
        variant: 'destructive',
      });
    },
  });

  const confirmTransition = (
    transition: JiraIssueTransition,
    copy?: { title: string; description: string }
  ) => {
    showConfirmation({
      title: copy?.title ?? `Move ${issueKey} to ${transition.toStatusName}?`,
      description:
        copy?.description ?? `This will apply the Jira workflow transition "${transition.name}".`,
      confirmLabel: `Move to ${transition.toStatusName}`,
      variant: 'default',
      onSuccess: () => transitionMutation.mutate(transition),
    });
  };

  const confirmDetachedTransition = (
    transition: JiraIssueTransition,
    copy: { title: string; description: string }
  ) => {
    showConfirmation({
      ...copy,
      confirmLabel: `Move to ${transition.toStatusName}`,
      variant: 'default',
      onSuccess: () => {
        void executeJiraTransition({
          accountId,
          boardId,
          issueKey,
          transition,
          queryClient,
        })
          .then(() => toast({ title: `Moved ${issueKey} to ${transition.toStatusName}` }))
          .catch((error) => {
            toast({
              title: `Could not move ${issueKey}`,
              description: errorMessage(error),
              variant: 'destructive',
            });
          });
      },
    });
  };

  return {
    confirmTransition,
    confirmDetachedTransition,
    isPending: transitionMutation.isPending,
  };
}

export function JiraTransitionSuggestions({
  accountId,
  boardId,
  issueKey,
  columns,
  currentStatusId,
  currentStatus,
}: {
  accountId: string;
  boardId: number;
  issueKey: string;
  columns: JiraBoardColumn[];
  currentStatusId: string | null;
  currentStatus: string | null;
}) {
  const transitionsQuery = useJiraIssueTransitions(accountId, issueKey);
  const { confirmTransition, isPending } = useConfirmedJiraTransition({
    accountId,
    boardId,
    issueKey,
  });
  const transitions =
    transitionsQuery.data?.filter((transition) =>
      currentStatusId
        ? transition.toStatusId !== currentStatusId
        : transition.toStatusName !== currentStatus
    ) ?? [];
  const defaultTransition = resolveDefaultJiraTransition(columns, currentStatusId, transitions);
  const otherTransitions = transitions.filter(
    (transition) => transition.id !== defaultTransition?.id
  );

  return (
    <section
      className="mt-6 border-t border-border pt-5"
      aria-labelledby="jira-transition-suggestions"
    >
      <h3 id="jira-transition-suggestions" className="mb-3 text-sm font-medium text-foreground">
        Jira status
      </h3>
      {transitionsQuery.isLoading ? (
        <div className="flex items-center gap-2 text-xs text-foreground-muted">
          <Spinner size="sm" /> Loading available transitions
        </div>
      ) : transitionsQuery.error ? (
        <div className="rounded-lg border border-border p-3">
          <p className="text-xs leading-5 text-foreground-muted">
            {errorMessage(transitionsQuery.error)}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => void transitionsQuery.refetch()}
          >
            Try again
          </Button>
        </div>
      ) : transitions.length === 0 ? (
        <p className="text-xs leading-5 text-foreground-muted">
          No transitions are available for this issue. Jira may restrict its workflow or your
          permissions.
        </p>
      ) : (
        <div className="flex items-center gap-2">
          {defaultTransition ? (
            <Button
              variant="outline"
              className="min-w-0 flex-1 justify-between"
              disabled={isPending}
              onClick={() => confirmTransition(defaultTransition)}
            >
              <span className="truncate">Move to {defaultTransition.toStatusName}</span>
              <ArrowRight className="size-3.5" />
            </Button>
          ) : (
            <p className="min-w-0 flex-1 text-xs leading-5 text-foreground-muted">
              No direct transition to the next board column.
            </p>
          )}
          {otherTransitions.length > 0 ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="outline"
                    size="icon"
                    aria-label={`More Jira transitions (${otherTransitions.length})`}
                    disabled={isPending}
                  />
                }
              >
                <Ellipsis className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-64">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Other transitions</DropdownMenuLabel>
                  {otherTransitions.map((transition) => {
                    const requiresFields = transition.requiredFields.length > 0;
                    return (
                      <DropdownMenuItem
                        key={transition.id}
                        disabled={requiresFields}
                        onClick={() => confirmTransition(transition)}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          Move to {transition.toStatusName}
                        </span>
                        {requiresFields ? (
                          <span className="text-[10px] text-foreground-muted">Requires fields</span>
                        ) : null}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      )}
    </section>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Jira could not complete this request.';
}

async function executeJiraTransition({
  accountId,
  boardId,
  issueKey,
  transition,
  queryClient,
}: {
  accountId: string;
  boardId: number;
  issueKey: string;
  transition: JiraIssueTransition;
  queryClient: QueryClient;
}) {
  const result = await rpc.jira.transitionIssue({
    accountId,
    issueKey,
    transitionId: transition.id,
  });
  if (!result.success) throw new Error(result.error.message);

  await Promise.all([
    queryClient.refetchQueries({
      queryKey: ['jira', 'issue', accountId, issueKey],
      exact: true,
    }),
    queryClient.refetchQueries({
      queryKey: ['jira', 'board', accountId, boardId, 'issues'],
    }),
    queryClient.refetchQueries({
      queryKey: ['jira', 'issue', accountId, issueKey, 'transitions'],
      exact: true,
    }),
  ]);
}
