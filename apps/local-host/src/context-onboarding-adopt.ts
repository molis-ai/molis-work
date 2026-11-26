import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { cutHead } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import { ActionError, objectLink, PERSONAL_SPACE_PROJECT_ID, type ActionDefinition, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PlacedObject } from "@molis-ai/molis-work-contracts/services/placement";
import {
  ONBOARDING_DRAFT_GET_MAX, ONBOARDING_DRAFT_KEEP_MAX, ONBOARDING_TAKE_MATERIALS_MAX,
  type OnboardingCodeRootTake, type OnboardingDocumentsInput, type OnboardingDocumentsResult,
  type OnboardingDraftBatch, type OnboardingDraftGetInput, type OnboardingDraftKeepInput, type OnboardingTakeResult,
} from "@molis-ai/molis-work-contracts/platform/plugin-onboarding";
import { artifactSubjectId, type ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { artifactsActions } from "@molis-ai/molis-work-module-artifacts";
import { withContextJourneys, type ContextJourney } from "./context-onboarding-store.js";
import { readStagedText, stagedFilePath } from "./context-onboarding-staging.js";
import type { LocalWebCatalogRunner } from "./web-project-settings.js";
import type { OnboardingMaterialKind, OnboardingTaker } from "./onboarding-takers.js";

/**
 * The materials and the summary, kept by the `documents` taker (contract-design §2.5): one call per material and one for the summary, each
 * by its own request id, so a retry after the taker kept one and before the journey noted it gets the same documents back. The taker cuts a
 * long material into parts and titles them; the Host hands over the title whole.
 */
export async function importAdoptedMaterialsAndSummary(options: {
  readonly home: string;
  readonly id: string;
  readonly journey: ContextJourney;
  readonly actions: BoundActionClient & { forOriginal(path: string): Promise<BoundActionClient> };
  /** The `documents` taker's action, and the person's client bound to it alone. */
  readonly documents: { readonly client: BoundActionClient; readonly action: ActionDefinition };
}): Promise<{ version: ArtifactReference; title: string }[]> {
  const { home, id, journey, actions } = options;
  const keepDocuments = (input: OnboardingDocumentsInput) => options.documents.client.invoke(options.documents.action as ActionDefinition<OnboardingDocumentsInput, OnboardingDocumentsResult>, input);
  const handed: { version: ArtifactReference; title: string }[] = [];
  const refs = journey.adoption!.blank
    ? []
    : journey.summary?.references ?? journey.sources.filter(s => s.selected).flatMap(s => (s.references ?? []).filter(r => !r.duplicate_of));
  if (!journey.summary) refs.forEach((ref, index) => { ref.label = "S" + (index + 1); });
  journey.artifact_references = refs.flatMap(ref => ref.artifact ? [ref.artifact] : []);
  for (const ref of refs) {
    // A material from an external session is that session's in the project, whichever round read it: the same text comes back as the
    // same material (Artifacts reuses an unchanged version) and the same source page, so importing again records nothing new (SRB-09).
    const session = ref.session_key ? createHash("sha256").update(JSON.stringify([ref.session_key, ref.original.sha256])).digest("hex") : null;
    const sourceId = ref.session_key ? "sessions:" + ref.session_key : "onboarding:" + id + ":" + ref.source_id;
    if (!ref.artifact) {
      const content = await readStagedText(home, id, ref.text);
      const registered = ref.secret_mode === "strip"
        ? await actions.invoke(artifactsActions.importFile, {
            source: "file",
            filename: "material.md",
            title: ref.title,
            source_id: sourceId,
            content,
          })
        : await (await actions.forOriginal(await stagedFilePath(home, id, ref.original.sha256))).invoke(artifactsActions.importFile, {
            source: "file",
            filename: "material.md",
            title: ref.title,
            source_id: sourceId,
            content,
            original_file: { filename: ref.original.filename, mime: ref.original.mime },
          });
      ref.artifact = { artifact_id: registered.artifact_id, version: registered.version };
      journey.artifact_references.push(ref.artifact);
      withContextJourneys(home, store => store.save(journey));
    }
    if (!ref.parts) {
      // The id and the hash are the ones the Host gave before the taker cut parts itself: a document kept then is found again. A session's
      // material is keyed by the session and its text, whichever round reads it (SRB-09).
      ref.parts = [...(await keepDocuments({ request_id: session ? "sessions:" + session : id + ":sources:" + ref.label, request_hash: session ?? id,
        title: `[${ref.label}] ${ref.title}`,
        markdown: `原标题：${ref.title}\n\n来源：${ref.path} · 版本 ${ref.version}\n\n${await readStagedText(home, id, ref.text)}` })).parts];
      ref.adopted = true;
      withContextJourneys(home, store => store.save(journey));
    } else {
      ref.adopted = true;
    }
    if (ref.artifact) handed.push({ version: ref.artifact, title: ref.title });
  }
  const sources = refs.map(r => `[${r.label}] [${r.title.replace(/[\[\]]/gu, "")}](${objectLink(journey.project_id, { surface: r.parts![0]!.open.surface, id: r.parts![0]!.open.id, title: r.title })}) · ${r.path} · 版本 ${r.version}`).join("\n\n");
  const text = journey.adoption!.body + (sources ? "\n\n## " + uiText.text("workbench.context-onboarding-service.sources") + "\n\n" + sources : "");
  const summaryTitle = uiText.text("workbench.context-onboarding-service.title-work-summary", { title: journey.adoption!.title });
  const summaryText = [...summaryTitle].length > 80 ? `${uiText.text("workbench.context-onboarding-service.project-title", { title: journey.adoption!.title })}\n\n${text}` : text;
  // The accepted text and the fixed references identify an import across journeys. Draft selections are a separate write.
  const sameSessionImport = refs.some(ref => ref.session_key) ? createHash("sha256").update(JSON.stringify([
    journey.project_id, journey.adoption!.title, journey.adoption!.body,
    refs.map(ref => [ref.label, ref.artifact, ref.parts]),
  ])).digest("hex") : null;
  const summaryRequest = (sameSessionImport ? "sessions:" + sameSessionImport : id) + ":summary";
  const summaryHash = createHash("sha256").update(JSON.stringify({
    title: journey.adoption!.title,
    body: journey.adoption!.body,
    blank: journey.adoption!.blank,
    keep: journey.adoption!.keep ?? [],
  })).digest("hex");
  const summary = (await keepDocuments({
    request_id: summaryRequest,
    request_hash: sameSessionImport ?? summaryHash,
    title: summaryTitle,
    markdown: summaryText,
  })).parts[0]!;
  journey.summary_open = summary.open;
  if (text.trim()) {
    const artifact = await actions.invoke(artifactsActions.importFile, {
      source: "file",
      filename: "summary.md",
      title: summaryTitle.length <= 200 ? summaryTitle : cutHead(summaryTitle, 199) + "…",
      source_id: "onboarding:" + summaryRequest,
      content: text,
    });
    journey.artifact_references.push({ artifact_id: artifact.artifact_id, version: artifact.version });
    handed.push({ version: { artifact_id: artifact.artifact_id, version: artifact.version }, title: summaryTitle });
  }
  return handed;
}

export interface OnboardingHandoffPorts {
  withCatalog: LocalWebCatalogRunner;
  takers?: (kind: OnboardingMaterialKind) => readonly OnboardingTaker[];
  take?: (home: string, projectId: string, definition: ActionDefinition, signal?: AbortSignal) => Promise<BoundActionClient>;
  /** The person's `placement.move` of one object to another partition: the platform carries it through its owner's own actions. */
  move?: (home: string, object: PlacedObject, to: string) => Promise<void>;
}


/**
 * Where a round's drafts are made (batch 108): an existing project's own partition, or for a new project, which does not exist yet, the
 * personal space, where onboarding runs (U11). Adoption moves them into the new project before keeping them (`keepDrafts`).
 */
export function draftPartition(journey: Pick<ContextJourney, "existing" | "project_id">): string {
  return journey.existing ? journey.project_id : PERSONAL_SPACE_PROJECT_ID;
}

/**
 * The folder goes to the plugin the person picked, by that plugin's own declared action, called as the person with its permissions
 * only (batch12-design §7.3, §7.7 C1). Once it answered, a retry does not call it again. Only the folder the person picked goes: when
 * the project's output is no longer it, nothing is handed. A plugin that is gone or refuses does not hold the round: the project and
 * its materials are already made, so the round completes, `take_result.not_taken` says why, and the person lands on the plugin's page.
 */
export async function handToTaker(home: string, journey: ContextJourney, handed: readonly { version: ArtifactReference; title: string }[], ports: OnboardingHandoffPorts): Promise<void> {
  const take = journey.adoption?.take;
  if (!take || journey.take_result) return;
  const done = (result: NonNullable<ContextJourney["take_result"]>) => { journey.take_result = result; withContextJourneys(home, store => store.save(journey)); };
  const notTaken = (why: "unavailable" | "moved" | "refused") => done({ open: null, materials: 0, of: handed.length, not_taken: why });
  const taker = ports.takers?.("code_root").find(one => one.plugin_id === take.plugin_id);
  if (!taker || !ports.take) return notTaken("unavailable");
  const output = await ports.withCatalog({ homeDirectory: home }, catalog => catalog.projectDirectories(journey.project_id).directories.find(folder => folder.roles.includes("output")));
  if (!output || output.canonical_path !== await realpath(take.code_root).catch(() => null)) return notTaken("moved");
  const materials = handed.slice(0, ONBOARDING_TAKE_MATERIALS_MAX).map(item => ({ ref: { subject: { kind: "artifact", id: artifactSubjectId(item.version) }, pin: { mode: "fixed" as const, version: item.version } }, title: item.title.slice(0, 500) }));
  let answered: OnboardingTakeResult;
  try {
    const client = await ports.take(home, journey.project_id, taker.take);
    answered = await client.invoke(taker.take as ActionDefinition<OnboardingCodeRootTake, OnboardingTakeResult>,
      { request_id: `onboarding:${journey.id}:take`, code_root: { workspace_id: output.workspace_id }, materials });
  } catch (error) {
    // A plugin's own refusal is final; a temporary failure or cancellation can be retried and is not called a refusal.
    const refused = error instanceof ActionError && (error.kind === "conflict" || error.kind === "forbidden");
    return notTaken(refused ? "refused" : "unavailable");
  }
  done({ open: answered.open, materials: materials.length, of: handed.length });
}

/**
 * The drafts the person kept, from every batch, go to the drafts taker in the new project; the rest wait there (in Todo's 「待你确认」).
 * Each batch is read again first for its current revision, and each part of a keep goes on from the revision the last one returned, so a
 * retry after a keep that stopped part way does not meet a stale revision; the taker skips a draft already decided. Safe to repeat.
 */
export async function keepDrafts(home: string, journey: ContextJourney, ports: OnboardingHandoffPorts): Promise<void> {
  const keep = new Set(journey.adoption?.keep ?? []), drafts = journey.drafts;
  if (!drafts?.batches.length || !keep.size || drafts.added || !drafts.plugin_id) return;
  const taker = ports.takers?.("drafts").find(one => one.plugin_id === drafts.plugin_id);
  if (!taker?.drafts || !ports.take) throw new Error("起草待办的插件现在不可用，已确认内容仍保留；稍后可以继续保存");
  const from = draftPartition(journey);
  if (from !== journey.project_id) {
    // Drafted in the personal space before the project was made: each batch goes to the project first, as the person's own move. A retry
    // finds a batch already there (`placement.same_location`) and goes on.
    if (!ports.move) throw new Error("起草待办的插件现在不可用，已确认内容仍保留；稍后可以继续保存");
    for (const batch of drafts.batches) {
      await ports.move(home, { kind: taker.drafts.item_kind, id: batch.batch_id, project_id: from }, journey.project_id)
        .catch(error => { if (!(error instanceof ActionError && error.code === "placement.same_location")) throw error; });
    }
  }
  const get = taker.drafts.get as ActionDefinition<OnboardingDraftGetInput, { batches: OnboardingDraftBatch[] }>;
  const keeper = taker.drafts.keep as ActionDefinition<OnboardingDraftKeepInput, { batch: OnboardingDraftBatch }>;
  const reading = await ports.take(home, journey.project_id, get), keeping = await ports.take(home, journey.project_id, keeper);
  const ids = drafts.batches.map(batch => batch.batch_id), latest: OnboardingDraftBatch[] = [];
  for (let start = 0; start < ids.length; start += ONBOARDING_DRAFT_GET_MAX) latest.push(...(await reading.invoke(get, { ids: ids.slice(start, start + ONBOARDING_DRAFT_GET_MAX) })).batches);
  const kept: OnboardingDraftBatch[] = [];
  for (let batch of latest) {
    const chosen = batch.candidates.filter(candidate => keep.has(candidate.candidate_id) && !candidate.decision).map(candidate => candidate.candidate_id);
    for (let start = 0; start < chosen.length; start += ONBOARDING_DRAFT_KEEP_MAX) {
      batch = (await keeping.invoke(keeper, { id: batch.batch_id, expected_revision: batch.revision, keep: chosen.slice(start, start + ONBOARDING_DRAFT_KEEP_MAX) })).batch;
    }
    kept.push(batch);
  }
  drafts.added = kept.flatMap(batch => batch.candidates.flatMap(candidate => keep.has(candidate.candidate_id) && candidate.decision?.item_id ? [candidate.decision.item_id] : []));
}
