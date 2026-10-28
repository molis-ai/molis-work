import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { artifactsActions, ARTIFACTS_PROVIDER_ID } from "@molis-ai/molis-work-module-artifacts";
import { artifactSubjectId } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { CHARACTER_ARTIFACT_PRODUCER, CHARACTER_ARTIFACT_TYPE, parseCharacterContent } from "@molis-ai/molis-work-contracts/modules/characters";
import { actionSourceIdentity, isSearchEntriesSource } from "@molis-ai/molis-work-contracts/platform/actions";
import { knowledgeActions, knowledgeManageActions } from "@molis-ai/molis-work-contracts/services/knowledge";
import { searchActions, searchSourceKey } from "@molis-ai/molis-work-contracts/services/search";
import { cardFor } from "@molis-ai/molis-work-service-knowledge";
import { openKnowledgeCards } from "@molis-ai/molis-work-storage";

// Two real application processes share only stopped, persisted stores and the original person's decisions.
// The legacy-card setup is a fixture; PDF extraction, Artifact lifecycle, adoption and reads use their production owners.
const [root, stage] = process.argv.slice(2), homeDirectory = join(root, "home"), statePath = join(root, "adoption.json");
let networkCalls = 0;
globalThis.fetch = async () => { networkCalls++; throw new Error("This isolated adoption must not send network requests"); };

// The same minimal text-layer PDF format used by artifact-document-import.test.ts, including real xref offsets.
function pdfWith(lines) {
  const stream = `BT /F1 14 Tf 72 720 Td 18 TL ${lines.map(line => `(${line}) '`).join(" ")} ET`;
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"];
  let body = "%PDF-1.4\n";
  const offsets = [];
  objects.forEach((object, index) => { offsets.push(body.length); body += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}`
    + `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

const saved = stage === "reopen" ? JSON.parse(await readFile(statePath, "utf8")) : null;
const project = saved?.project ?? await withMolisWorkProjectCatalog({ homeDirectory }, catalog =>
  catalog.createProject({ display_name: "系统资料采用", actor_id: "web-user" }));
const host = new MolisWorkLocalHost({ homeDirectory, completeText: null });
const cards = openKnowledgeCards({ homeDirectory });
try {
  const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
  const owner = await host.withProject(reference, runtime => runtime.artifacts), client = host.actionClient(reference);
  const caller = await host.localPersonContext(reference);
  const invoke = (action, input) => client.invoke(caller, action, input);
  const current = subject => cards.get(project.project_id, subject);
  const receipts = () => cards.receipts(project.project_id, { limit: 100, offset: 0 });
  const rebuild = () => invoke(searchActions.rebuild, { scope: "project" });
  const preview = subject => invoke(knowledgeManageActions.bindPreview, { subject });
  const bind = decision => invoke(knowledgeManageActions.bind, decision);
  const list = () => invoke(knowledgeActions.list, {});
  const read = subject => invoke(knowledgeActions.read, { subject });
  const decisionFor = async (subject, operation_id) => {
    const original = current(subject), result = await preview(subject);
    assert.equal(result.candidates.length, 1);
    const candidate = result.candidates[0];
    assert.equal(candidate.source_identity.kind, "project-data");
    assert.deepEqual(current(subject), original, "preview leaves every old card field intact");
    return { subject, operation_id, provider_id: candidate.provider_id, source_key: candidate.source_key,
      source_identity: candidate.source_identity, source_revision: candidate.source_revision };
  };
  const assertFields = (card, original) => {
    // Binding may replace the selected source and its adoption state, but every other old card field belongs to its owner.
    const changes = new Set(["provider_id", "source_key", "retention", "adoption", "revision", "state", "can_organize", "content_policy"]);
    const preserved = value => Object.fromEntries(Object.entries(value).filter(([key]) => !changes.has(key)));
    assert.deepEqual(preserved(card), preserved(original), "adoption preserves every field outside its explicit source/state changes");
  };
  const assertUsable = async (pdf, summary, decisions) => {
    const visible = await list();
    for (const subject of [pdf, summary]) {
      const entry = visible.pieces.find(piece => piece.subject.id === subject.id);
      assert.ok(entry);
      assert.equal(entry.brief, null, "unaccepted old machine words are never exposed as current");
      assert.deepEqual(entry.keywords, ["本人保留关键词"]);
    }
    const before = receipts(), body = await read(pdf);
    assert.match(body.text, /The beta pass code is MW-0042\./u);
    assert.equal(body.revision, decisions[0].source_revision);
    assert.equal(receipts().total, before.total + 1);
    const afterPdf = receipts();
    assert.deepEqual(afterPdf.receipts.slice(1), before.receipts, "a new successful read appends without replacing any original receipt");
    assert.equal(current(summary).content_policy, "summary");
    assert.equal(current(summary).can_organize, false);
    await assert.rejects(read(summary), { code: "knowledge.unreadable" }, "summary-only is listed, never relabelled as readable original text");
    assert.deepEqual(receipts(), afterPdf, "an unavailable summary body adds no read receipt");
    return body;
  };

  if (stage === "adopt") {
    const bytes = pdfWith(["Quarterly review notes", "The beta pass code is MW-0042."]);
    const imported = await invoke(artifactsActions.importFile, { source: "file", filename: "review.pdf",
      original_file: { filename: "review.pdf", mime: "application/pdf", data_base64: bytes.toString("base64") } });
    const pdfRecord = owner.query.getArtifactVersion(project.project_id, imported);
    assert.deepEqual(Buffer.from(pdfRecord.payload.original_file.data_base64, "base64"), bytes);
    assert.match(pdfRecord.payload.content, /The beta pass code is MW-0042\./u);
    const pdf = { kind: "artifact", id: artifactSubjectId(imported) };
    await rebuild();
    const originalRead = await read(pdf), originalReceipts = receipts();
    assert.match(originalRead.text, /The beta pass code is MW-0042\./u);
    assert.equal(originalReceipts.total, 1, "the real Knowledge read creates one receipt before any legacy card is installed");
    assert.deepEqual(originalReceipts.receipts[0].subject, pdf);
    assert.equal(originalReceipts.receipts[0].revision, originalRead.revision);
    assert.equal(originalReceipts.receipts[0].via, "read");
    assert.equal(originalReceipts.receipts[0].chars, originalRead.text.length);
    assert.equal(originalReceipts.receipts[0].actor_id, caller.actor_id);
    const publishSummary = version => owner.commands.registerVersion({ project_id: project.project_id, actor_id: caller.actor_id,
      artifact_id: "retained-summary", version, artifact_type_id: CHARACTER_ARTIFACT_TYPE, schema_version: 1,
      producer: { plugin_id: CHARACTER_ARTIFACT_PRODUCER.plugin_id, plugin_version: "1.0.0", binding_signature: CHARACTER_ARTIFACT_PRODUCER.binding_signature },
      title: "保留的角色成果", media_type: "application/json", origin: { kind: "pinned", subject: { kind: "character", id: "summary-character" }, revision: String(version) },
      content: { kind: "inline", payload: parseCharacterContent({ character_id: "summary-character", title: "保留的角色成果",
        instructions: `Only use reviewed project material, revision ${version}.`, host_tools: [], source: { owner_actor_id: caller.actor_id, draft_revision: version } }) } }).artifact;
    const retain = async record => {
      await rebuild();
      const subject = { kind: "artifact", id: artifactSubjectId(record) };
      const views = await client.discover(caller), source = views.find(view => view.provider.provider_id === ARTIFACTS_PROVIDER_ID && isSearchEntriesSource(view.action));
      assert.ok(source);
      const entries = await invoke(artifactsActions.searchEntries, { cursor: null, limit: 50 });
      const entry = entries.entries.find(item => item.subject.id === subject.id); assert.ok(entry);
      const context = entry.content === "context" ? await invoke(artifactsActions.subject, { subject_id: subject.id }) : null;
      const original = { ...cardFor(project.project_id, { subject, source_key: searchSourceKey({ project_id: project.project_id,
        provider_id: source.provider.provider_id, capability_id: source.capability_id, version: source.version }), provider_id: source.provider.provider_id,
        plugin_id: source.provider.provider_id, plugin_title: source.provider.title, revision: context?.revision ?? entry.revision,
        title: entry.title, summary: entry.summary, content: context?.content ?? "", content_policy: entry.content, updated_at: entry.updated_at, open: entry.open }),
        title: "本人保留标题 " + subject.id, brief: "OldMachineOnly", keywords: ["本人保留关键词"], edited: ["title", "keywords"],
        outline: [{ anchor: "old", title: "旧分节", summary: "OldMachineSection" }], suggestion: { brief: "OldMachineSuggestion" },
        state: "ready", organized_revision: "old-machine-version", organized_at: "2026-10-01T10:00:00.000Z",
        updated_at: "2026-09-30T09:00:00.000Z", error: "Old retained diagnostic",
        retention: { source_identity: null, restoration_operation_id: null } };
      assert.ok(original.open?.surface && original.open?.id, "the legacy card has an original nonempty open target to preserve");
      cards.put(original);
      assert.equal(actionSourceIdentity(source.provider, project.project_id).kind, "project-data");
      return { subject, original };
    };
    const originalPdf = await retain(imported);
    const archived = publishSummary(1), first = await retain(archived);
    owner.commands.archiveVersion({ project_id: project.project_id, artifact_id: archived.artifact_id, version: archived.version, actor_id: caller.actor_id });
    const beforeArchive = receipts();
    // Leave Search stale: an archive completed before capture must be caught by the original owner, not command activity.
    assert.deepEqual((await preview(first.subject)).candidates, []);
    assert.deepEqual(current(first.subject), first.original);
    assert.equal((await list()).pieces.some(piece => piece.subject.id === first.subject.id), false);
    assert.deepEqual(receipts(), beforeArchive);

    const second = await retain(publishSummary(2));
    const staleDecision = await decisionFor(second.subject, "summary-before-new-version");
    const newest = publishSummary(3); await rebuild();
    const beforeConflict = receipts();
    await assert.rejects(bind(staleDecision), { code: "actions.subject_unavailable" });
    assert.deepEqual(current(second.subject), second.original, "a newer fixed version cannot bless an old preview");
    assert.deepEqual(receipts(), beforeConflict);

    const summary = await retain(newest), subjects = [pdf, summary.subject];
    const originals = [originalPdf.original, summary.original];
    const decisions = [await decisionFor(pdf, "pdf-original-decision"), await decisionFor(summary.subject, "summary-original-decision")];
    const beforeBind = receipts();
    assert.deepEqual(beforeBind, originalReceipts, "the original real read receipt remains intact before first confirmation");
    for (const [index, decision] of decisions.entries()) {
      const adopted = await bind(decision); assertFields(adopted, originals[index]);
      assert.deepEqual(adopted.adoption.source_identity, decision.source_identity);
      assert.equal(adopted.adoption.source_revision, decision.source_revision);
      assert.deepEqual(await bind(decision), adopted);
    }
    assert.deepEqual(receipts(), beforeBind, "preview, confirmation and original-decision replay add no body receipt");
    const body = await assertUsable(pdf, summary.subject, decisions);
    await writeFile(statePath, JSON.stringify({ project, subjects, decisions, body, records: subjects.map(current), receipts: receipts(),
      rejected: [first, second] }));
  } else {
    assert.equal(stage, "reopen");
    for (const [index, subject] of saved.subjects.entries()) assert.deepEqual(current(subject), saved.records[index], "new process opens the exact persisted card");
    assert.deepEqual(receipts(), saved.receipts);
    await rebuild();
    for (const [index, decision] of saved.decisions.entries()) {
      const refreshed = await decisionFor(decision.subject, decision.operation_id);
      assert.deepEqual(refreshed, decision, "the durable project instance and precise versions survive process restart");
      assert.deepEqual(await bind(decision), saved.records[index]);
    }
    assert.deepEqual(receipts(), saved.receipts);
    const body = await assertUsable(saved.subjects[0], saved.subjects[1], saved.decisions);
    assert.equal(body.text, saved.body.text);
    for (const rejected of saved.rejected) assert.deepEqual(current(rejected.subject), rejected.original);
  }
  assert.equal(networkCalls, 0);
} finally {
  await host.close();
  cards.close();
}
process.send?.({ pid: process.pid, networkCalls });
