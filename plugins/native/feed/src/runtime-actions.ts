import type { ActionDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import { feedArtifactPreview } from "./artifact-preview.js";
import { feedContentActions, feedSearchEntriesAction, feedSourceSubjectAction, feedSubjectAction } from "./content-actions.js";
import { FEED_CONTENT_LEDGER_ACTIONS } from "./content-ledger-actions.js";
import { feedHomeEventsAction } from "./home-events.js";
import { FEED_INBOX_ACTIONS, feedInboxActions } from "./inbox-actions.js";
import { feedItemActions } from "./item-actions.js";
import { FEED_NOTIFICATION_ACTIONS, feedNotificationActions } from "./notification-actions.js";
import { feedQueryActions } from "./query-actions.js";
import { feedRuleActions } from "./rule-actions.js";
import { feedWakeAction } from "./runtime-wake.js";
import { feedRuntimeCaptureScene } from "./scenes.js";
import { feedSourceActions } from "./source-actions.js";

const FEED_PULL = "sources:pull_feed", QUERY_PULL = "sources:pull_query", REPOSITORY_READ = "sources:read_repository";
const CONNECTIONS = "connections:use", CONNECTOR_PULL = "sources:pull_connector", EVIDENCE = "evidence:read";
/** What the capture scene declares beyond Feed's own: a caller is offered a judgment, or has one run, only if it holds the scene's permissions. */
const SCENE = ["attention:write", "judgments:write"];

/**
 * The permissions an action's calls need of the platform beyond Feed's own: the platform lets a call use a service only when its action
 * declares the permission. Describing a source uses the vocabulary, deleting one forgets its search records, a sync pulls (a web query
 * has its own permission).
 */
const PLATFORM_NEEDS: ReadonlyMap<ActionDefinition, readonly string[]> = new Map<ActionDefinition, readonly string[]>([
  [feedSourceActions.register, [FEED_PULL]], [feedSourceActions.update, [FEED_PULL]],
  // Removing a source removes its items, with their Inbox entries and their links to Goals.
  [feedSourceActions.delete, [FEED_PULL, "attention:write", "context-ledger:write"]],
  // An account source is pulled with the account the person bound to it (`sources:pull_connector`), whose state it asks (`connections:use`),
  // and one whose account needs the person is recorded in the Inbox (`attention:write`).
  // New items are judged as the sync ends, which reads their retained bodies (`evidence:read`) for the capture rules.
  [feedSourceActions.sync, [FEED_PULL, QUERY_PULL, REPOSITORY_READ, CONNECTIONS, CONNECTOR_PULL, "attention:write", EVIDENCE]],
  // A tick runs the syncs, so it needs what they need, and it records a source's fault in the Inbox.
  [feedSourceActions.tick, [FEED_PULL, QUERY_PULL, REPOSITORY_READ, "attention:write", CONNECTIONS, CONNECTOR_PULL, EVIDENCE]],
  // Disconnecting an account source takes the person's binding off it.
  [feedSourceActions.disconnect, [CONNECTIONS]],
  // Reading an item's material asks whether its source's account still works; the status asks whether the Home has an account at all.
  [feedInboxActions.material, [CONNECTIONS, EVIDENCE]], [feedQueryActions.connections, [CONNECTOR_PULL]],
  // The actions that give an item's retained text decrypt its bodies through the platform (`evidence.read`), which the action must declare and the caller hold (4e-2f decision).
  [feedQueryActions.snapshot, [EVIDENCE]], [feedQueryActions.item, [EVIDENCE]], [feedInboxActions.content, [EVIDENCE]], [feedRuleActions.previewJudgment, [EVIDENCE, ...SCENE]],
  [feedRuleActions.preview, [EVIDENCE]], [feedContentActions.read, [EVIDENCE]], [feedSubjectAction, [EVIDENCE]], [feedHomeEventsAction, [EVIDENCE]],
  // A notification the platform delivers is admitted to the Inbox as it is received, and judged by the capture rules.
  // The Inbox's next-step judgment of that entry is asked as the same caller, which then holds what the judgment needs (inbox:read, model:invoke, the rule's functions:invoke, judgments:write).
  [feedNotificationActions.receive, ["attention:write", EVIDENCE, "inbox:read", "model:invoke", "functions:invoke", "judgments:write"]],
  // What a call hands in or has judged again is judged by the capture rules, which read the retained bodies.
  [feedContentActions.receive, [EVIDENCE]], [feedRuleActions.evaluate, [EVIDENCE, ...SCENE]],
  // Saving a rule that names a judgment asks whether the caller may use the scene for it.
  [feedRuleActions.create, SCENE], [feedRuleActions.update, SCENE],
  // Admitting an item opens its Inbox entry, and saving, ignoring or restoring one settles or reopens the entries it has.
  [feedInboxActions.admit, ["attention:write"]], [feedItemActions.inbox, ["attention:write"]],
  [feedItemActions.disposition, ["attention:write"]], [feedItemActions.restore, ["attention:write"]],
  // A promotion links the item to its Goal (an edge in the Context Ledger) and settles the Inbox entries the item has.
  [feedItemActions.promote, ["attention:write", "context-ledger:write"]],
]);
/** Actions that commit for themselves, because what they write comes after something they must wait for. */
export const SELF_COMMITTING: ReadonlySet<ActionDefinition> = new Set<ActionDefinition>([feedSourceActions.sync, feedSourceActions.delete, feedSourceActions.tick, feedRuleActions.create, feedRuleActions.update,
  // A promotion writes after Goals has answered, and Goals is asked through the caller's own directory.
  feedItemActions.promote]);
/**
 * The platform lets a call write its ledgers, and wait for a scene's judgment, only from a concurrent action: a self-committing action is one,
 * and so is each that judges what it just wrote (its write is still one commit, made before the judgment starts).
 */
export const CONCURRENT: ReadonlySet<ActionDefinition> = new Set<ActionDefinition>([...SELF_COMMITTING, feedContentActions.receive, feedNotificationActions.receive, feedRuleActions.evaluate,
  feedItemActions.disposition, feedItemActions.restore]);
export const runtimeAction = (definition: ActionDefinition): ActionDefinition => {
  const needs = PLATFORM_NEEDS.get(definition) ?? [], concurrent = CONCURRENT.has(definition);
  return needs.length === 0 && !concurrent ? definition
    : { ...definition, action: { ...definition.action, permissions: [...definition.action.permissions, ...needs], ...(concurrent ? { scheduling: "concurrent" as const } : {}) } };
};
/** What the platform's clock wakes: a tick, for the plugin audience, with the wakeup's input. */
export const WAKE = feedWakeAction(runtimeAction(feedSourceActions.tick));
export const GOAL_CONTRACT = { capability_id: "goals.contract.read", version: 2, provider_id: "io.molis.work.goals" };

/** What each project's half answers: the actions as the Plugin Runtime needs them declared, and the clock's wakeup. */
export const FEED_PROJECT_ACTIONS: ActionDefinition[] = [
  ...[feedArtifactPreview, ...Object.values(feedContentActions), ...Object.values(feedQueryActions), ...Object.values(feedRuleActions), ...Object.values(feedItemActions),
    ...Object.values(feedSourceActions), ...FEED_INBOX_ACTIONS, ...FEED_NOTIFICATION_ACTIONS, feedSubjectAction, feedSourceSubjectAction, feedSearchEntriesAction,
    feedHomeEventsAction].map(runtimeAction),
  WAKE,
];

/** Every action of Feed's Manifest: the project half's, and the Home half's three for the reference ledger (the Home half answers only them). */
export const FEED_ACTIONS: ActionDefinition[] =[...FEED_PROJECT_ACTIONS, ...FEED_CONTENT_LEDGER_ACTIONS];

/** Every permission a caller needs to use all of Feed: its actions' (with what they ask of the platform) and the capture scene's. */
export const FEED_ACTION_PERMISSIONS: string[] = [...new Set([...FEED_ACTIONS.flatMap(definition => definition.action.permissions), ...feedRuntimeCaptureScene.permissions])];
