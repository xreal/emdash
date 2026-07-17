/**
 * Fork allowlist: only these integrations surface in settings, issue pickers,
 * and connection RPC. Plugin implementations remain registered for upstream
 * compatibility and existing linked-issue data.
 */
const ENABLED_INTEGRATIONS = new Set(['github', 'jira']);

export function isIntegrationEnabled(integrationId: string): boolean {
  return ENABLED_INTEGRATIONS.has(integrationId);
}
