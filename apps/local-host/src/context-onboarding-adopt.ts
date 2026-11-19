import { createHash } from "node:crypto";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { cutHead } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import { objectLink, type ActionDefinition, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { OnboardingDocumentsInput, OnboardingDocumentsResult } from "@molis-ai/molis-work-contracts/platform/plugin-onboarding";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { artifactsActions } from "@molis-ai/molis-work-module-artifacts";
import { withContextJourneys, type ContextJourney } from "./context-onboarding-store.js";
import { readStagedText, stagedFilePath } from "./context-onboarding-staging.js";

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
  // Frozen: the keys of a summary import already kept (`todo_selected` though the field is `keep` now), so a journey that was adopting or
  // failed before version 2 retries with the hash it was first kept under, never `changed` (contract-design §2.5).
  const summaryHash = createHash("sha256").update(JSON.stringify({
    title: journey.adoption!.title,
    body: journey.adoption!.body,
    blank: journey.adoption!.blank,
    todo_selected: journey.adoption!.keep ?? [],
  })).digest("hex");
  const summary = (await keepDocuments({ request_id: id + ":summary", request_hash: summaryHash, title: summaryTitle, markdown: summaryText })).parts[0]!;
  journey.summary_open = summary.open;
  if (text.trim()) {
    const artifact = await actions.invoke(artifactsActions.importFile, {
      source: "file",
      filename: "summary.md",
      title: summaryTitle.length <= 200 ? summaryTitle : cutHead(summaryTitle, 199) + "…",
      source_id: "onboarding:" + id + ":summary",
      content: text,
    });
    journey.artifact_references.push({ artifact_id: artifact.artifact_id, version: artifact.version });
    handed.push({ version: { artifact_id: artifact.artifact_id, version: artifact.version }, title: summaryTitle });
  }
  return handed;
}
