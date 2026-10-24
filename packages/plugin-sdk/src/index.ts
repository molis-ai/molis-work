/** The page runtime installs this helper; its shape is owned by the UI contract. */
declare global {
  var molisWorkRequest: import("@molis-ai/molis-work-contracts/platform/ui").UiRequest;
}

import { pluginErrors } from "@molis-ai/molis-work-contracts/platform/plugin";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { createHash } from "node:crypto";
export { createExecutionLifetime, type ExecutionLifetime, type ExecutionLifetimeOptions } from "./execution-lifetime.js";
import { parsePluginManifest } from "./manifest.js";

export { parsePluginManifest, comparePluginVersions } from "./manifest.js";
export { inspectActionDeclarations, isHomeAggregateQuery } from "./action-declarations.js";
export { inspectActionCrossReferences } from "./action-cross-references.js";
/** Bounded line comparison. Its result and row types are in the contracts (modules/workspace-artifacts). */
export { DIFF_STEP_BUDGET, splitLines, joinLines, reconstructSides, compareTexts, textDiffRow, alignSplitRows } from "./text-diff.js";
/** `git status --porcelain=v1 -z --branch` read into a working-tree status; the Host's workspace Git service and the Git plugin read it with this one parse. */
export { parsePorcelainStatus, type GitStatus, type GitChange, type GitHead, type GitUpstream, type PorcelainInput } from "./git-porcelain.js";
/** A message's `{name}` values filled in, with `{count|one|other}` for a word that agrees with a number. */
export { fillMessage } from "./message-text.js";
/**
 * Copied credentials masked in external text before it goes to a model or back on screen. Code colouring and rich text are
 * subpaths (`/highlight`, `/rich-text`), so an entry that does not use them loads neither the tokenizer nor the Markdown parser.
 */
export { redactSecrets } from "./redact-secrets.js";
export { questionAnswer } from "./question-answers.js";
export { QUESTION_REASK, questionDraftMaterial } from "./question-drafts.js";
export { actionCardView, cardSubject, draftActionCard, runActionCard, dismissActionCard, sweepActionCard, type ActionCard, type ActionCardStatus, type ActionCardPorts, type ActionCardRefusal, type CardStore, type CardAuthority } from "./action-cards.js";
export { cardInputValues, instantIn, wallClockIn } from "./card-values.js";
/** The rules of a question set and its answer, for a plugin that asks without an Agent run; the same verdicts as the Agent runtime's. */
export { QUESTION_LIMITS, questionProblems, questionSetFlaw } from "./question-rules.js";
export { sceneConfigurationActions } from "@molis-ai/molis-work-contracts/platform/actions";
export { defineAction } from "./actions.js";
/** The two binders: an HTTP route over an action, and an action over the local owner's personal state. A route answers a failure by its kind. */
export { PLUGIN_ROUTE_STREAM_LIMITS, bindPluginActionRoute, bindOwnerPluginAction } from "./routes.js";
/** One error model: raise `ActionError`s whose codes your plugin declares once with `defineErrorCodes`; the Host's edge answers them by kind. */
export { ActionError, defineErrorCodes, type ActionErrorKind, type ActionErrorOptions } from "@molis-ai/molis-work-contracts/platform/actions";
export { actionErrorKind, actionHttpStatus, actionErrorBody, actionErrorResponse, actionErrorFromResponse, isCodedFailure, type ActionErrorBody, type ActionErrorBodyOptions } from "./errors.js";
export { defineSubjectContextAction, subjectContext, resolveActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
export { defineSubjectOffersAction } from "@molis-ai/molis-work-contracts/platform/actions";
export { defineActionUsagesAction, referencesAction, type ActionUsage, type ActionUsagesInput } from "@molis-ai/molis-work-contracts/platform/actions";
export type { SubjectOffersInput, SubjectActionOffer, SubjectOfferChoice } from "@molis-ai/molis-work-contracts/platform/actions";
/** Putting what the person has in hand somewhere: declare `intake` (this command creates an Item) or `attach` (it adds to one) on the command itself. */
export type { ActionIntake, ActionAttach, ItemAttachPosition } from "@molis-ai/molis-work-contracts/platform/actions";
export { defineHomeEventsAction, withinHomeEventWindow, assertHomeEventWindow } from "@molis-ai/molis-work-contracts/platform/actions";
/** The Home title bar's background tasks: a read-only project query the Home asks in every open project (`home_aggregate`). */
export { defineHomeBackgroundTasksAction } from "@molis-ai/molis-work-contracts/platform/actions";
/** System search: list what your plugin can find (by version) and read it through your subject reader. */
export { defineSearchEntriesAction, bindSearchEntriesHandler, searchEntriesPage, searchText, searchRevisionOf, SEARCH_SOURCE_AUDIENCES } from "@molis-ai/molis-work-contracts/platform/actions";
export { defineFileEntriesAction, defineFileContentAction, bindFileEntriesHandler, fileEntriesPage, fileContentOf, FILE_SOURCE_AUDIENCES, FILE_CONTENT_MAX_BYTES } from "@molis-ai/molis-work-contracts/platform/actions";
export type { FileEntry, FileContent, FileSourceKind } from "@molis-ai/molis-work-contracts/platform/actions";
/** Taking on work the Assistant hands over: publish all six roles at once; the Assistant calls them as the person at this computer. */
export { defineWorkExecutorAction, defineWorkExecutorActions, WORK_EXECUTOR_ROLES } from "@molis-ai/molis-work-contracts/platform/actions";
export type { WorkExecutorRole, WorkExecutorActionOptions, WorkExecutorCalls, WorkExecutorState, WorkExecutorSession, WorkExecutorRunControl } from "@molis-ai/molis-work-contracts/platform/actions";
export type { SearchEntry, SearchEntriesInput, SearchEntriesPage, SearchOpenTarget, SearchSourceKind } from "@molis-ai/molis-work-contracts/platform/actions";
export type { HomeEventWindow, HomeEvent, HomeEventCollection, HomeOpenTarget } from "@molis-ai/molis-work-contracts/platform/actions";
export type { HomeBackgroundTask, HomeBackgroundTaskCollection, HomeBackgroundTaskCommand, HomeBackgroundTaskPhrase } from "@molis-ai/molis-work-contracts/platform/actions";
export type { ActionSubject, ActionSubjectContext } from "@molis-ai/molis-work-contracts/platform/actions";
export type { ActionExecutionContext, ActionExecutionPolicy, ActionResultView, ActionResultPresentation, ActionDefinition, ActionCallContext, ActionHandlerBinding, ActionSceneDefinition, ActionSceneHandlerBinding,
  ActionSceneReference, ActionSceneBinding, ActionSceneTargetDefinition, ActionSceneTarget, ActionSceneConfigureOptions, ActionSceneClient } from "@molis-ai/molis-work-contracts/platform/actions";
export type {
  PluginManifest, PluginDefinition, PluginStartContext, PluginArtifactClient, PluginArtifactPublishInput, PluginPrivateStorage,
  PluginUiClient, PluginHostServices, PluginActionClient, PluginActionDirectory,
  PluginDatabase, PluginDatabaseReader, PluginDatabaseTransaction, PluginDatabaseDeclaration, PluginSqlValue, PluginSqlRow,
  PluginScheduleClient, PluginScheduleWriter, PluginScheduleJob, PluginScheduleRegisterInput, PluginWakeupDeclaration,
  PluginModelClient, PluginModelRequest, PluginModelResult,
} from "@molis-ai/molis-work-contracts/platform/plugin";
/** The Host's text model for a plugin it runs itself: `context.services.model`, with the instructions the plugin registers (`PluginDefinition.instructions`). */
export { PLUGIN_MODEL_LIMITS } from "@molis-ai/molis-work-contracts/platform/plugin";
export { defineInstructionPrompt, instructed } from "@molis-ai/molis-work-contracts/platform/model-prompts";
export type { InstructionPrompt, InstructedPrompt } from "@molis-ai/molis-work-contracts/platform/model-prompts";
export type { ArtifactReference, ArtifactVersionRecord } from "@molis-ai/molis-work-contracts/modules/artifacts";
export type { UiPluginClientHost, UiClientScope, UiClientTranslate, UiRequest, UiContribution, UiContributionDescriptor, UiRenderRequest, UiPageActions, UiPageView, UiPageWorkspaces, UiPageReviewQuery, UiPageReviewOutcome, UiPageReviews, UiPageDrafts, UiPageDialogs, UiPageMessage, UiPageMessages, UiPageFiles, UiTerminalCommand, UiTerminalEvent, UiTerminalView, UiTerminalMountOptions, UiPageTerminal } from "@molis-ai/molis-work-contracts/platform/ui";

import type {
  IntegrationProviderPort,
  PluginDefinition,
  PluginManifest,
  PluginStartContext,
} from "@molis-ai/molis-work-contracts/platform/plugin";

export const packageDescriptor = {
  packageName: "@molis-ai/molis-work-plugin-sdk",
  packagePath: "packages/plugin-sdk",
  kind: "foundation",
  maturity: "partial",
  contract: "@molis-ai/molis-work-contracts/platform/plugin",
  migrationGoals: ["goal-reorg-f2", "goal-reorg-fd3", "goal-reorg-dv3"],
  ssot: "docs/SSOT-MATRIX.md",
  capabilities: ["plugin.define.v1", "integration.polling.v1"],
} as const;



export function definePlugin(definition: PluginDefinition): PluginDefinition {
  assertManifest(definition.manifest);
  return Object.freeze(definition);
}

export function definePollingIntegrationPlugin(input: {
  manifest: PluginManifest;
  createProvider(context: PluginStartContext): IntegrationProviderPort;
  now?: () => Date;
}): PluginDefinition {
  if (input.manifest.kind !== "integration") {
    throw pluginErrors.manifest_invalid("Polling Provider 必须声明为 Integration Plugin");
  }
  return definePlugin({
    manifest: input.manifest,
    async start(context) {
      const provider = input.createProvider(context);
      const now = input.now ?? (() => new Date());
      return {
        kind: "integration",
        connector_driver: {
          driver_id: `${input.manifest.plugin_id}:connector`,
          async health() {
            const health = await provider.health();
            return {
              ok: health.ok,
              status: health.status === "mock" ? "error" : health.status,
              message: health.message,
              ...(health.action ? { action: health.action } : {}),
            };
          },
          async poll(request) {
            const mode = request.intent?.sync_mode === "rebuild_cursor"
              ? "rebuild_cursor"
              : "normal";
            const result = await provider.sync({ cursor: request.cursor, mode });
            if (!result.ok) {
              return {
                ok: false,
                mode: "live",
                failure: result.failure,
                message: result.message,
                ...(result.action ? { action: result.action } : {}),
                ...(result.httpStatus == null ? {} : { http_status: result.httpStatus }),
                ...(result.retryAfterAt ? { retry_after_at: result.retryAfterAt } : {}),
              };
            }
            const observedAt = now().toISOString();
            return {
              ok: true,
              mode: result.mode,
              cursor_after: structuredClone(result.cursor),
              events: result.items.map((item, index) => ({
                raw_event_id: `raw-event-${digest(`${input.manifest.plugin_id}\u0000${item.externalId}\u0000${JSON.stringify(item)}`)}`,
                provider_dedupe_id: item.externalId,
                occurred_at: normalizeDate(item.occurredAt, observedAt),
                observed_at: observedAt,
                payload: structuredClone(item) as unknown as Record<string, unknown>,
                ...(index === result.items.length - 1
                  ? { cursor_after: structuredClone(result.cursor) }
                  : {}),
              })),
            };
          },
        },
        signal_adapter: {
          adapter: {
            plugin_id: input.manifest.plugin_id,
            version: input.manifest.version,
          },
          toSignalDraft(event, source) {
            const payload = structuredClone(event.payload);
            const kind = typeof payload.kind === "string" && payload.kind.trim()
              ? payload.kind
              : "update";
            return {
              kind,
              occurred_at: event.occurred_at,
              observed_at: event.observed_at,
              payload,
              content_refs: [],
              provenance: {
                provider_plugin_id: input.manifest.plugin_id,
                provider_plugin_version: input.manifest.version,
                project_id: source.project_id,
                source_id: source.source_id,
              },
            };
          },
        },
      };
    },
  });
}

export function assertManifest(manifest: PluginManifest): void {
  try {
    parsePluginManifest(manifest);
  } catch (error) {
    if (error instanceof ActionError && Object.hasOwn(manifestFailures, error.code)) {
      throw manifestFailures[error.code as keyof typeof manifestFailures](error.message);
    }
    throw error;
  }
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

function normalizeDate(value: string | undefined, fallback: string): string {
  return value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : fallback;
}

export type MolisWorkPackageDescriptor = typeof packageDescriptor;

export { defineWorkflowContentActions, bindWorkflowContentHandlers } from "@molis-ai/molis-work-contracts/platform/actions";
export {
  defineObjectMoveAction, defineObjectCopyAction, bindObjectMoveHandler, bindHomeObjectMoveHandler, bindObjectCopyHandler, PERSONAL_SPACE_PROJECT_ID, type PlacementResult,
} from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * Reminders the person set in your plugin (a time on a to-do): the Host asks, about once a minute, which fall due in a window
 * and tells each one once; you keep no timer. Home scope, read-only.
 */
export { defineDueRemindersAction, assertDueReminderWindow, withinDueReminderWindow } from "@molis-ai/molis-work-contracts/platform/actions";
export type { DueReminderWindow, DueReminder, DueReminderCollection } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * Fragment offers: what your plugin can do with a selected word, range or blocks. Declare the finite choices statically and
 * prepare each one's complete input on request; preparing never writes and the chosen action runs only when the person clicks it.
 */
export { defineFragmentOffersAction, FRAGMENT_ANY_OBJECT, FRAGMENT_INTENTS, FRAGMENT_GRANULARITIES, FRAGMENT_ROLES } from "@molis-ai/molis-work-contracts/platform/actions";
export type { FragmentOffersInput, FragmentActionOffer, FragmentOfferChoice, FragmentTarget, FragmentGranularity, FragmentRole, FragmentIntent, FragmentApply } from "@molis-ai/molis-work-contracts/platform/actions";

/**
 * 成果库 helpers for a type your plugin produces (declared in the manifest's `artifacts.produces`): preview a version as a file,
 * pin the current object as a new version (`nextPinnedVersion` numbers it), compare a version with its object, start new work
 * from a version, and list your objects that link to one.
 */
export {
  defineArtifactPreviewAction, bindArtifactPreview,
  defineArtifactPinAction, nextPinnedVersion,
  defineArtifactCompareAction, bindArtifactCompare, sameArtifactFields, objectOrMissing,
  defineArtifactContinueAction, bindArtifactContinue,
  defineArtifactReferrersAction, linkedArtifactVersion, linksToArtifactVersion,
} from "@molis-ai/molis-work-contracts/platform/actions";
export type {
  ArtifactPreviewInput, ArtifactPinInput, ArtifactPinResult, ArtifactLineHead, ArtifactCompareInput, ArtifactCompareResult, ArtifactCompareState,
  ArtifactContinueInput, ArtifactContinueResult, ArtifactReferrersInput, ArtifactReferrer, ArtifactReferrersResult,
} from "@molis-ai/molis-work-contracts/platform/actions";

/** Say what an action really does where its id would be misread (a `delete_preview` deletes nothing); `plugin: false` keeps it from generated plugins. */
export { withActionEffect } from "@molis-ai/molis-work-contracts/platform/actions";

const manifestFailures = {
  "plugin.manifest_invalid": pluginErrors.manifest_invalid,
  "plugin.entrypoint_missing": pluginErrors.entrypoint_missing,
  "plugin.permission_invalid": pluginErrors.permission_invalid,
  "plugin.declaration_invalid": pluginErrors.declaration_invalid,
} as const;

export { decodeMaterialUpload, supportsMaterialExtension, MATERIAL_EXTENSIONS, MATERIAL_UPLOAD_MAX_BYTES } from "./material-upload.js";
export type { PluginMaterialsClient, PluginMaterialRequest, PluginMaterialSourceRequest, PluginLocalPageRequest, PluginOriginalRequest, PluginOriginalContent, MaterialSourceContent } from "@molis-ai/molis-work-contracts/platform/plugin";
export type { MaterialSource, MaterialUpload, MaterialExtraction } from "@molis-ai/molis-work-contracts/services/materials";

export type { PluginAgentClient, PluginAgentRunInput, PluginAgentRunResult } from "@molis-ai/molis-work-contracts/platform/plugin";

export type { PluginInstallationClient, PluginInstallationView } from "@molis-ai/molis-work-contracts/platform/plugin";

export type { PluginNotificationClient, PluginNotificationInput, PluginNotificationReceipt } from "@molis-ai/molis-work-contracts/platform/plugin";
export { canonicalJsonValue } from "./json-value.js";
