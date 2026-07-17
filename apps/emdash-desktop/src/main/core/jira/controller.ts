import { createRPCController } from '@shared/lib/ipc/rpc';
import {
  getAvailableJiraBoardConfiguration,
  getAvailableJiraIssueDetail,
  getAvailableJiraIssueTransitions,
  getJiraConnection,
  listAvailableJiraBoardIssues,
  listAvailableJiraBoardSprints,
  listAvailableJiraBoards,
  transitionAvailableJiraIssue,
} from './service';

export const jiraController = createRPCController({
  getConnection: getJiraConnection,
  getBoardConfiguration: getAvailableJiraBoardConfiguration,
  getIssueDetail: getAvailableJiraIssueDetail,
  getIssueTransitions: getAvailableJiraIssueTransitions,
  listBoardIssues: listAvailableJiraBoardIssues,
  listBoardSprints: listAvailableJiraBoardSprints,
  listBoards: listAvailableJiraBoards,
  transitionIssue: transitionAvailableJiraIssue,
});
