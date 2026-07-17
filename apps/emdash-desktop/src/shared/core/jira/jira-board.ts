import z from 'zod';

export const MAX_SAVED_JIRA_BOARDS = 10;

export const jiraBoardTypeSchema = z.enum(['scrum', 'kanban']);

export const jiraBoardColumnWidthSchema = z.enum(['compact', 'comfortable', 'wide']);

export const DEFAULT_JIRA_BOARD_COLUMN_WIDTH = 'comfortable' as const;

export type JiraBoardColumnWidth = z.infer<typeof jiraBoardColumnWidthSchema>;

export const jiraBoardSummarySchema = z.object({
  accountId: z.string().min(1),
  id: z.number().int().nonnegative(),
  name: z.string().trim().min(1),
  type: jiraBoardTypeSchema,
  projectKey: z.string().nullable(),
  projectName: z.string().nullable(),
  /** Optional default Emdash project for starting tasks from this board. */
  defaultProjectId: z.string().min(1).nullable().optional(),
  /** Optional display width preset; absent legacy values use the comfortable width. */
  columnWidth: jiraBoardColumnWidthSchema.optional(),
});

export type JiraBoardSummary = z.infer<typeof jiraBoardSummarySchema>;

export const jiraBoardColumnSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  statusIds: z.array(z.string().min(1)),
  min: z.number().nullable(),
  max: z.number().nullable(),
});

export type JiraBoardColumn = z.infer<typeof jiraBoardColumnSchema>;

export const jiraSprintSummarySchema = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1),
  state: z.string().min(1),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  completeDate: z.string().nullable(),
  goal: z.string().nullable(),
});

export type JiraSprintSummary = z.infer<typeof jiraSprintSummarySchema>;

export const jiraBoardConfigurationSchema = z.object({
  accountId: z.string().min(1),
  id: z.number().int().positive(),
  name: z.string().trim().min(1),
  type: jiraBoardTypeSchema,
  columns: z.array(jiraBoardColumnSchema),
  constraintType: z.string().nullable(),
  activeSprint: jiraSprintSummarySchema.nullable(),
});

export type JiraBoardConfiguration = z.infer<typeof jiraBoardConfigurationSchema>;

export const jiraBoardIssueSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  summary: z.string().trim().min(1),
  statusId: z.string().nullable(),
  statusName: z.string().nullable(),
  assigneeName: z.string().nullable(),
  assigneeAvatarUrl: z.string().nullable(),
  issueTypeName: z.string().nullable(),
  issueTypeIconUrl: z.string().nullable(),
  priorityName: z.string().nullable(),
  priorityIconUrl: z.string().nullable(),
  updatedAt: z.string().nullable(),
  url: z.string().url(),
});

export type JiraBoardIssue = z.infer<typeof jiraBoardIssueSchema>;

export const jiraBoardIssuePageSchema = z.object({
  startAt: z.number().int().nonnegative(),
  maxResults: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  isLast: z.boolean(),
  issues: z.array(jiraBoardIssueSchema),
});

export type JiraBoardIssuePage = z.infer<typeof jiraBoardIssuePageSchema>;

export const jiraIssueDetailSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  summary: z.string().trim().min(1),
  description: z.string().nullable(),
  statusName: z.string().nullable(),
  statusCategoryName: z.string().nullable(),
  assigneeName: z.string().nullable(),
  reporterName: z.string().nullable(),
  issueTypeName: z.string().nullable(),
  priorityName: z.string().nullable(),
  projectKey: z.string().nullable(),
  projectName: z.string().nullable(),
  parentKey: z.string().nullable(),
  parentSummary: z.string().nullable(),
  labels: z.array(z.string()),
  components: z.array(z.string()),
  resolutionName: z.string().nullable(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  dueDate: z.string().nullable(),
  resolvedAt: z.string().nullable(),
  url: z.string().url(),
});

export type JiraIssueDetail = z.infer<typeof jiraIssueDetailSchema>;

export const jiraIssueTransitionSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1),
  toStatusId: z.string().min(1),
  toStatusName: z.string().trim().min(1),
  toStatusCategoryName: z.string().nullable(),
  requiredFields: z.array(z.string().min(1)),
});

export type JiraIssueTransition = z.infer<typeof jiraIssueTransitionSchema>;

export type GetJiraBoardConfigurationInput = {
  accountId: string;
  boardId: number;
};

export type ListJiraBoardSprintsInput = GetJiraBoardConfigurationInput;

export type GetJiraIssueDetailInput = {
  accountId: string;
  issueKey: string;
};

export type GetJiraIssueTransitionsInput = GetJiraIssueDetailInput;

export type TransitionJiraIssueInput = GetJiraIssueDetailInput & {
  transitionId: string;
};

export type ListJiraBoardIssuesInput = GetJiraBoardConfigurationInput & {
  sprintId?: number;
  startAt?: number;
  maxResults?: number;
};

export const jiraWorkspaceSettingsSchema = z.object({
  activeAccountId: z.string().min(1).nullable(),
  savedBoards: z
    .array(jiraBoardSummarySchema)
    .max(MAX_SAVED_JIRA_BOARDS)
    .refine(
      (boards) =>
        new Set(boards.map((board) => `${board.accountId}:${board.id}`)).size === boards.length,
      'Saved Jira boards must be unique.'
    ),
});

export type JiraWorkspaceSettings = z.infer<typeof jiraWorkspaceSettingsSchema>;
