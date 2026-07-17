import { useQuery } from '@tanstack/react-query';
import { rpc } from '@renderer/lib/ipc';

export const JIRA_CONNECTION_QUERY_KEY = ['jira', 'connection'] as const;

export function useJiraConnection() {
  return useQuery({
    queryKey: JIRA_CONNECTION_QUERY_KEY,
    queryFn: () => rpc.jira.getConnection(),
    staleTime: Infinity,
  });
}
