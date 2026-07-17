import type { AgileClient, AgileModels, Version3Client, Version3Models } from 'jira.js';
import z from 'zod';
import { credentialString } from '../../helpers/credentials';

export const jiraCredentialsSchema = z.object({
  siteUrl: credentialString('Jira site URL is required.')
    .refine(isHttpUrl, 'Jira site URL must be a valid HTTP(S) URL.')
    .transform((value) => value.replace(/\/+$/, '')),
  email: credentialString('Jira email is required.'),
  apiToken: credentialString('Jira API token is required.'),
});

export type JiraCredentials = z.infer<typeof jiraCredentialsSchema>;

export type JiraClient = Version3Client;
export type JiraAgileClient = AgileClient;
export type JiraAgileBoard = AgileModels.Board;

export type JiraIssue = Version3Models.Issue;

export type JiraVerifiedConnection = {
  displayName?: string;
  displayDetail?: string;
  credentials: JiraCredentials;
};

export type JiraBoardSummary = {
  id: number;
  name: string;
  type: 'scrum' | 'kanban';
  projectKey: string | null;
  projectName: string | null;
};

export type JiraBoardColumn = {
  id: string;
  name: string;
  statusIds: string[];
  min: number | null;
  max: number | null;
};

export type JiraSprintSummary = {
  id: number;
  name: string;
  state: 'active' | 'future' | 'closed' | string;
  startDate: string | null;
  endDate: string | null;
  completeDate: string | null;
  goal: string | null;
};

export type JiraBoardConfiguration = {
  id: number;
  name: string;
  type: 'scrum' | 'kanban';
  columns: JiraBoardColumn[];
  constraintType: string | null;
  activeSprint: JiraSprintSummary | null;
};

export type JiraBoardIssue = {
  id: string;
  key: string;
  summary: string;
  statusId: string | null;
  statusName: string | null;
  assigneeName: string | null;
  assigneeAvatarUrl: string | null;
  issueTypeName: string | null;
  issueTypeIconUrl: string | null;
  priorityName: string | null;
  priorityIconUrl: string | null;
  updatedAt: string | null;
  url: string;
};

export type JiraBoardIssuePage = {
  startAt: number;
  maxResults: number;
  total: number;
  isLast: boolean;
  issues: JiraBoardIssue[];
};

export type JiraIssueDetail = {
  id: string;
  key: string;
  summary: string;
  description: string | null;
  statusName: string | null;
  statusCategoryName: string | null;
  assigneeName: string | null;
  reporterName: string | null;
  issueTypeName: string | null;
  priorityName: string | null;
  projectKey: string | null;
  projectName: string | null;
  parentKey: string | null;
  parentSummary: string | null;
  labels: string[];
  components: string[];
  resolutionName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  dueDate: string | null;
  resolvedAt: string | null;
  url: string;
};

export type JiraIssueTransition = {
  id: string;
  name: string;
  toStatusId: string;
  toStatusName: string;
  toStatusCategoryName: string | null;
  requiredFields: string[];
};

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}
