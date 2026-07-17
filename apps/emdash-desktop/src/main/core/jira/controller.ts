import { createRPCController } from '@shared/lib/ipc/rpc';
import {
  getAvailableJiraBoardConfiguration,
  getJiraConnection,
  listAvailableJiraBoardIssues,
  listAvailableJiraBoardSprints,
  listAvailableJiraBoards,
} from './service';

export const jiraController = createRPCController({
  getConnection: getJiraConnection,
  getBoardConfiguration: getAvailableJiraBoardConfiguration,
  listBoardIssues: listAvailableJiraBoardIssues,
  listBoardSprints: listAvailableJiraBoardSprints,
  listBoards: listAvailableJiraBoards,
});
