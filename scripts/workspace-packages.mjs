import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const entry = (
  packagePath,
  name,
  kind,
  contract,
  migrationGoals,
  summary,
  notResponsibleFor,
  legacySources = [],
  status = {},
) => ({
  path: packagePath,
  name,
  kind,
  contract,
  migrationGoals: ["goal-reorg-f2", ...migrationGoals],
  summary,
  notResponsibleFor,
  legacySources,
  maturity: status.maturity ?? "contract-only",
  capabilities: status.capabilities ?? [],
  extraWorkspaceDependencies: status.extraWorkspaceDependencies ?? [],
  extraDependencies: status.extraDependencies ?? {},
});

export const WORKSPACE_PACKAGES = [
  entry("apps/desktop", "@molis-ai/molis-work-app-desktop", "app", "@molis-ai/molis-work-contracts/platform/app-host", ["goal-reorg-ap4", "goal-reorg-dv4"], "Molis Work macOS product shell and native bridge composition root.", "Business facts, Module rules, or Runtime state.", ["desktop/", "src/desktop/"], { maturity: "partial", capabilities: ["desktop.shell.v1", "desktop.runtime-launch.v1", "desktop.advance-prompt.v1", "desktop.panels.v1", "desktop.capsule-shell.v1"], extraWorkspaceDependencies: ["@molis-ai/molis-work-service-runtime-host", "@molis-ai/molis-work-storage", "@molis-ai/molis-work-plugin-feed", "@molis-ai/molis-work-app-local-host", "@molis-ai/molis-work-design-system"] }),
  entry("apps/workbench", "@molis-ai/molis-work-app-workbench", "app", "@molis-ai/molis-work-contracts/platform/app-host", ["goal-reorg-fd4", "goal-reorg-ap3", "goal-reorg-gw4", "goal-reorg-gw5", "goal-reorg-ex4"], "Local product UI composition root for the Workbench.", "Business Stores, Node-only implementations, or Tauri commands.", ["src/web/"], { maturity: "partial", capabilities: ["workbench.shell.v1", "workbench.ui-slots.v1", "workbench.feed-composition.v1", "workbench.goals-command-adapter.v1", "workbench.work-composition.v1", "workbench.goals-policy-composition.v1", "workbench.goals-safety-composition.v1", "workbench.goals-relation-composition.v1", "workbench.goals-tree-composition.v1", "workbench.goals-momentum-composition.v1", "workbench.goals-document-composition.v1", "workbench.goals-context-composition.v1", "workbench.goals-planning-composition.v1", "workbench.goals-status-composition.v1", "workbench.goals-factors-composition.v1", "workbench.goals-dialogs-composition.v1", "workbench.goals-document-routes.v1"], extraWorkspaceDependencies: ["@molis-ai/molis-work-plugin-artifacts", "@molis-ai/molis-work-plugin-characters", "@molis-ai/molis-work-plugin-coding", "@molis-ai/molis-work-plugin-goals", "@molis-ai/molis-work-plugin-feed", "@molis-ai/molis-work-plugin-functions", "@molis-ai/molis-work-plugin-experiments", "@molis-ai/molis-work-plugin-images", "@molis-ai/molis-work-plugin-jelly", "@molis-ai/molis-work-plugin-form", "@molis-ai/molis-work-plugin-pages", "@molis-ai/molis-work-plugin-lingguang", "@molis-ai/molis-work-plugin-dataset", "@molis-ai/molis-work-plugin-ppt", "@molis-ai/molis-work-plugin-inbox", "@molis-ai/molis-work-plugin-schedule", "@molis-ai/molis-work-plugin-shelf", "@molis-ai/molis-work-plugin-work", "@molis-ai/molis-work-plugin-workspace", "@molis-ai/molis-work-plugin-files", "@molis-ai/molis-work-plugin-git", "@molis-ai/molis-work-plugin-diff", "@molis-ai/molis-work-plugin-text-stats", "@molis-ai/molis-work-ui-host", "@molis-ai/molis-work-design-system", "@molis-ai/molis-work-integration-rss", "@molis-ai/molis-work-integration-gmail"] }),
  entry("apps/local-host", "@molis-ai/molis-work-app-local-host", "app", "@molis-ai/molis-work-contracts/platform/app-host", ["goal-reorg-ap2"], "The single local composition root for Modules, services, plugins, and storage.", "A second business coordinator or user-facing product shell.", ["apps/desktop/launchers/web/server.ts", "src/cli/", "src/mcp/"], { maturity: "partial", extraDependencies: { "ws": "^8.21.3", "@adeptify/search-evidence-layer": "file:../../vendor/search-evidence-layer/adeptify-search-evidence-layer-0.4.1.tgz", "@adeptify/intelligence-client": "file:../../vendor/intelligence-client/adeptify-intelligence-client-0.2.2.tgz" }, capabilities: ["local-host.client.v1", "local-host.single-writer.v1"], extraWorkspaceDependencies: ["@molis-ai/molis-work-app-cli", "@molis-ai/molis-work-app-mcp", "@molis-ai/molis-work-app-workbench", "@molis-ai/molis-work-design-system", "@molis-ai/molis-work-integration-catalog", "@molis-ai/molis-work-integration-github", "@molis-ai/molis-work-integration-gmail", "@molis-ai/molis-work-integration-rss", "@molis-ai/molis-work-integration-youtube", "@molis-ai/molis-work-kernel", "@molis-ai/molis-work-module-artifacts", "@molis-ai/molis-work-module-attention-resumption", "@molis-ai/molis-work-module-characters", "@molis-ai/molis-work-module-context-ledger", "@molis-ai/molis-work-module-evidence-verification", "@molis-ai/molis-work-module-execution", "@molis-ai/molis-work-module-feed", "@molis-ai/molis-work-module-functions", "@molis-ai/molis-work-module-goals", "@molis-ai/molis-work-module-governance-collaboration", "@molis-ai/molis-work-module-private-work-context", "@molis-ai/molis-work-module-projects", "@molis-ai/molis-work-module-shelf", "@molis-ai/molis-work-module-signals", "@molis-ai/molis-work-module-sources", "@molis-ai/molis-work-plugin-artifacts", "@molis-ai/molis-work-plugin-characters", "@molis-ai/molis-work-plugin-coding", "@molis-ai/molis-work-plugin-diff", "@molis-ai/molis-work-plugin-feed", "@molis-ai/molis-work-plugin-files", "@molis-ai/molis-work-plugin-functions", "@molis-ai/molis-work-plugin-experiments", "@molis-ai/molis-work-plugin-images", "@molis-ai/molis-work-plugin-jelly", "@molis-ai/molis-work-plugin-form", "@molis-ai/molis-work-plugin-pages", "@molis-ai/molis-work-plugin-lingguang", "@molis-ai/molis-work-plugin-dataset", "@molis-ai/molis-work-plugin-ppt", "@molis-ai/molis-work-plugin-git", "@molis-ai/molis-work-plugin-goals", "@molis-ai/molis-work-plugin-inbox", "@molis-ai/molis-work-plugin-runtime", "@molis-ai/molis-work-plugin-schedule", "@molis-ai/molis-work-plugin-shelf", "@molis-ai/molis-work-plugin-text-stats", "@molis-ai/molis-work-plugin-work", "@molis-ai/molis-work-plugin-workspace", "@molis-ai/molis-work-service-agent-host", "@molis-ai/molis-work-service-connector-host", "@molis-ai/molis-work-service-listener-host", "@molis-ai/molis-work-service-runtime-host", "@molis-ai/molis-work-service-scheduler", "@molis-ai/molis-work-storage", "@molis-ai/molis-work-ui-host"] }),  entry("apps/cli", "@molis-ai/molis-work-app-cli", "app", "@molis-ai/molis-work-contracts/platform/app-host", ["goal-reorg-dv1", "goal-reorg-gw4", "goal-reorg-ex4"], "Thin CLI protocol, argument, and presentation adapter.", "Business decisions, Module Stores, or duplicated application rules.", ["src/cli/"], { maturity: "partial", capabilities: ["cli.goals-command-adapter.v1"], extraWorkspaceDependencies: ["@molis-ai/molis-work-plugin-goals"] }),  entry("apps/mcp", "@molis-ai/molis-work-app-mcp", "app", "@molis-ai/molis-work-contracts/platform/app-host", ["goal-reorg-dv1", "goal-reorg-dv2", "goal-reorg-gw4", "goal-reorg-ex4"], "Thin MCP schema, audience, and capability adapter.", "Business rules, direct Store access, or Runtime Skill policy.", ["src/mcp/"], { maturity: "partial", capabilities: ["mcp.goals-command-adapter.v1"], extraWorkspaceDependencies: ["@molis-ai/molis-work-plugin-goals"] }),
  entry("packages/contracts", "@molis-ai/molis-work-contracts", "foundation", "@molis-ai/molis-work-contracts/platform/package", ["goal-reorg-f3"], "Publishable Module, service, and platform Contract subpaths.", "Business implementations, database access, network clients, Apps, or Plugin implementations.", ["src/v1/types.ts", "src/feed/types.ts", "src/sessions/types.ts"]),
  entry("packages/kernel", "@molis-ai/molis-work-kernel", "foundation", "@molis-ai/molis-work-contracts/platform/kernel", ["goal-reorg-f3", "goal-reorg-ap2"], "Capability registration, selection, grants, and lifecycle skeleton.", "Business state machines, Provider implementations, or application UI.", [], { maturity: "partial", capabilities: ["kernel.capability-registry.v1"] }),
  entry("packages/plugin-runtime", "@molis-ai/molis-work-plugin-runtime", "foundation", "@molis-ai/molis-work-contracts/platform/plugin", ["goal-reorg-fd3", "goal-reorg-dv3"], "Plugin identity, install, grants, isolation, lifecycle, and rollback boundary.", "Module business facts or provider-specific protocols.", ["src/install/"], { maturity: "partial", capabilities: ["plugin.lifecycle.v1", "plugin.grants.v1", "plugin.recovery.v1"] }),
  entry("packages/plugin-sdk", "@molis-ai/molis-work-plugin-sdk", "foundation", "@molis-ai/molis-work-contracts/platform/plugin", ["goal-reorg-fd3", "goal-reorg-dv3"], "Stable author-facing Plugin APIs, UI extension types, and testing entrypoints.", "Internal Host implementations or an automatically published marketplace.", [], { maturity: "partial", capabilities: ["plugin.define.v1", "integration.polling.v1"] }),
  entry("packages/storage", "@molis-ai/molis-work-storage", "foundation", "@molis-ai/molis-work-contracts/platform/storage", ["goal-reorg-ap2"], "SQLite, filesystem, Blob, transaction, migration, and backup technical ports.", "The business meaning of Module schemas or cross-Module queries.", ["src/v1/store.ts", "src/feed/store.ts"], { maturity: "partial", extraDependencies: { "@adeptify/search-evidence-layer": "file:../../vendor/search-evidence-layer/adeptify-search-evidence-layer-0.4.1.tgz", "better-sqlite3": "12.8.0" } }),
  entry("packages/ui-host", "@molis-ai/molis-work-ui-host", "foundation", "@molis-ai/molis-work-contracts/platform/ui", ["goal-reorg-fd4", "goal-reorg-ap3"], "UI Contribution, Slot, Embed, isolation, and Host bridge boundary.", "Native Plugin product behavior or Module business facts.", ["src/web/render.ts"], { maturity: "partial", capabilities: ["ui.contribution.registry.v1", "ui.surface.render.v1", "ui.slot.mount.v1"] }),
  entry("packages/design-system", "@molis-ai/molis-work-design-system", "foundation", "@molis-ai/molis-work-contracts/platform/ui", ["goal-reorg-ap3"], "Tokens, primitives, icons, themes, and accessibility foundations.", "Product-page business decisions or Plugin state.", ["src/web/visual-foundation.ts", "DESIGN.md"], { maturity: "partial", extraDependencies: { "lucide": "^1.31.0" }, capabilities: ["design-system.theme.v1", "design-system.tokens.v1", "design-system.accessibility.v1"] }),
  entry("packages/test-kit", "@molis-ai/molis-work-test-kit", "foundation", "@molis-ai/molis-work-contracts/platform/testing", ["goal-reorg-f3"], "Deterministic clocks, fake capabilities, temporary storage, and Contract harnesses.", "Shared business fixtures, rules, or assertions owned by a Module.", [], { maturity: "partial", capabilities: ["workspace-boundary-policy"] }),

  entry("modules/projects", "@molis-ai/molis-work-module-projects", "module", "@molis-ai/molis-work-contracts/modules/projects", ["goal-reorg-ap1"], "Project identity, Catalog, membership, lifecycle, and board_id migration facts.", "Sessions, Desktop panels, Goals, Artifacts, or Runtime process state.", ["src/projects/catalog.ts"], { maturity: "partial", capabilities: ["project-identity", "project-catalog", "workspace-membership", "project-deletion-receipts"] }),
entry("modules/context-ledger", "@molis-ai/molis-work-module-context-ledger", "module", "@molis-ai/molis-work-contracts/modules/context-ledger", ["goal-reorg-ar2"], "Object references, cross-owner relationships, publication, and materialization records.", "The referenced Goal, Artifact, Feed, or Session content.", ["src/v1/coordinator.ts", "src/feed/", "src/sessions/"], { maturity: "partial", capabilities: ["context.edges.v1"] }),
  entry("modules/sources", "@molis-ai/molis-work-module-sources", "module", "@molis-ai/molis-work-contracts/modules/sources", ["goal-reorg-fd1"], "Source identity, desired listening state, scope, schedule intent, and provider binding references.", "Secrets, listener cursors, Signals, Feed disposition, or Goals.", ["src/feed/sources/", "src/feed/store.ts"], { maturity: "partial", capabilities: ["sources.query.v1", "sources.command.v1"] }),
  entry("modules/signals", "@molis-ai/molis-work-module-signals", "module", "@molis-ai/molis-work-contracts/modules/signals", ["goal-reorg-fd1"], "Normalized external-event facts, deduplication identity, revisions, and provenance.", "Provider connections, listener leases, Feed decisions, Attention, Goals, or Automation.", ["src/feed/"], { maturity: "partial", capabilities: ["signals.query.v1", "signals.command.v1"] }),
  entry("modules/feed", "@molis-ai/molis-work-module-feed", "module", "@molis-ai/molis-work-contracts/modules/feed", ["goal-reorg-fd2"], "Feed Item visibility, read/archive state, disposition, and promotion provenance.", "Provider listening, Signal ownership, or direct Goal/Artifact/Action creation.", ["src/feed/store.ts"], { maturity: "partial", extraWorkspaceDependencies: ["@molis-ai/molis-work-storage"], capabilities: ["feed.query.v1", "feed.command.v1"] }),
  entry("modules/attention-resumption", "@molis-ai/molis-work-module-attention-resumption", "module", "@molis-ai/molis-work-contracts/modules/attention-resumption", ["goal-reorg-fd2"], "Attention items, reasons, snooze state, and resume cues.", "Feed Items, Actions, Goals, Sessions, notifications, or Runtime processes.", ["src/feed/store.ts"], { maturity: "partial", capabilities: ["attention.query.v1", "attention.command.v1"] }),
  entry("modules/goals", "@molis-ai/molis-work-module-goals", "module", "@molis-ai/molis-work-contracts/modules/goals", ["goal-f826dfb8-bf63-4e98-b6b7-57f6b4b7c3b8", "goal-reorg-gw1", "goal-reorg-gw2", "goal-reorg-gw3", "goal-reorg-gw4"], "Goal Contract, graph, policy, risk, lifecycle, guidance, and planning facts.", "Claims/Runs, Evidence, Reviews/Decisions, or cross-Module provenance.", ["src/v1/", "src/planning/"], { maturity: "partial", capabilities: ["goals.command.v1", "goals.repository.v1", "goals.lifecycle.v1", "goals.planning.v1", "goals.query.v1"], extraDependencies: { "better-sqlite3": "12.8.0" } }),
  entry("modules/private-work-context", "@molis-ai/molis-work-module-private-work-context", "module", "@molis-ai/molis-work-contracts/modules/private-work-context", ["goal-reorg-wk1"], "Private Session, content reference, workspace association, resume, and handoff facts.", "Execution Runs, Goals, Artifacts, or Runtime process handles.", ["src/sessions/", "src/projects/catalog.ts"], { maturity: "partial", capabilities: ["private-session-registry", "encrypted-content-store", "session-events", "session-handoff-facts", "legacy-session-migration", "runtime-context-bindings"], extraDependencies: { "better-sqlite3": "12.8.0" } }),
  entry("modules/execution", "@molis-ai/molis-work-module-execution", "module", "@molis-ai/molis-work-contracts/modules/execution", ["goal-reorg-ex1", "goal-reorg-ex4"], "Claim, Run, attempt, lease, and execution lifecycle facts.", "Goal Contracts, Evidence, Reviews, Sessions, or Runtime processes.", ["src/v1/coordinator.ts", "src/v1/store.ts"], { maturity: "partial", capabilities: ["execution.query.v1", "execution.repository.v1"] }),
  entry("modules/artifacts", "@molis-ai/molis-work-module-artifacts", "module", "@molis-ai/molis-work-contracts/modules/artifacts", ["goal-reorg-ar1", "goal-reorg-ar3"], "Artifact identity, version, type, content reference, scope, and provenance facts.", "Plugin implementation dependencies, cross-object relationships, transport receipts, or private drafts.", ["src/v1/", "src/evidence/"], { maturity: "partial", capabilities: ["artifacts.identity.v1", "artifacts.version-repository.v1", "artifacts.opaque-content.v1", "artifacts.compatibility.v1"] }),
  entry("modules/shelf", "@molis-ai/molis-work-module-shelf", "module", "@molis-ai/molis-work-contracts/modules/shelf", [], "Personal shelf items, copy-jobs, hashes, and local text extraction.", "Project Goal facts, Artifact versions, or desktop wheel/hotkey adapters.", [], { maturity: "partial", capabilities: ["shelf.store.v1", "shelf.jobs.v1"] }),
  entry("modules/characters", "@molis-ai/molis-work-module-characters", "module", "@molis-ai/molis-work-contracts/modules/characters", ["coding-c12"], "Personal Character drafts and availability.", "Published Artifact content, execution, permissions, or UI.", [], { maturity: "partial", capabilities: ["characters.query.v1", "characters.command.v1"] }),
  entry("modules/functions", "@molis-ai/molis-work-module-functions", "module", "@molis-ai/molis-work-contracts/modules/functions", [], "Published functions and judgment records.", "TypeSafe HTTP, plugin UI, or scene execution.", [], { extraWorkspaceDependencies: ["@molis-ai/molis-work-storage"], maturity: "partial", capabilities: ["functions.query.v1", "functions.command.v1", "functions.evaluate"] }),  entry("modules/evidence-verification", "@molis-ai/molis-work-module-evidence-verification", "module", "@molis-ai/molis-work-contracts/modules/evidence-verification", ["goal-reorg-ex2", "goal-reorg-ex4"], "Evidence, immutable corrections, criterion coverage, and verification obligations.", "Artifact bodies, Goal Contracts, Runs, or Review verdicts.", ["src/v1/", "src/evidence/"], { maturity: "partial", capabilities: ["evidence.records.v1", "evidence.locator-preflight.v1"] }),
  entry("modules/governance-collaboration", "@molis-ai/molis-work-module-governance-collaboration", "module", "@molis-ai/molis-work-contracts/modules/governance-collaboration", ["goal-reorg-ex3", "goal-reorg-ex4"], "Review obligations, Reviews, Proposals, Decisions, and confirmation provenance.", "Direct mutation of Goal, Artifact, or Project facts.", ["src/v1/"], { maturity: "partial", capabilities: ["governance.proposals.v1", "governance.decisions.v1", "governance.event-decisions.v1"] }),

  entry("horizontal/agent-host", "@molis-ai/molis-work-service-agent-host", "horizontal", "@molis-ai/molis-work-contracts/services/agent-host", ["goal-plugin-platform-v2"], "Agent Runtime registration, capability matrix, frozen run authority, and the Host-owned Review queue.", "Coding business meaning, model choice, credentials, or the approval decision itself.", [], { maturity: "partial", capabilities: ["agent.host.v1", "agent.review-queue.v1", "agent.runtimes.v1", "agent.run.start.v1", "agent.reviews.list.v1"], extraDependencies: { "@prologue/sdk": "file:../../vendor/prologue-sdk/prologue-sdk-0.0.0-rc.1-child-observe.tgz", "@tauri-apps/api": "2.11.1" } }),
  entry("horizontal/connector-host", "@molis-ai/molis-work-service-connector-host", "horizontal", "@molis-ai/molis-work-contracts/services/connector-host", ["goal-reorg-fd1", "goal-reorg-fd3"], "Provider connection, credential-reference, invocation, health, and Receipt mechanisms.", "Source desired state, Signal/Feed/Action facts, or provider-specific business rules.", ["src/feed/connectors/"], { maturity: "partial", capabilities: ["connector.host.v1"] }),
  entry("horizontal/listener-host", "@molis-ai/molis-work-service-listener-host", "horizontal", "@molis-ai/molis-work-contracts/services/listener-host", ["goal-reorg-fd1"], "Durable cursor, lease, retry, quarantine, and Raw Event delivery mechanisms.", "Source configuration, formal Signals, Feed/Attention/Goal/Automation decisions, or credentials.", ["src/feed/sources/scheduler.ts"], { maturity: "partial", capabilities: ["listener.host.v1"] }),
  entry("horizontal/runtime-host", "@molis-ai/molis-work-service-runtime-host", "horizontal", "@molis-ai/molis-work-contracts/services/runtime-host", ["goal-reorg-wk2"], "Runtime provider discovery, start/resume/stream/interrupt/stop, and technical Receipts.", "Claims, Runs, Goals, Sessions, workspaces, conversation lineage, or Artifacts.", ["src/sessions/", "src/web/pty-client.ts"], { maturity: "partial", capabilities: ["runtime.host.v1", "runtime.codex.v1", "runtime.terminal-pty.v1"], extraDependencies: { "node-pty": "1.1.0" } }),
  entry("horizontal/scheduler", "@molis-ai/molis-work-service-scheduler", "horizontal", "@molis-ai/molis-work-contracts/services/scheduler", [], "Durable one-shot wakeup, lease, catch-up, and delivery receipts.", "Cron expressions, Automation rules, Feed source intent, or Action parameters.", [], { maturity: "partial", capabilities: ["scheduler.wakeup.v1"] }),

  entry("plugins/native/goals", "@molis-ai/molis-work-plugin-goals", "native-plugin", "@molis-ai/molis-work-contracts/platform/plugin", ["goal-f826dfb8-bf63-4e98-b6b7-57f6b4b7c3b8", "goal-reorg-gw4", "goal-reorg-gw5", "goal-reorg-ex4"], "Protected first-party Goals navigation, UI, commands, and composition.", "Goal facts, Stores, or another Plugin implementation.", ["src/web/render.ts"], { maturity: "partial", capabilities: ["goals.event-application.v1", "goals.policy-ui.v1", "goals.safety-ui.v1", "goals.relation-ui.v1", "goals.tree-ui.v1", "goals.momentum-ui.v1", "goals.document-ui.v1", "goals.context-ui.v1", "goals.planning-ui.v1", "goals.status-ui.v1", "goals.factors-ui.v1", "goals.dialogs-ui.v1", "goals.document-routes.v1"], extraWorkspaceDependencies: ["@molis-ai/molis-work-module-evidence-verification", "@molis-ai/molis-work-module-execution", "@molis-ai/molis-work-module-goals"] }),
  entry("plugins/native/artifacts", "@molis-ai/molis-work-plugin-artifacts", "native-plugin", "@molis-ai/molis-work-contracts/platform/plugin", ["goal-reorg-ar3"], "Protected first-party Artifact browsing, embedding, and composition.", "Artifact facts, Stores, or producer/consumer implementations.", ["src/web/render.ts", "apps/desktop/launchers/web/server.ts"], { extraWorkspaceDependencies: ["@molis-ai/molis-work-design-system"], maturity: "partial", capabilities: ["artifacts.project-reference.v1", "artifacts.browser.v1"] }),
  entry("plugins/native/characters", "@molis-ai/molis-work-plugin-characters", "native-plugin", "@molis-ai/molis-work-contracts/platform/plugin", ["coding-c12"], "Personal Character editing and project publication.", "Draft storage, Artifact facts, Agent execution, or permissions.", [], { maturity: "partial", capabilities: ["characters.ui-contribution.v1", "characters.http-routes.v1"], extraWorkspaceDependencies: ["@molis-ai/molis-work-design-system"] }),
  entry("plugins/native/coding", "@molis-ai/molis-work-plugin-coding", "native-plugin", "@molis-ai/molis-work-contracts/platform/plugin", ["goal-plugin-platform-v2"], "First-party Coding App: sessions, runs, and the change sets, reports and diagrams they produce.", "Model choice, credentials, the approval decision, or command execution.", [], { extraWorkspaceDependencies: ["@molis-ai/molis-work-design-system"], maturity: "partial", capabilities: ["coding.artifact-types.v1", "coding.ui-contribution.v1"] }),
  entry("plugins/native/workspace", "@molis-ai/molis-work-plugin-workspace", "native-plugin", "@molis-ai/molis-work-contracts/platform/plugin", ["goal-plugin-platform-v2"], "First-party Workspace source: publishes the project's workspace as a bindable Artifact.", "Directory grants, path resolution, or another Plugin's business.", [], { maturity: "partial", capabilities: ["workspace.artifact-type.v1", "workspace.ui-contribution.v1"] }),
  entry("plugins/native/files", "@molis-ai/molis-work-plugin-files", "native-plugin", "@molis-ai/molis-work-contracts/platform/plugin", ["goal-plugin-platform-v2"], "First-party Files tree and reader: captures bounded text snapshots and selections.", "Directory reads, filesystem grants, or comparison rendering.", [], { maturity: "partial", capabilities: ["files.artifact-types.v1", "files.ui-contribution.v1"] }),
  entry("plugins/native/diff", "@molis-ai/molis-work-plugin-diff", "native-plugin", "@molis-ai/molis-work-contracts/platform/plugin", ["goal-plugin-platform-v2"], "First-party comparison surface over captured snapshots, prepared changes and Git changes.", "Producing change sets, reading files, or applying a change.", [], { maturity: "partial", capabilities: ["diff.artifact-type.v1", "diff.ui-contribution.v1"] }),
  entry("plugins/native/git", "@molis-ai/molis-work-plugin-git", "native-plugin", "@molis-ai/molis-work-contracts/platform/plugin", ["goal-plugin-platform-v2"], "First-party Git working-tree changes, commit drafts and accepted change sets.", "Running git, approving an operation, or rendering a comparison.", [], { maturity: "partial", capabilities: ["git.artifact-types.v1", "git.ui-contribution.v1"] }),
  entry("plugins/native/text-stats", "@molis-ai/molis-work-plugin-text-stats", "native-plugin", "@molis-ai/molis-work-contracts/platform/plugin", ["goal-plugin-platform-v2"], "First-party text statistics over a captured file snapshot.", "Reading files, capturing snapshots, or any Host Capability.", [], { maturity: "partial", capabilities: ["text-stats.ui-contribution.v1"] }),
  entry("plugins/native/inbox", "@molis-ai/molis-work-plugin-inbox", "native-plugin", "@molis-ai/molis-work-contracts/platform/plugin", [], "Protected first-party Inbox attention list, detail, and disposition.", "Feed/Goal facts, Stores, or another Plugin implementation.", ["src/web/render.ts"], { maturity: "partial", capabilities: ["inbox.ui-contribution.v1", "inbox.http-routes.v1"] }),
  entry("plugins/native/schedule", "@molis-ai/molis-work-plugin-schedule", "native-plugin", "@molis-ai/molis-work-contracts/platform/plugin", [], "Protected first-party Schedule alarm list, receipts, and pause.", "Feed/Goal facts, cron expressions, or owner execute implementations.", ["src/web/render.ts"], { maturity: "partial", capabilities: ["schedule.ui-contribution.v1", "schedule.http-routes.v1"] }),
  entry("plugins/native/shelf", "@molis-ai/molis-work-plugin-shelf", "native-plugin", "@molis-ai/molis-work-contracts/platform/plugin", [], "Protected first-party Shelf directory, preview, and copy-job surface.", "Goal/Artifact facts, Stores, or desktop wheel/hotkey adapters.", ["src/web/render.ts"], { extraWorkspaceDependencies: ["@molis-ai/molis-work-design-system", "@molis-ai/molis-work-module-shelf"], maturity: "partial", capabilities: ["shelf.ui-contribution.v1", "shelf.http-routes.v1"], extraDependencies: { "@xterm/xterm": "^6.0.0", "@xterm/addon-fit": "^0.11.0" } }),
  entry("plugins/native/images", "@molis-ai/molis-work-plugin-images", "native-plugin", "@molis-ai/molis-work-contracts/platform/plugin", [], "Personal image generation, project history, and saved image previews.", "Text model providers, automatic retries, or another Plugin implementation.", [], { maturity: "partial", capabilities: ["images.ui-contribution.v1", "images.generation.v1"], extraWorkspaceDependencies: ["@molis-ai/molis-work-design-system", "@molis-ai/molis-work-storage"] }),
  entry("plugins/native/experiments", "@molis-ai/molis-work-plugin-experiments", "native-plugin", "@molis-ai/molis-work-contracts/platform/plugin", [], "Personal offline experiments.", "Credentials, model execution, or other Plugin implementation.", [], { maturity: "partial", capabilities: ["experiments.ui-contribution.v1", "experiments.offline-comparison.v1"] }),
  entry("plugins/native/functions", "@molis-ai/molis-work-plugin-functions", "native-plugin", "@molis-ai/molis-work-contracts/platform/plugin", [], "Protected first-party Functions directory, Choice drafts, and TypeSafe preview.", "Goal/Artifact facts, Stores, or a hosted Jev workbench.", ["src/web/render.ts"], { extraWorkspaceDependencies: ["@molis-ai/molis-work-design-system", "@molis-ai/molis-work-module-functions"], maturity: "partial", capabilities: ["functions.ui-contribution.v1", "functions.http-routes.v1"] }),
  entry("plugins/native/pages", "@molis-ai/molis-work-plugin-pages", "native-plugin", "@molis-ai/molis-work-contracts/platform/plugin", [], "Protected first-party Pages directory and ProseMirror document editor.", "Goal/Artifact facts, model providers, or a hosted document service.", ["src/web/render.ts"], { extraWorkspaceDependencies: ["@molis-ai/molis-work-design-system", "@molis-ai/molis-work-storage"], maturity: "partial", capabilities: ["pages.ui-contribution.v1", "pages.http-routes.v1"], extraDependencies: { "fflate": "0.8.2", "htmlparser2": "12.0.0", "mammoth": "1.11.0", "marked": "18.0.11", "highlight.js": "^11.11.2", "lowlight": "^3.3.0", "prosemirror-dropcursor": "^1.8.3", "prosemirror-gapcursor": "^1.4.1", "prosemirror-commands": "^1.7.1", "prosemirror-history": "^1.5.0", "prosemirror-inputrules": "^1.5.1", "prosemirror-keymap": "^1.2.3", "prosemirror-model": "^1.25.4", "prosemirror-schema-list": "^1.5.1", "prosemirror-state": "^1.4.4", "prosemirror-view": "^1.41.4" } }),  entry("plugins/native/form", "@molis-ai/molis-work-plugin-form", "native-plugin", "@molis-ai/molis-work-contracts/platform/plugin", [], "Protected first-party Forms directory, questions, preview, and results.", "Goal/Artifact facts, model providers, or a hosted form collector.", ["src/web/render.ts"], { extraWorkspaceDependencies: ["@molis-ai/molis-work-design-system", "@molis-ai/molis-work-storage"], maturity: "partial", capabilities: ["form.ui-contribution.v1", "form.http-routes.v1"] }),
  entry("plugins/native/dataset", "@molis-ai/molis-work-plugin-dataset", "native-plugin", "@molis-ai/molis-work-contracts/platform/plugin", [], "Protected first-party Dataset directory, table editing, CSV, and versions.", "Goal/Artifact facts, model providers, or a hosted spreadsheet.", ["src/web/render.ts"], { extraWorkspaceDependencies: ["@molis-ai/molis-work-design-system", "@molis-ai/molis-work-storage"], maturity: "partial", capabilities: ["dataset.ui-contribution.v1", "dataset.http-routes.v1"] }),
  entry("plugins/native/ppt", "@molis-ai/molis-work-plugin-ppt", "native-plugin", "@molis-ai/molis-work-contracts/platform/plugin", [], "Protected first-party PPT directory, slide outlines, preview, and JSON export.", "Goal/Artifact facts, SVG generation, or PPTX export.", ["src/web/render.ts"], { extraWorkspaceDependencies: ["@molis-ai/molis-work-design-system", "@molis-ai/molis-work-storage"], maturity: "partial", capabilities: ["ppt.ui-contribution.v1", "ppt.http-routes.v1"] }),
  entry("plugins/native/jelly", "@molis-ai/molis-work-plugin-jelly", "native-plugin", "@molis-ai/molis-work-contracts/platform/plugin", [], "Personal Jelly calendar, notes, and inspiration workspace.", "Original Jelly App data, project Goal facts, or a second runtime.", [], { extraWorkspaceDependencies: ["@molis-ai/molis-work-design-system", "@molis-ai/molis-work-storage"], maturity: "partial", capabilities: ["jelly.ui-contribution.v1", "jelly.workspace.v1"] }),
  entry("plugins/native/lingguang", "@molis-ai/molis-work-plugin-lingguang", "native-plugin", "@molis-ai/molis-work-contracts/platform/plugin", [], "Protected first-party Lingguang directory and inspiration pool.", "Goal/Artifact facts, model providers, or a hosted inspiration service.", ["src/web/render.ts"], { extraWorkspaceDependencies: ["@molis-ai/molis-work-design-system", "@molis-ai/molis-work-storage"], maturity: "partial", capabilities: ["lingguang.ui-contribution.v1", "lingguang.http-routes.v1"] }),
  entry("plugins/native/feed", "@molis-ai/molis-work-plugin-feed", "native-plugin", "@molis-ai/molis-work-contracts/platform/plugin", ["goal-reorg-fd4"], "First-party Feed navigation, UI, disposition, and Module composition.", "Source/Signal/Feed/Attention facts or Provider implementations.", ["src/web/render.ts", "apps/desktop/launchers/web/server.ts"], { extraWorkspaceDependencies: ["@molis-ai/molis-work-design-system"], maturity: "partial", extraDependencies: { "@adeptify/intelligence-client": "file:../../../vendor/intelligence-client/adeptify-intelligence-client-0.2.2.tgz",  "@adeptify/search-evidence-layer": "file:../../../vendor/search-evidence-layer/adeptify-search-evidence-layer-0.4.1.tgz", "marked": "^18.0.11", "sanitize-html": "^2.17.7" }, capabilities: ["feed.native-plugin.contract.v1", "feed.ui-contribution.v1", "feed.http-routes.v1"] }),
  entry("plugins/native/work", "@molis-ai/molis-work-plugin-work", "native-plugin", "@molis-ai/molis-work-contracts/platform/plugin", ["goal-reorg-wk3"], "First-party Session, Runtime, resume, and handoff product UI.", "Session/Run/Goal facts or Runtime adapter implementations.", ["src/web/render.ts", "apps/desktop/launchers/web/server.ts", "src/web/pty-client.ts"], { extraWorkspaceDependencies: ["@molis-ai/molis-work-design-system"], maturity: "partial", capabilities: ["work.session-application.v1", "work.ui-contribution.v1"], extraDependencies: { "@xterm/xterm": "^6.0.0", "@xterm/addon-fit": "^0.11.0" } }),

  entry("plugins/official-integrations/catalog", "@molis-ai/molis-work-integration-catalog", "integration-plugin", "@molis-ai/molis-work-contracts/platform/plugin", ["goal-reorg-fd3"], "Official read-only catalog connector, polling, and identity adapters.", "Source/Signal/Feed facts, secret persistence, or Host business decisions.", [], { maturity: "partial", capabilities: ["connector.catalog.v1", "signal-adapter.catalog.v1"], extraWorkspaceDependencies: ["@molis-ai/molis-work-plugin-sdk"] }),
  entry("plugins/official-integrations/github", "@molis-ai/molis-work-integration-github", "integration-plugin", "@molis-ai/molis-work-contracts/platform/plugin", ["goal-reorg-fd3"], "Official GitHub authorization, connector, listener, Signal, settings, and Action adapters.", "Source/Signal/Feed/Action facts or Host business decisions.", ["src/feed/connectors/github.ts", "src/feed/connectors/github-oauth.ts"], { maturity: "partial", capabilities: ["connector.github.v1", "signal-adapter.github.v1"], extraWorkspaceDependencies: ["@molis-ai/molis-work-plugin-sdk"] }),
  entry("plugins/official-integrations/gmail", "@molis-ai/molis-work-integration-gmail", "integration-plugin", "@molis-ai/molis-work-contracts/platform/plugin", ["goal-reorg-fd3"], "Official Gmail OAuth, connector, listener, Signal, settings, and Action adapters.", "Source/Signal/Feed/Attention facts or Host business decisions.", ["src/feed/connectors/gmail.ts", "src/feed/connectors/gmail-oauth.ts"], { maturity: "partial", capabilities: ["connector.gmail.v1", "signal-adapter.gmail.v1"], extraWorkspaceDependencies: ["@molis-ai/molis-work-plugin-sdk"] }),
  entry("plugins/official-integrations/rss", "@molis-ai/molis-work-integration-rss", "integration-plugin", "@molis-ai/molis-work-contracts/platform/plugin", ["goal-reorg-fd3"], "Official catalog and custom RSS provider adapters.", "Source/Signal/Feed facts or a general-purpose HTTP platform.", ["src/feed/sources/"], { maturity: "partial", extraDependencies: { "@adeptify/search-evidence-layer": "file:../../../vendor/search-evidence-layer/adeptify-search-evidence-layer-0.4.1.tgz" }, capabilities: ["connector.rss.v1", "signal-adapter.rss.v1"], extraWorkspaceDependencies: ["@molis-ai/molis-work-plugin-sdk"] }),
  entry("plugins/official-integrations/web-query", "@molis-ai/molis-work-integration-web-query", "integration-plugin", "@molis-ai/molis-work-contracts/platform/plugin", ["goal-reorg-fd3"], "Official Web Query provider adapter and settings boundary.", "Source/Signal/Feed facts or unrestricted web execution.", ["src/feed/sources/"], { maturity: "partial", capabilities: ["connector.web-query.v1", "signal-adapter.web-query.v1"], extraWorkspaceDependencies: ["@molis-ai/molis-work-plugin-sdk"] }),
  entry("plugins/official-integrations/youtube", "@molis-ai/molis-work-integration-youtube", "integration-plugin", "@molis-ai/molis-work-contracts/platform/plugin", ["goal-reorg-fd3"], "Official YouTube Channel provider adapter and settings boundary.", "Source/Signal/Feed facts or a general media client.", ["src/feed/sources/youtube.ts"], { maturity: "partial", capabilities: ["connector.youtube.v1", "signal-adapter.youtube.v1"], extraWorkspaceDependencies: ["@molis-ai/molis-work-plugin-sdk"] }),

  entry("tooling/plugin-cli", "@molis-ai/molis-work-plugin-cli", "tooling", "@molis-ai/molis-work-contracts/platform/tooling", ["goal-reorg-dv3"], "Plugin creation, Manifest/Contract validation, local debugging, packaging, and signing workflow boundary.", "A fake runnable CLI before the SDK and lifecycle implementation exist.", [], { maturity: "partial", capabilities: ["plugin.manifest.validate.v1"], extraWorkspaceDependencies: ["@molis-ai/molis-work-plugin-runtime"] }),
];

export const WORKSPACE_GLOBS = [
  "apps/*",
  "packages/*",
  "modules/*",
  "horizontal/*",
  "plugins/native/*",
  "plugins/official-integrations/*",
  "tooling/plugin-cli",
];

const CONTRACT_SUBPATHS = [
  ...WORKSPACE_PACKAGES.filter((item) => item.kind === "module").map((item) => item.contract),
  ...WORKSPACE_PACKAGES.filter((item) => item.kind === "horizontal").map((item) => item.contract),
  ...WORKSPACE_PACKAGES.map((item) => item.contract).filter((value) => value.includes("/platform/")),
];

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function filesUnder(directory, filename) {
  if (!fs.existsSync(directory)) return [];
  const result = [];
  for (const name of fs.readdirSync(directory)) {
    if (name === "node_modules" || name === "dist" || name === "target" || name === "gen") continue;
    if (path.basename(directory) === "src-tauri" && name === "resources") continue;
    const child = path.join(directory, name);
    const stat = fs.lstatSync(child);
    if (stat.isSymbolicLink()) continue;
    if (stat.isDirectory()) result.push(...filesUnder(child, filename));
    else if (name === filename) result.push(child);
  }
  return result;
}

export function checkWorkspacePackages(repositoryRoot) {
  const errors = [];
  const names = new Set();
  const expectedPaths = new Set(WORKSPACE_PACKAGES.map((item) => item.path));
  const contractsPath = path.join(repositoryRoot, "packages/contracts/package.json");
  const contractsManifest = fs.existsSync(contractsPath) ? readJson(contractsPath) : null;

  for (const item of WORKSPACE_PACKAGES) {
    const packageRoot = path.join(repositoryRoot, item.path);
    const requiredFiles = ["package.json", "tsconfig.json", "README.md", "src/index.ts"];
    for (const relativeFile of requiredFiles) {
      if (!fs.existsSync(path.join(packageRoot, relativeFile))) {
        errors.push(`${item.path}: missing ${relativeFile}`);
      }
    }
    if (!fs.existsSync(path.join(packageRoot, "package.json"))) continue;

    const manifest = readJson(path.join(packageRoot, "package.json"));
    if (manifest.name !== item.name) errors.push(`${item.path}: package name mismatch`);
    if (names.has(manifest.name)) errors.push(`${item.path}: duplicate package name ${manifest.name}`);
    names.add(manifest.name);
    if (manifest.private !== true) errors.push(`${item.path}: package must remain private in F2`);
    if (manifest.version !== "0.0.0") errors.push(`${item.path}: package version must be 0.0.0 in F2`);
    if (manifest["molis-work"]?.path !== item.path) errors.push(`${item.path}: molis-work.path mismatch`);
    if (manifest["molis-work"]?.kind !== item.kind) errors.push(`${item.path}: molis-work.kind mismatch`);
    if (manifest["molis-work"]?.maturity !== item.maturity) errors.push(`${item.path}: package maturity must be ${item.maturity}`);
    if (manifest["molis-work"]?.contract !== item.contract) errors.push(`${item.path}: Contract entrypoint mismatch`);
    if (manifest["molis-work"]?.ssot !== "docs/SSOT-MATRIX.md") errors.push(`${item.path}: architecture SSOT mismatch`);
    if (JSON.stringify(manifest["molis-work"]?.migrationGoals) !== JSON.stringify(item.migrationGoals)) {
      errors.push(`${item.path}: migration Goal list mismatch`);
    }
    const dependencies = Object.entries(manifest.dependencies ?? {}).sort(([left], [right]) => left.localeCompare(right));
    const expectedDependencies = item.path === "packages/contracts"
      ? []
      : [
          ...["@molis-ai/molis-work-contracts", ...item.extraWorkspaceDependencies]
            .map((name) => [name, "workspace:*"]),
          ...Object.entries(item.extraDependencies),
        ].sort(([left], [right]) => left.localeCompare(right));
    if (JSON.stringify(dependencies) !== JSON.stringify(expectedDependencies)) {
      errors.push(`${item.path}: workspace dependency boundary does not match its declared migration slice`);
    }
    if (!manifest.scripts?.build || !manifest.scripts?.typecheck) {
      errors.push(`${item.path}: missing build/typecheck scripts`);
    }
    if (!manifest.exports?.["."]?.types || !manifest.exports?.["."]?.import) {
      errors.push(`${item.path}: missing public export entrypoint`);
    } else if (
      !manifest.exports["."].types.startsWith("./dist/") ||
      !manifest.exports["."].import.startsWith("./dist/")
    ) {
      errors.push(`${item.path}: public export must resolve through dist, not a source deep import`);
    }

    const indexPath = path.join(packageRoot, "src/index.ts");
    if (fs.existsSync(indexPath)) {
      const indexSource = fs.readFileSync(indexPath, "utf8");
      if (!indexSource.includes("packageDescriptor")) errors.push(`${item.path}: missing packageDescriptor export`);
      if (!indexSource.includes(`maturity: "${item.maturity}"`)) errors.push(`${item.path}: source maturity is not ${item.maturity}`);
      for (const capability of item.capabilities) {
        if (!indexSource.includes(`"${capability}"`)) errors.push(`${item.path}: source capability ${capability} missing`);
      }
      if (item.maturity === "contract-only" && item.path !== "packages/contracts" && /\b(class|registerProvider|createStore)\b/u.test(indexSource)) {
        errors.push(`${item.path}: contract-only entrypoint appears to register implementation behavior`);
      }
    }

    const readmePath = path.join(packageRoot, "README.md");
    if (fs.existsSync(readmePath)) {
      const readme = fs.readFileSync(readmePath, "utf8");
      if (!readme.includes(`Status: \`${item.maturity}\``)) errors.push(`${item.path}: README status missing`);
      if (!readme.includes(item.contract)) errors.push(`${item.path}: README Contract entrypoint missing`);
      for (const goalId of item.migrationGoals) {
        if (!readme.includes(goalId)) errors.push(`${item.path}: README missing migration Goal ${goalId}`);
      }
    }
  }

  const packageJsonFiles = [
    ...filesUnder(path.join(repositoryRoot, "apps"), "package.json"),
    ...filesUnder(path.join(repositoryRoot, "packages"), "package.json"),
    ...filesUnder(path.join(repositoryRoot, "modules"), "package.json"),
    ...filesUnder(path.join(repositoryRoot, "horizontal"), "package.json"),
    ...filesUnder(path.join(repositoryRoot, "plugins"), "package.json"),
    ...filesUnder(path.join(repositoryRoot, "tooling"), "package.json"),
  ];
  for (const packageJson of packageJsonFiles) {
    const relativePackage = path.relative(repositoryRoot, path.dirname(packageJson));
    if (!expectedPaths.has(relativePackage)) errors.push(`unexpected workspace package ${relativePackage}`);
  }

  if (contractsManifest) {
    for (const contract of new Set(CONTRACT_SUBPATHS)) {
      const subpath = contract.replace("@molis-ai/molis-work-contracts", ".");
      if (!contractsManifest.exports?.[subpath]) errors.push(`contracts: missing export ${subpath}`);
    }
  }

  const workspaceFile = path.join(repositoryRoot, "pnpm-workspace.yaml");
  if (fs.existsSync(workspaceFile)) {
    const workspace = fs.readFileSync(workspaceFile, "utf8");
    for (const glob of WORKSPACE_GLOBS) {
      if (!workspace.includes(`'${glob}'`) && !workspace.includes(`\"${glob}\"`)) {
        errors.push(`pnpm-workspace.yaml: missing ${glob}`);
      }
    }
  } else {
    errors.push("missing pnpm-workspace.yaml");
  }

  return {
    packageCount: WORKSPACE_PACKAGES.length,
    uniquePackageNames: names.size,
    contractSubpaths: Object.keys(contractsManifest?.exports ?? {}).filter((key) => key !== ".").length,
    errors,
  };
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const result = checkWorkspacePackages(repositoryRoot);
  console.log(JSON.stringify(result, null, 2));
  if (result.errors.length > 0) process.exitCode = 1;
}
