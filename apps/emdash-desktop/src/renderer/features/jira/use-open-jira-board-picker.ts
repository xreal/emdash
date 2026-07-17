import { useIntegrationsContext } from '@renderer/features/integrations/integrations-provider';
import { useShowModal } from '@renderer/lib/modal/modal-provider';

export function useOpenJiraBoardPicker() {
  const {
    configuredConnections,
    connectionStatus,
    isCheckingConfiguredConnections,
    isCheckingConnections,
  } = useIntegrationsContext();
  const showBoardPicker = useShowModal('addJiraBoardsModal');
  const showIntegrationSetup = useShowModal('integrationSetupModal');

  return () => {
    const isConfigured = configuredConnections.jira;
    const status = connectionStatus.jira;

    if (
      isCheckingConfiguredConnections ||
      (isConfigured === true && isCheckingConnections && status?.connected !== true)
    ) {
      return;
    }

    if (isConfigured === true && status?.connected === true) {
      showBoardPicker({});
      return;
    }

    showIntegrationSetup({
      integration: 'jira',
      onSuccess: () => showBoardPicker({}),
    });
  };
}
