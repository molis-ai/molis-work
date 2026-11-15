import { createHash } from "node:crypto";
import { t as uiText } from "@molis-ai/molis-work-plugin-sdk/ui";
import { cutHead } from "@molis-ai/molis-work-plugin-sdk/whole-units";
import { objectLink, type ActionDefinition, type BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ArtifactReference } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { artifactsActions } from "@molis-ai/molis-work-module-artifacts";
import { withContextJourneys, type ContextJourney } from "./context-onboarding-store.js";
import { readStagedText, stagedFilePath } from "./context-onboarding-staging.js";

/** A ProseMirror document as the `pages.documents.*` actions carry it; the journey passes it on without reading into it. */
export type ProseDocument = { readonly type: "doc"; readonly content?: readonly unknown[] };
type PageBody = (markdown: string) => Promise<ProseDocument>;
type PagesImport = { request_id: string; request_hash: string; documents: { title: string; body: ProseDocument }[] };
const PAGES_PLUGIN_ID = "io.molis.work.pages";
const PAGE_PART_CHARS = 400_000;
const PAGE_BODY_MAX = 1_400_000;

function partEndByUnits(text: string, offset: number, size: number): number {
  let end = Math.min(offset + size, text.length);
  const line = end < text.length ? text.lastIndexOf("\n", end - 1) : -1;
  if (line >= offset + size / 2) end = line + 1;
  else end = cutHead(text, end).length;
  return end;
}

function splitUnits(text: string, size: number): string[] {
  const parts: string[] = [];
  for (let offset = 0; offset < text.length;) {
    const end = partEndByUnits(text, offset, size);
    parts.push(text.slice(offset, end));
    offset = end;
  }
  return parts;
}

function formatPartTitle(title: string, part: number, parts: number, max: number): string {
  const suffix = parts > 1 ? uiText.text("workbench.context-onboarding-service.part-k-n", { k: part, n: parts }) : "";
  const characters = [...title], room = max - [...suffix].length;
  return (characters.length <= room ? title : characters.slice(0, room - 1).join("") + "…") + suffix;
}

async function* pageParts(pageBody: PageBody, text: string): AsyncGenerator<ProseDocument> {
  for (const part of splitUnits(text, PAGE_PART_CHARS)) {
    let body: ProseDocument | null = null;
    try { body = await pageBody(part); }
    catch (error) { if ((error as { code?: unknown }).code !== "pages.body_too_large" || part.length < 2) throw error; }
    if (body && (part.length < 2 || JSON.stringify(body).length <= PAGE_BODY_MAX)) { yield body; continue; }
    const half = cutHead(part, Math.ceil(part.length / 2)).length;
    yield* pageParts(pageBody, part.slice(0, half));
    yield* pageParts(pageBody, part.slice(half));
  }
}

export async function importAdoptedMaterialsAndSummary(options: {
  readonly home: string;
  readonly id: string;
  readonly journey: ContextJourney;
  readonly actions: BoundActionClient & { forOriginal(path: string): Promise<BoundActionClient> };
  readonly shipped: <I, O>(actions: BoundActionClient, capability_id: string, version: number, provider_id: string) => Promise<ActionDefinition<I, O>>;
}): Promise<{ version: ArtifactReference; title: string }[]> {
  const { home, id, journey, actions, shipped } = options;
  const fromMarkdown = await shipped<{ markdown: string }, { body: ProseDocument }>(
    actions,
    "pages.documents.body_from_markdown",
    /* @version action.pages.documents.body_from_markdown */ 1,
    PAGES_PLUGIN_ID,
  );
  const importDocuments = await shipped<PagesImport, { documents: { id: string }[] }>(
    actions,
    "pages.documents.import",
    /* @version action.pages.documents.import */ 1,
    PAGES_PLUGIN_ID,
  );
  const pageBody: PageBody = async markdown => (await actions.invoke(fromMarkdown, { markdown })).body;
  const handed: { version: ArtifactReference; title: string }[] = [];
  const refs = journey.adoption!.blank
    ? []
    : journey.summary?.references ?? journey.sources.filter(s => s.selected).flatMap(s => (s.references ?? []).filter(r => !r.duplicate_of));
  if (!journey.summary) refs.forEach((ref, index) => { ref.label = "S" + (index + 1); });
  journey.artifact_references = refs.flatMap(ref => ref.artifact ? [ref.artifact] : []);
  for (const ref of refs) {
    if (!ref.artifact) {
      const content = await readStagedText(home, id, ref.text);
      const registered = ref.secret_mode === "strip"
        ? await actions.invoke(artifactsActions.importFile, {
            source: "file",
            filename: "material.md",
            title: ref.title,
            source_id: "onboarding:" + id + ":" + ref.source_id,
            content,
          })
        : await (await actions.forOriginal(await stagedFilePath(home, id, ref.original.sha256))).invoke(artifactsActions.importFile, {
            source: "file",
            filename: "material.md",
            title: ref.title,
            source_id: "onboarding:" + id + ":" + ref.source_id,
            content,
            original_file: { filename: ref.original.filename, mime: ref.original.mime },
          });
      ref.artifact = { artifact_id: registered.artifact_id, version: registered.version };
      journey.artifact_references.push(ref.artifact);
      withContextJourneys(home, store => store.save(journey));
    }
    if (!ref.documents) {
      const parts: ProseDocument[] = [], documents: string[] = [];
      for await (const body of pageParts(pageBody, `原标题：${ref.title}\n\n来源：${ref.path} · 版本 ${ref.version}\n\n${await readStagedText(home, id, ref.text)}`)) parts.push(body);
      for (const [index, body] of parts.entries()) {
        documents.push((await actions.invoke(importDocuments, {
          request_id: id + ":sources:" + ref.label + (parts.length > 1 ? ":" + (index + 1) : ""),
          request_hash: id,
          documents: [{ title: formatPartTitle(`[${ref.label}] ${ref.title}`, index + 1, parts.length, 80), body }],
        })).documents[0]!.id);
      }
      ref.documents = documents;
      ref.adopted = true;
      withContextJourneys(home, store => store.save(journey));
    } else {
      ref.adopted = true;
    }
    if (ref.artifact) handed.push({ version: ref.artifact, title: ref.title });
  }
  const sources = refs.map(r => `[${r.label}] [${r.title.replace(/[\[\]]/gu, "")}](${objectLink(journey.project_id, { surface: "pages", id: r.documents![0]!, title: r.title })}) · ${r.path} · 版本 ${r.version}`).join("\n\n");
  const text = journey.adoption!.body + (sources ? "\n\n## " + uiText.text("workbench.context-onboarding-service.sources") + "\n\n" + sources : "");
  const summaryTitle = uiText.text("workbench.context-onboarding-service.title-work-summary", { title: journey.adoption!.title });
  const summaryText = [...summaryTitle].length > 80 ? `${uiText.text("workbench.context-onboarding-service.project-title", { title: journey.adoption!.title })}\n\n${text}` : text;
  const summaryHash = createHash("sha256").update(JSON.stringify({
    title: journey.adoption!.title,
    body: journey.adoption!.body,
    blank: journey.adoption!.blank,
    todo_selected: journey.adoption!.todo_selected ?? [],
  })).digest("hex");
  const summary = (await actions.invoke(importDocuments, {
    request_id: id + ":summary",
    request_hash: summaryHash,
    documents: [{ title: formatPartTitle(summaryTitle, 1, 1, 80), body: summaryText ? await pageBody(summaryText) : { type: "doc", content: [{ type: "paragraph" }] } }],
  })).documents[0]!;
  journey.document_id = summary.id;
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
