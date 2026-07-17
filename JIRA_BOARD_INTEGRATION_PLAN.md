# Jira Board Integration Plan

## Status

Product and implementation plan based on the initial design discussion. This document records the
current decisions and intentionally limits the first AI release to issue-level developer assistance.

### Groundwork Completed: 2026-07-17

The first vertical foundation slice is implemented:

- Added a typed `jira` RPC namespace and main-process Jira board service.
- Added paginated native board discovery through Jira's Agile API.
- Limited discovery to supported Scrum and Kanban boards.
- Added site-scoped Jira connection identities so saved boards cannot cross Jira sites.
- Added validated Jira workspace settings with unique boards and a ten-board cap.
- Persisted saved boards in the existing `app_settings` store without a database migration.
- Added an Add Jira Boards modal with loading, retry, empty, selection, unavailable-board removal,
  and limit states.
- Added a global Jira sidebar group with persistent board rows.
- Added typed Jira view navigation with an optional selected board ID.
- Added Jira titlebar and main workspace connection, loading, error, empty, and selected-board states.
- Added Jira navigation telemetry without issue or board content.
- Added focused tests for Agile API pagination/mapping and saved-board validation.

The next read-only vertical slice is also implemented:

- Added native Jira board configuration and status-to-column mapping.
- Added active sprint discovery for Scrum boards; Kanban boards load directly from their board filter.
- Added paginated board and sprint issue retrieval with defensive Jira response mapping.
- Added account-scoped board configuration and issue RPC operations.
- Replaced the workspace placeholder with horizontally scrollable native columns and issue cards.
- Added loading, retry, refresh, no-active-sprint, empty-column, and unmapped-status states.
- Added focused tests for configuration, sprint and issue mapping, endpoint selection, validation,
  pagination, and renderer column grouping.
- Added active, upcoming, and previous sprint selection with selection persisted in Jira view
  parameters and invalid restored selections falling back to the active sprint.
- Added a read-only issue inspector with an Open in Jira action.
- Added issue key/summary search and status, assignee, type, and priority filters for loaded issues.
- Consolidated the Jira workspace into a two-row header, added relative refresh status, and replaced
  manual issue pagination with automatic 50-issue background chunks.
- Offline Jira views show an explicit reconnect message; board snapshots are intentionally not
  persisted because Jira is not useful without a connection.

Validation completed for this slice:

- Focused Jira lint and formatting checks
- `pnpm run build:renderer`
- Focused Jira plugin and shared-schema tests

The Jira issue-to-Emdash task slice is implemented:

- Added a batched task-domain RPC that matches canonical linked-issue URLs against persisted task
  rows across all projects without requiring mounted renderer stores.
- Added persisted project, archived-task, conversation/active-agent, workspace branch, and cached
  pull-request context to linked-task summaries.
- Added linked-task counts and primary task context to Jira cards.
- Added project-grouped linked tasks to the issue inspector with direct navigation for active tasks;
  archived tasks remain visible.
- Added a focused database test for canonical URL matching, multiple projects, archived tasks,
  agents, branches, and pull requests.
- Allowlisted the isolated `better-sqlite3` install script for its pinned installed version; the
  focused linked-task database test passes.
- Extended saved boards with optional `defaultProjectId` (no migration) and schema tests for legacy
  boards, unknown IDs, uniqueness, the ten-board cap, and preserved order.
- Added a pure `jiraBoardIssueToLinkedIssue` mapper for board snapshots.
- Extended `CreateTaskModal` with `initialIssue` and `strategy: 'from-issue'` prefill without a
  Jira-specific create path.
- Board default project is board-scoped (not per issue). A first pass put a project picker on the
  board filter toolbar; product feedback rejected that clutter — settings belong in a dedicated
  Board Settings surface, not the issue inspector and not permanently in the filter row.
- Added inspector `Start task`, `Open task`, and project-grouped `Choose task` actions. Start task
  uses the board default project; missing/stale defaults point the user at board settings.
- Invalidated `['tasks', 'linked-issue-urls']` after task create/delete/PR update events and after
  archive, restore, and linked-issue mutation paths.

The Board Settings slice is implemented:

- Added a board-scoped settings modal opened from the Jira titlebar and from the issue inspector when
  Start task has no valid default project.
- Moved default Emdash project configuration out of the issue filter row and added explicit missing,
  stale, no-mounted-project, clear, saving, and error states.
- Added legacy-compatible compact, comfortable, and wide column-width preferences on each saved
  board; comfortable preserves the previous width.
- Applied saved column width to every native board column through the optimistic `jiraWorkspace`
  settings cache, so changes appear without reloading the board.
- Added focused schema and renderer utility coverage for legacy settings, invalid width values, stale
  project resolution, and width application.

The read-only issue inspector enrichment slice is implemented:

- Added an account-scoped, lazy Jira issue-detail RPC so opening the inspector fetches one ticket
  without expanding every board page payload.
- Added readable description content, reporter, Jira project, parent, labels, components, created,
  updated, due, resolution, and resolved metadata with loading, retry, and empty states.
- Added a conservative Atlassian Document Format to plain-text mapper that preserves paragraphs,
  lists, line breaks, quotes, code blocks, mentions, emoji text, and card URLs without rendering raw
  Jira HTML.
- Included fetched Jira description content in the existing linked-issue snapshot when starting a
  task, so the coding workflow receives the richer ticket context.
- Added defensive issue-detail/API mapping coverage and widened the inspector for the richer content.

Validation completed for this slice:

- Focused Jira plugin, schema, task-name, and renderer utility tests: 35 passed
- Focused Jira lint and formatting checks
- `pnpm run build:renderer`
- `pnpm run typecheck`

The lightweight ADF-to-Markdown issue viewer is implemented:

- Replaced the conservative ADF-to-plain-text mapper with a typed, dependency-free Markdown
  converter at the Jira plugin boundary.
- Preserved headings, breaks, lists, task lists, blockquotes, text marks, code, links, rules, tables,
  panels, expands, cards, mentions, and emoji.
- Added readable media, attachment, unknown-node, malformed-content, and unsafe-URL fallbacks.
- Kept dollar-prefixed source identifiers literal instead of allowing Markdown math parsing, and
  resolved common Jira emoji shortcodes from both ADF emoji nodes and plain description text.
- Rendered Jira descriptions through the existing sanitized `MarkdownRenderer` with raw HTML
  disabled and compact table/code overflow behavior.
- Kept the converted Markdown in the existing linked-issue task snapshot.
- Added focused fixtures for nested lists, marks, links, code, tables, panels, unsupported content,
  malicious text and URLs, and malformed or empty documents.

Validation completed for this slice:

- Focused Jira ADF and client tests: 15 passed
- Focused plugin and Jira renderer lint and formatting checks
- Plugin build
- `pnpm run build:renderer`
- `pnpm run typecheck`

The confirmed Jira transition suggestion slice is implemented:

- Added account-scoped RPC operations for fetching and executing valid issue transitions.
- Added defensive Jira transition mapping and minimal transition writes using only the confirmed
  transition ID.
- Added one inspector default for the next native board column, with remaining valid transitions in
  an overflow menu and explicit confirmation before every write.
- Starting an Emdash task from a Todo issue offers a confirmed move to the next In Progress status.
- Kept transitions requiring Jira workflow fields visible but disabled with a path to complete them
  in Jira.
- Refreshes issue details, board issues, and available transitions after a successful write without
  optimistic local state changes.
- Added focused plugin, RPC, schema, and inspector tests for mapping, confirmation, refresh,
  permissions, required fields, and failures.

### Implementation Handover: 2026-07-17

Current stopping point:

- Jira connection, native Scrum/Kanban board discovery, saved-board navigation, sprint selection,
  native columns, automatic issue pagination, search, filters, refresh, offline handling, and the
  issue inspector are implemented without fixture data.
- Saved boards and cached discovery queries are scoped to the normalized Jira site host. Unavailable
  saved boards remain removable, and restored navigation waits for settings and connection identity.
- The board fetches linked Emdash tasks for every loaded Jira issue through one batched task RPC. The
  query reads persisted task rows across all projects rather than mounted renderer stores.
- Canonical Jira issue URL is the link identity. Each task still belongs to one Emdash project through
  `tasks.project_id`, while `tasks.linked_issue` stores its Jira snapshot. Reusing the URL on task rows
  supports multiple tasks in one or several projects without a join table.
- Cards show linked-task count, primary project/task, agents, branch, and pull-request presence. The
  inspector lazily loads full ticket description and metadata, then shows every linked task grouped
  by project; active tasks navigate directly and archived tasks remain visible.
- The linked-task RPC is registered under `tasks.getTasksByLinkedIssueUrls`. Its implementation and
  database test are in `src/main/core/tasks/operations/getTasksByLinkedIssueUrls.ts` and
  `getTasksByLinkedIssueUrls.db.test.ts`.
- Boards remember an optional default Emdash project and column width on each saved-board object.
  Both preferences are configured in the dedicated Board Settings modal.
- `Start task` opens the existing Create Task modal with a mapped `LinkedIssue` (`provider: 'jira'`).
  No Jira writes occur. One active linked task offers `Open task`; several active tasks offer a
  project-grouped chooser; archived links never block starting another task.
- Linked-task React Query caches invalidate via `wireLinkedTaskCacheInvalidation` and
  `invalidateLinkedIssueUrlsCache` on create/delete/PR update, archive, restore, and linked-issue
  updates.

Next big step:

- **Drag transitions and ranking with optimistic rollback.** Reuse the confirmed transition path,
  add destination-column transition selection and Jira ranking, and roll back local movement on any
  write failure.

Completed ADF viewer implementation order:

1. [x] Replace the current ADF-to-plain-text mapper with a typed ADF-to-Markdown converter at the Jira
   plugin boundary. Do not pass raw ADF or Jira-rendered HTML into the renderer.
2. [x] Preserve the common Jira description surface: paragraphs, headings, hard breaks, bullet and
   ordered lists, task lists, blockquotes, strong/emphasis/strike/code marks, fenced code blocks with
   language, links, mentions, emoji, rules, tables, panels, expands, and inline/block cards.
3. [x] Render converted descriptions with the existing sanitized `MarkdownRenderer`, matching the
   inspector's typography and horizontal overflow behavior for tables and code.
4. [x] Add readable fallbacks for unsupported media, attachments, and unknown ADF nodes instead of
   dropping surrounding text or rendering unsafe HTML.
5. [x] Keep the converted Markdown in the existing linked-issue snapshot when starting a task so the
   coding workflow receives the same readable description shown in the inspector.
6. [x] Add focused ADF fixtures and tests for nested lists, marks, links, code, tables, panels, unknown
   nodes, malicious URLs/HTML-like text, and empty documents.

ADF viewer acceptance criteria:

- Jira descriptions retain their useful structure and formatting in the inspector.
- Rendering adds no Atlaskit dependency, iframe, Jira page embed, or raw HTML path.
- Malformed or unsupported ADF still produces safe readable output and never crashes the inspector.
- Task-linked Jira context uses the same converted description shown to the user.
- No Jira writes are introduced.

Board settings shipped in this slice:

1. **Default Emdash project** — required for Start task; resolve against mounted projects; show a
   clear stale state when the saved project is missing; never configure this per issue.
2. **Column width** — control how wide each native column is (the current fixed
   `min(20rem, calc(100vw-2rem))` cards/columns). Prefer a small set of presets (`compact` /
   `comfortable` / `wide`) or a numeric width with a sensible min/max; apply to all columns on that
   board.
3. **Optional follow-ons in the same modal if cheap:**
   - Card density (compact vs comfortable vertical spacing / summary line clamp)
   - Whether empty columns stay visible
   - Default open behavior for linked work (prefer Start vs Open when one active task exists)
   - Remember last selected sprint (already partly in view params; may stay navigation-only)

Out of scope for the Board Settings modal:

- Per-issue project overrides
- Jira field/transition configuration
- Swimlanes, quick filters, or full Jira board parity
- Global app Settings page for per-board prefs (modal is enough; keep it board-scoped)

Following steps:

- [x] Confirmed Jira transition suggestions (still no silent transitions)
- Drag transitions and ranking with optimistic rollback
- Do not start Issue Copilot until the coding workflow exit criteria are met

Primary implementation entry points:

- Jira workspace validation: `apps/emdash-desktop/src/shared/core/jira/jira-board.ts`
- Jira workspace schema tests: `apps/emdash-desktop/src/shared/core/jira/jira-board.test.ts`
- Jira board and inspector: `apps/emdash-desktop/src/renderer/features/jira/jira-board.tsx`
- Jira titlebar entry for settings: `apps/emdash-desktop/src/renderer/features/jira/jira-view.tsx`
- Jira ADF conversion: `packages/plugins/src/integrations/impl/jira/adf.ts`
- Existing sanitized Markdown renderer: `apps/emdash-desktop/src/renderer/lib/ui/markdown-renderer.tsx`
- Saved setting update pattern: `apps/emdash-desktop/src/renderer/features/jira/add-jira-boards-modal.tsx`
- Existing project selector: `apps/emdash-desktop/src/renderer/features/tasks/create-task-modal/project-selector.tsx`
- Create Task modal props/state: `apps/emdash-desktop/src/renderer/features/tasks/create-task-modal/`
- Modal registration: `apps/emdash-desktop/src/renderer/app/modal-registry.ts`
- Generic linked issue schema: `apps/emdash-desktop/src/shared/core/linked-issue.ts`
- Persisted linked-task query: `apps/emdash-desktop/src/main/core/tasks/operations/getTasksByLinkedIssueUrls.ts`

Guardrails for the next implementer:

- Board preferences are board-scoped. Do not put default project or column width on the issue
  inspector as editable controls.
- Do not permanently park configuration controls in the filter/search row; open a modal instead.
- Do not create a Jira-specific task creation RPC or bypass `CreateTaskModal` and `TaskManagerStore`.
- Do not require the target project to have a Jira issue integration configured; the board already
  supplies a validated Jira issue snapshot.
- Do not use the mounted-only `use-linked-issue-urls.ts` helper for board-wide linkage. The persisted
  batched RPC is the source of truth for Jira cards and the inspector.
- Do not remove archived linked tasks or treat them as a uniqueness constraint.
- Do not add Jira transitions, comments, field changes, rank changes, or issue creation in the
  Board Settings slice.
- Do not persist Jira board snapshots or issue content beyond the existing task-linked snapshot.

### Completed Major Slice: Jira Issue To Emdash Task

Goal: turn the read-only Jira board into an entry point for existing and new coding work without
adding Jira writes.

Implementation order:

1. [x] Add a main-process query that accepts the canonical URLs of visible Jira issues and returns
   linked task summaries across all Emdash projects. Query persisted task rows rather than relying on
   mounted renderer stores.
2. [x] Show linked task counts and compact task, active-agent, branch, and pull-request context on
   cards and in the issue inspector. Keep the card readable when several projects contain linked tasks.
3. [x] Persist board-to-project mapping as `defaultProjectId` on each saved board (no migration).
   Wiring and Start task consumption are done; final configuration UX is the Board Settings modal.
4. [x] Add `Start task` in the inspector. Reuse existing task creation behavior and attach a canonical
   `LinkedIssue` with provider `jira`, URL, key, summary, status, assignee, and update timestamp.
5. [x] Add `Open task` for one linked task and a project-grouped chooser for multiple linked tasks.
   Archived tasks remain visible but do not prevent creating another task.
6. [x] Invalidate or refresh linked-task summaries after task creation, archival, restoration, or
   linked issue changes.

Acceptance criteria:

- A Jira card and inspector show all linked tasks even when their project stores are not mounted.
- A board can remember its default Emdash project and recover when that project is unavailable.
- Starting a task uses the existing task creation/worktree flow and stores the Jira issue link.
- One linked task opens directly; multiple linked tasks open a chooser grouped by project.
- No action in this slice changes Jira issue fields, status, rank, sprint, or comments.
- Focused tests cover canonical URL matching, multiple projects, archived tasks, mapping validation,
  task creation payloads, and renderer action selection.

### Next Major Slice: Board Settings Modal

Goal: give each saved Jira board a dedicated, board-level settings surface for Emdash preferences
that should not live on tickets or permanently in the filter toolbar.

Implementation order:

1. [x] Add a small `Board settings` modal registered in `modal-registry`, opened from the board
   titlebar/toolbar for the active board only.
2. [x] Move default Emdash project configuration into that modal. Remove the temporary filter-row
   project picker. Keep Start task blocked with a clear CTA when the mapping is missing or stale.
3. [x] Extend the saved-board preference schema with board display prefs starting with column width
   (presets or constrained numeric width). Default to the current column sizing. Schema tests for
   legacy boards without the new fields.
4. [x] Apply column width (and any shipped density prefs) when rendering board columns/cards.
5. [ ] Optional in the same modal if low cost: card density, hide empty columns, linked-work default
   action preference.
6. [x] Focused tests for preference validation, stale project resolution, and column width application.

Acceptance criteria:

- Users configure board project and column width in one board-scoped modal, not per issue.
- The filter row stays focused on search, sprint, and issue filters.
- Changing column width updates the visible board without a reload and persists per board.
- Missing/stale default projects still prevent Start task with a path into Board settings.
- No Jira writes and no issue-content persistence beyond existing linked-task snapshots.

Known verification constraints in this checkout:

- Focused Jira tests pass.
- Desktop typechecking passes after rebuilding the plugin package declarations.
- The desktop Node test project passed once in full; a later parallel run hit a pre-existing
  `issue-selector` timeout, and that test passed immediately when rerun alone.
- The repository-wide test command is not clean in this environment because the Playwright browser
  is not installed. It also reports unrelated existing ACP snapshot/capability failures.
- No live Jira account was used, so Agile API integration is covered by typed client behavior and
  mocked pagination tests rather than an end-to-end Jira smoke test.

## Product Goal

Make Jira a first-class Emdash workspace and turn the path from a Jira issue to an isolated coding
workspace into the product's main advantage over using Jira directly.

Jira remains the team's source of truth for issues, workflow, and comments. Emdash adds repository,
agent, task, branch, diff, pull request, and check context that Jira does not have.

## Agreed Decisions

- Jira is a global sidebar area with saved boards beneath it.
- The first release supports one Jira site, while persisted data remains account-scoped.
- Saved boards are native Jira Software boards, not Emdash-defined JQL boards.
- Scrum and Kanban boards are supported.
- Scrum boards default to the active sprint. Sprint selection lives in the board control row.
- The sidebar lists boards only, not nested sprints.
- Clicking an issue opens a right-side inspector that can expand into a full issue view.
- One Jira issue can link to multiple Emdash tasks across multiple projects.
- Board-to-project mappings are board-scoped (default Emdash project per saved board), configured in
  Board Settings, not on individual issues.
- Jira transitions are suggested or explicitly initiated, never silently inferred.
- Offline Jira views show a clear disconnected state. Jira writes are not queued.
- The first milestone is the coding workflow slice, not a complete Jira replacement.
- The initial AI user is the developer implementing a ticket.
- Initial AI execution requires an ACP-capable provider.
- AI Jira changes are reviewable drafts and require explicit confirmation.
- Board-wide AI analysis is out of the initial scope.
- Completion or acceptance checking is out of the initial scope.

## Product Experience

### Sidebar

The Jira section is a peer of Projects rather than a footer utility.

```text
Jira                                      +
  Platform Board
  Web Application
  Infrastructure

Projects                                  +
  emdash
    jira-board-poc
  drop2

Search
Automations
Library
Settings
```

The Jira group supports adding, removing, reordering, and refreshing up to ten saved boards. Board
names and types are persisted so the sidebar remains stable between app sessions.

### Board View

The board titlebar / control row contains:

- Board breadcrumb and connection state
- Active, future, or previous sprint selector for Scrum boards
- Search and common filters
- Refresh and data freshness state
- Board settings action (opens a dedicated modal — not inline filter controls)
- Create issue action (later)
- Open in Jira

Board Settings is board-scoped and covers Emdash preferences such as default project and column
width. It is not a per-issue control and should not clutter the filter row.

The board body uses horizontally scrollable native Jira columns. Cards show Jira fields and local
Emdash development state together:

- Issue key, summary, type, priority, assignee, and selected labels
- Linked Emdash task count
- Primary task and agent state
- Branch and pull request state where available
- `Start coding`, `Open task`, or `Choose task` action

### Issue Inspector

The inspector preserves board context and contains:

- Jira details and editable daily-work fields
- Comments and activity
- Emdash tasks linked to the issue
- Project mapping and start-coding action
- Issue Copilot
- Open in Jira and expand-to-full-page actions

## Initial AI Feature Set

The initial AI work is one coherent Issue Copilot experience with four capabilities. These are not
four unrelated buttons and do not add AI across the entire board.

### 1. Code-Aware Technical Context

Issue Copilot inspects the selected mapped repository and adds evidence-backed technical hints:

- Likely packages, services, files, and ownership boundaries
- Existing implementations or patterns that appear relevant
- Known configuration, migration, API, security, or compatibility constraints
- Tests and validation commands likely to matter
- Links to cited repository paths

The output must distinguish observed repository facts from AI suggestions. Every repository claim
should cite a path, symbol, or command result when possible.

### 2. Repository Q&A

The issue inspector provides quick questions and a focused follow-up input. Examples include:

- Where is this behavior implemented?
- Does the repository already have a similar feature?
- Which projects or packages are affected?
- What tests cover this area?
- Is a database migration or API change likely?
- What information is missing before implementation can start?

Follow-up answers reuse the issue's dedicated ACP analysis session so the user does not repeatedly
pay for repository discovery. This is a scoped issue assistant, not a global chatbot.

### 3. Implementation Brief

Before creating an Emdash task, Issue Copilot can produce a reviewable implementation brief:

- Restated scope and explicit non-goals
- Missing requirements and questions
- Likely implementation areas
- Ordered implementation steps
- Risks and edge cases
- Test strategy
- Recommended Emdash project when project mapping is ambiguous
- Curated starter prompt for the coding agent

The user can edit the brief and choose which sections become hidden issue context or the visible
starter prompt. Creating the brief does not create a task or modify Jira.

### 4. Reviewable Jira Enrichment

Issue Copilot can turn its findings into a structured ticket patch containing separate selectable
sections:

- Description clarification
- Acceptance criteria additions
- Technical hints
- Open questions
- Draft Jira comment

The UI shows the exact before/after change. The user selects the sections to apply and confirms the
write. AI never changes Jira fields or posts comments automatically.

## Explicit AI Non-Goals

- No board-wide sprint scoring, health summary, or risk radar in the initial release.
- No automatic assignment, prioritization, ranking, or status transitions.
- No automatic Jira comments.
- No scraping or parsing Claude Code, Codex, OpenCode, or other TUI terminal output.
- No acceptance check or completion review in the Jira inspector.
- No separate Emdash-hosted cloud model in the initial release.

A future Acceptance Check would belong in the Emdash task or pull request workflow because that is
where Emdash has the diff, tests, checks, and coding conversation. Jira would receive only an
optional, user-approved summary.

## Core Workflows

### Add A Board

1. The user clicks `+` beside Jira.
2. Emdash opens Jira setup if no connection exists.
3. Emdash fetches available native Jira Software boards.
4. The user selects one or more boards.
5. The user configures an optional default Emdash project and mapping rules.
6. Emdash saves board metadata and loads the current board state.

### Open A Board

1. Emdash loads the selected board from Jira.
2. Scrum boards select the active sprint by default.
3. Kanban boards use the native board filter.
4. Only the active board is periodically refreshed.

### Move An Issue

1. The user drags an issue to a destination column or position.
2. Emdash fetches or uses cached valid transitions for that issue.
3. Emdash maps destination-column statuses to available transitions.
4. Emdash asks the user to choose when multiple transitions are valid.
5. Emdash applies an optimistic card move.
6. Emdash executes the Jira transition and rank operation.
7. Emdash rolls back and explains the error if either operation fails.

A Jira board column can contain multiple statuses. Dragging must use Jira's available transitions
instead of assigning a status name directly.

### Start Coding Without AI

1. The user selects `Start coding` on an issue.
2. Emdash checks for existing linked tasks.
3. Project mapping rules resolve the target project when possible.
4. Emdash shows a project chooser when the mapping is ambiguous.
5. Emdash previews the Jira context that will be sent to the agent.
6. Emdash creates the task with the existing linked-issue mechanism.
7. Emdash offers a confirmed Jira transition such as `Move to In Progress`.
8. Emdash navigates to the new task.

### Start Coding With Issue Copilot

1. The user opens Issue Copilot and selects the mapped repository and ACP provider/model.
2. Emdash creates or resumes a dedicated analysis session.
3. The agent inspects the repository and returns structured, cited findings.
4. The user asks follow-up questions or generates an implementation brief.
5. The user edits and approves the starter prompt and included context.
6. Emdash creates the task and links the Jira issue.
7. The coding agent starts in the new task workspace with the approved context.

### Open Existing Work

- One linked task opens directly.
- Multiple linked tasks open a chooser grouped by Emdash project.
- The running or most recently active task is shown as the primary action.
- Archived tasks remain visible but do not prevent creating another linked task.

## AI Runtime Design

### Why ACP

Emdash supports multiple coding agents that otherwise operate as isolated TUIs. The Jira
integration must not infer state from terminal output or automate a terminal parser. ACP provides:

- Structured prompts and transcript updates
- Provider and model selection
- Cancellation
- Session state
- Hidden context
- Attachments where supported
- A consistent integration for Claude, Codex, OpenCode, and other ACP-capable providers

Providers without ACP are not available for the first Issue Copilot release.

### Analysis Workspace

Issue Copilot needs repository access before an Emdash coding task necessarily exists.

- Prefer a provider-supported read-only or plan mode.
- Use a disposable analysis workspace when reliable read-only mode is unavailable.
- Never allow analysis changes to modify the user's primary checkout.
- Reuse an existing linked task workspace only after the user explicitly selects it.
- Clean up disposable workspaces when the run is deleted or expires.
- Keep auto-approval disabled for initial analysis runs.

The analysis workspace must reuse Emdash workspace, local/SSH, path-safety, spawn, and environment
handling rather than introducing a second process execution path.

### Structured Result

Define a versioned, validated `IssueCopilotResult` containing:

- Repository citations
- Technical context
- Missing information and suggested questions
- Likely affected areas
- Risks and edge cases
- Test strategy
- Implementation steps
- Suggested Jira patch sections
- Suggested task prompt

Ask the ACP agent for schema-conforming output and validate it with Zod. Allow one repair attempt
for invalid output. Preserve a readable raw response as a fallback rather than silently discarding a
run.

### Prompt Safety

Jira descriptions and comments are untrusted content and may contain instructions intended to
manipulate an agent.

- Put Jira and repository content in clearly delimited hidden context.
- State that issue text is data, not system instruction.
- Do not interpolate Jira content into shell commands.
- Do not expose Jira or provider credentials to the renderer or prompt.
- Require confirmation for all Jira writes and Emdash task creation.
- Exclude issue text, prompts, comments, diffs, and responses from telemetry.

## Technical Architecture

### Existing Foundations

- Jira auth: `packages/plugins/src/integrations/impl/jira/`
- Jira list/search: `packages/plugins/src/issues/impl/jira/`
- Issue RPC: `apps/emdash-desktop/src/main/core/issues/controller.ts`
- Linked issue schema: `apps/emdash-desktop/src/shared/core/linked-issue.ts`
- Task creation from issues: `apps/emdash-desktop/src/renderer/features/tasks/create-task-modal/`
- ACP runtime: `packages/core/src/acp/`
- Automation task launch example:
  `apps/emdash-desktop/src/main/core/automations/actions/taskCreate.ts`
- View registry: `apps/emdash-desktop/src/renderer/app/view-registry.ts`
- Sidebar: `apps/emdash-desktop/src/renderer/features/sidebar/left-sidebar.tsx`

### Proposed Boundaries

| Layer | Responsibility |
| --- | --- |
| `packages/plugins` | Jira Cloud REST and Agile API calls and mapping |
| `apps/emdash-desktop/src/shared/core/jira` | Versioned Jira DTOs and validation |
| `apps/emdash-desktop/src/main/core/jira` | Board orchestration, RPC, errors, and writes |
| `apps/emdash-desktop/src/main/core/jira-ai` | ACP analysis-run lifecycle and result validation |
| `apps/emdash-desktop/src/renderer/features/jira` | Sidebar group, board, inspector, editor, and Copilot |
| Existing task domain | Task creation, navigation, workspace, agent, branch, and PR behavior |

Jira board behavior should not be forced into the generic issue list/search capability. Add a
Jira-specific board capability or domain while continuing to reuse the generic linked-issue shape
at the task boundary.

### Jira Operations

The Jira domain is expected to support typed operations for:

- Discovering available boards
- Saving, removing, and reordering boards
- Fetching board configuration and column mappings
- Listing active, future, and closed sprints
- Listing board or sprint issues with pagination
- Fetching full issue details, comments, and editable fields
- Fetching and executing valid transitions
- Ranking issues
- Creating and updating issues
- Adding comments
- Applying selected AI-generated ticket patches

### Renderer State

- Use React Query for server state, request caching, mutations, and optimistic updates.
- Roll back optimistic Jira writes on failure.
- Keep inspector selection and current sprint in typed Jira view parameters.
- Persist sidebar order and board mappings in the main process.
- Keep transient drag and inspector UI state local to the Jira feature.
- Do not introduce a second navigation or global state system.

## Persistence

The first saved-board preference is stored as a validated `jiraWorkspace` app setting. This avoids a
migration for a small, single-user ordered preference list. Use generated Drizzle migrations and
versioned JSON schemas when project mappings and AI runs introduce domain data that needs independent
lifecycle or querying.

| Entity | Purpose |
| --- | --- |
| Jira workspace app setting | Account, remote board ID, display metadata, type, sidebar order, and per-board prefs (`defaultProjectId`, column width, density, …) |
| Board Settings modal | Board-scoped UI for those prefs; not a separate DB entity yet |
| Board project mappings (later) | Ordered component/label mapping rules if defaults alone are insufficient |
| Issue Copilot runs | Issue, project, repository revision, provider/model, result, and timestamps |
| Existing `tasks.linked_issue` | Jira issue snapshot attached to each Emdash task |

The current task model already supports one Jira issue linking to multiple tasks because multiple
task rows can contain the same canonical Jira URL. Add a main-process query that returns linked task
summaries for all visible issue URLs. Do not require every related project store to be mounted.

An Issue Copilot result becomes stale when either the Jira issue update timestamp or analyzed
repository revision changes. Stale results remain readable but must be clearly marked before reuse.

## Delivery Phases

### Phase 0: Jira API And UX Spike

- Validate Jira Cloud Agile APIs with one Scrum and one Kanban board.
- Verify company-managed and team-managed board behavior.
- Validate board configuration, transitions, ranking, permissions, and pagination.
- Decide how Atlassian Document Format is rendered and edited without losing content.
- Build fixture-backed board and inspector prototypes.

Exit criteria:

- Native columns and active sprint render correctly for both board types.
- A valid transition and rank change can be demonstrated safely.
- Known unsupported Jira configurations are documented.

### Phase 1: Readable Native Board

- [x] Add the Jira top-level view and global sidebar group.
- [x] Add native board discovery and save/remove selection flows.
- [ ] Add explicit drag or menu-based sidebar reordering.
- [x] Render Scrum active sprints and Kanban boards.
- [x] Add active, future, and previous Scrum sprint selection.
- Add pagination, refresh, loading, errors, and an explicit offline state.
- [x] Add the read-only issue inspector and Open in Jira action.

Exit criteria:

- Up to ten boards can be saved and navigated.
- Offline Jira views show an obvious disconnected state.
- Only the active board is periodically refreshed.

### Phase 2: Coding Workflow Slice

- [x] Load task links for visible Jira issues.
- [x] Show task, agent, branch, and PR badges on cards and in the inspector.
- [x] Persist board default Emdash project and wire Start task to it.
- [x] Board Settings modal: default project and column width.
- [x] Start a task from an issue using existing task creation behavior.
- [x] Open one or several existing linked tasks through explicit primary actions.
- [x] Add confirmed Jira transition suggestions.
- [ ] Add drag transitions and ranking with optimistic rollback.

Exit criteria:

- A developer can move from an issue to a linked coding workspace and back.
- One issue can reliably expose tasks from multiple Emdash projects.
- Invalid or failed transitions do not leave the local board inconsistent.

### Phase 3: Issue Copilot Foundation

- Add the ACP-only Issue Copilot provider/model selector.
- Add disposable or read-only analysis workspace lifecycle.
- Add structured result schema, parser, validation, repair, and fallback.
- Add run cancellation, error handling, stale detection, and local persistence.
- Add prompt-injection boundaries and telemetry exclusions.

Exit criteria:

- Claude, Codex, and OpenCode ACP runs can analyze a mapped repository.
- Analysis cannot modify the primary checkout.
- Results cite repository evidence and survive view navigation.

### Phase 4: Initial AI Features

- Add code-aware technical context.
- Add repository quick questions and follow-up Q&A.
- Add implementation brief generation and editing.
- Feed selected brief sections into task context and the starter prompt.
- Add reviewable Jira enrichment patches.
- Require explicit confirmation for every Jira write and task creation.

Exit criteria:

- A developer can improve an issue, answer repository questions, produce a brief, and launch a task
  without leaving Emdash.
- The user can inspect exactly which AI text is sent to Jira or a coding agent.
- No AI operation silently changes Jira, project files, or task state.

### Phase 5: Daily Jira Editing

- Create issues.
- Edit summary, description, type, status, assignee, priority, labels, and sprint.
- Read and add comments.
- Add full issue page, search, and common filters.
- Improve conflict detection for stale Jira edits.

## Testing Strategy

### Plugin And Main Process

- Jira board, sprint, issue, transition, rank, edit, and comment mapping tests
- Pagination and rate-limit tests
- Permission and unavailable-transition tests
- Offline-state tests
- Generated migration and persistence tests
- Issue-to-task lookup tests across multiple projects
- AI result schema, repair, stale detection, and prompt-safety tests
- Analysis workspace cleanup and cancellation tests

### Renderer

- Saved-board navigation and ordering tests
- Scrum sprint and Kanban board rendering tests
- Drag transition success, chooser, rollback, and forbidden-state tests
- Inspector and linked-task chooser tests
- Project mapping and task creation tests
- Issue Copilot loading, cancellation, citation, stale, and error-state tests
- Jira patch selection, diff preview, confirmation, and rollback tests

### End-To-End Fixtures

- Company-managed Scrum board
- Team-managed Scrum board
- Kanban board
- Column with multiple statuses
- Issue with no valid transition to the target column
- Issue linked to tasks in two Emdash projects
- Offline Jira workspace
- Jira issue containing prompt-injection text
- ACP provider returning invalid structured output

## Risks And Mitigations

### Jira Board Fidelity

Native Jira boards include column mappings, filters, swimlanes, quick filters, ranking, and differing
project types. Start with native columns, active sprint, board filter, transitions, and rank. Do not
promise complete Jira visual parity in the first milestone.

### Atlassian Document Format

Jira v3 descriptions and comments use Atlassian Document Format. Preserve the original document and
use explicit conversion for display, prompts, and edits. Do not round-trip through flattened plain
text when updating existing rich content.

### AI Provider Variance

ACP providers differ in models, tools, modes, and output behavior. Validate output independently of
provider, show provider-specific capability limits, and retain a readable fallback response.

### Repository Safety

An analysis agent may try to edit files even when asked not to. Use provider read-only modes where
reliable and disposable workspaces otherwise. Never rely only on prompt instructions for isolation.

### Cost And Latency

Repository analysis is more expensive than text rewriting. Run it on demand, reuse the issue
session, cache results by issue and repository revision, support cancellation, and show progress.

### Sensitive Data

Jira comments and repositories can contain sensitive information. Send only user-selected issue
context where practical, retain data locally, avoid content telemetry, and clearly show the chosen
provider before an analysis run.

### Local Desktop Synchronization

Incoming Jira webhooks are not a dependable desktop architecture. Refresh on board open, window
focus, explicit refresh, and a restrained interval for the active board only.

## Future Ideas

These are deliberately deferred until the board, task bridge, and Issue Copilot are proven:

- Acceptance Check inside the Emdash task or PR workflow
- User-approved Jira progress summaries generated from diffs, tests, and checks
- Code-aware ticket creation from a rough bug or feature description
- Ticket decomposition into multiple project-specific Emdash tasks
- Board-wide sprint risk or dependency analysis
- Backlog and sprint planning
- Per-board automation rules
- Multiple Jira accounts and sites
- Custom JQL views

## Success Measures

- Time from opening a Jira issue to starting a correctly linked Emdash task
- Percentage of Jira-started tasks with approved implementation context
- Reuse rate of Issue Copilot findings and briefs
- Number of repository questions answered without leaving Emdash
- Percentage of AI Jira patches accepted, edited, or rejected
- Jira transition and task-link error rates
- Board load latency from Jira

Avoid measuring success by raw AI invocation count. The intended outcome is less context switching,
better task starts, and fewer implementation surprises.
