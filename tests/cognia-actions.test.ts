import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { COGNIA_ACTIONS, COGNIA_ACTION_PERMISSIONS, cogniaActions as actions, openCogniaStore } from "@molis-ai/molis-work-plugin-cognia";
import { MolisWorkLocalHost } from "../apps/local-host/src/project-host.js";
import type { HostCompleteText } from "../apps/local-host/src/host-complete-text.js";
function fixture(t: { after(fn: () => Promise<void>): void }, completeText: HostCompleteText | null = null) {
  const home = mkdtempSync(join(tmpdir(), "cognia-actions-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText });
  const caller: ActionCallContext = { actor_id: "knowledge-owner", project_id: null, audience: "user", permissions: COGNIA_ACTION_PERMISSIONS };
  const service = host.homeActionClient(), bound = bindActionClient(service, () => caller);
  t.after(async () => { await host.close(); rmSync(home, { recursive: true, force: true }); });
  const read = () => bound.invoke(actions.workspace, {});
  return { home, host, caller, service, bound, read };
}
const file = (path: string, text: string) => ({ path, data: Buffer.from(text).toString("base64") });

test("Cognia Home capabilities are discovered without UI/project; grants and separate Homes constrain actual calls", async t => {
  const f = fixture(t), other = fixture(t);
  const directory = await f.bound.discover();
  for (const definition of COGNIA_ACTIONS) assert.ok(directory.some(d => d.capability_id === definition.capability_id));
  assert.equal(directory.find(d => d.capability_id === actions.synthesize.capability_id)!.availability.available, false);
  const readonly = bindActionClient(f.service, () => ({ ...f.caller, audience: "mcp", permissions: ["cognia:read"] }));
  assert.ok((await readonly.discover()).every(d => !d.capability_id.startsWith("cognia.") || d.operation === "query" && d.capability_id !== actions.scan.capability_id));
  await assert.rejects(readonly.invoke(actions.createMaterial, { title: "denied", body: "private" }), { code: "actions.forbidden" });
  await assert.rejects(readonly.invoke(actions.scan, { path: f.home }), { code: "actions.forbidden" });
  const { material } = await f.bound.invoke(actions.createMaterial, { title: "Stored", body: "Original Home data" });
  assert.equal((await readonly.invoke(actions.read, { id: material.id })).material.body, "Original Home data");
  assert.equal((await other.read()).materials.length, 0);
  await assert.rejects(f.service.invoke(f.caller, actions.createMaterial, { title: "spoof", body: "x", actor_id: "other" }), { code: "actions.input_invalid" });
  await assert.rejects(f.bound.invoke(actions.read, { id: material.id, revision: 0 }), { code: "actions.input_invalid" });
  await f.host.close(); const reopened = new MolisWorkLocalHost({ homeDirectory: f.home, completeText: null });
  try { assert.equal((await bindActionClient(reopened.homeActionClient(), () => f.caller).invoke(actions.read, { id: material.id })).material.body, "Original Home data"); }
  finally { await reopened.close(); }
});

test("uploaded and directory imports use original preview receipts, bytes and fixed versions; filesystem authority is separate", async t => {
  const f = fixture(t);
  const uploaded = bindActionClient(f.service, () => ({ ...f.caller, permissions: ["cognia:read", "cognia:write"] }));
  const { domain } = await f.bound.invoke(actions.createDomain, { name: "资料" });
  const input = { kind: "markdown" as const, name: "Upload", domain_id: domain.id, files: [file("source.md", "# Source\nEvidence"), file("active.svg", '<svg onload="alert(1)"></svg>')] };
  const { preview } = await uploaded.invoke(actions.preview, input);
  assert.equal((await f.read()).materials.length, 0);
  const [a, b] = await Promise.all([uploaded.invoke(actions.commit, { preview_id: preview.id }), uploaded.invoke(actions.commit, { preview_id: preview.id })]);
  assert.deepEqual(a, b); assert.equal(a.receipt.added, 2);
  const material = (await f.read()).materials.find(m => m.path === "source.md")!;
  const svg = (await f.read()).materials.find(m => m.path === "active.svg")!;
  assert.equal(Buffer.from((await uploaded.invoke(actions.download, { id: svg.id })).data, "base64").toString(), '<svg onload="alert(1)"></svg>');
  const next = await uploaded.invoke(actions.preview, { ...input, source_id: a.receipt.source_id, files: [file("source.md", "Changed")] });
  await uploaded.invoke(actions.commit, { preview_id: next.preview.id });
  assert.equal((await uploaded.invoke(actions.read, { id: material.id })).material.revision, 2);
  assert.match((await uploaded.invoke(actions.read, { id: material.id, revision: 1 })).material.body, /Evidence/);
  await f.bound.invoke(actions.updateSource, { id: a.receipt.source_id, name: "Renamed" });
  assert.equal((await f.read()).sources.find(s => s.id === a.receipt.source_id)!.name, "Renamed");
  const vault = join(f.home, "vault"); mkdirSync(vault); writeFileSync(join(vault, "local.md"), "Local evidence"); symlinkSync(join(vault, "local.md"), join(vault, "alias.md"));
  await assert.rejects(uploaded.invoke(actions.previewDirectory, { path: vault, kind: "markdown" }), { code: "actions.forbidden" });
  const scanned = await f.bound.invoke(actions.scan, { path: vault });
  assert.equal(scanned.files.find(row => row.path === "alias.md")!.data, undefined);
  assert.equal(Buffer.from(scanned.files.find(row => row.path === "local.md")!.data!, "base64").toString(), "Local evidence");
  const local = await f.bound.invoke(actions.previewDirectory, { path: vault, kind: "markdown" });
  assert.equal((await f.bound.invoke(actions.commit, { preview_id: local.preview.id })).receipt.added, 1);
  await assert.rejects(f.bound.invoke(actions.scan, { path: "relative" }), /绝对/);
  await f.bound.invoke(actions.deleteSource, { id: a.receipt.source_id });
  assert.ok(!(await f.read()).materials.some(m => m.id === material.id));
  assert.equal((await f.bound.invoke(actions.read, { id: material.id, revision: 2 })).material.body, "Changed");
});

test("conflicting previews roll back all files, cancellation removes preview, and domain deletion retains versioned evidence", async t => {
  const f = fixture(t);
  const { domain } = await f.bound.invoke(actions.createDomain, { name: "旧领域" });
  await f.bound.invoke(actions.updateDomain, { id: domain.id, name: "新领域" });
  const importInput = { kind: "markdown" as const, name: "Local", locator: "local:/test", domain_id: domain.id, files: [file("a.md", "original")] };
  const first = await f.bound.invoke(actions.preview, importInput); const committed = await f.bound.invoke(actions.commit, { preview_id: first.preview.id });
  const stale = await f.bound.invoke(actions.preview, { ...importInput, files: [file("new.md", "must roll back"), file("a.md", "stale")] });
  const next = await f.bound.invoke(actions.preview, { ...importInput, files: [file("a.md", "latest")] });
  await f.bound.invoke(actions.commit, { preview_id: next.preview.id });
  await assert.rejects(f.bound.invoke(actions.commit, { preview_id: stale.preview.id }), { code: "cognia.conflict" });
  assert.equal((await f.read()).materials.length, 1);
  await f.bound.invoke(actions.cancel, { preview_id: stale.preview.id });
  await assert.rejects(f.bound.invoke(actions.commit, { preview_id: stale.preview.id }), { code: "cognia.not_found" });
  await f.bound.invoke(actions.deleteDomain, { id: domain.id });
  const id = committed.receipt.material_ids[0]!;
  assert.equal((await f.bound.invoke(actions.read, { id })).material.domain_id, null);
  assert.equal((await f.bound.invoke(actions.read, { id, revision: 1 })).material.domain_id, domain.id);
});

test("model wait permits real edits; generated draft uses selected fixed snapshots and explicit save keeps original citations", { timeout: 10_000 }, async t => {
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<string>();
  const f = fixture(t, async prompt => { assert.match(prompt, /Original evidence/); assert.doesNotMatch(prompt, /UNSELECTED/); started.resolve(); return release.promise; });
  const { material } = await f.bound.invoke(actions.createMaterial, { title: "Source", body: "Original evidence" });
  await f.bound.invoke(actions.createMaterial, { title: "Private", body: "UNSELECTED" });
  const pending = f.bound.invoke(actions.synthesize, { material_ids: [material.id] });
  await started.promise;
  await f.bound.invoke(actions.updateMaterial, { id: material.id, title: "Changed title", body: "Latest evidence" });
  assert.equal((await f.read()).drafts.length, 0);
  release.resolve("# Finding\nSelected evidence [S1]");
  const { draft } = await pending;
  assert.equal(draft.references[0]!.revision, 1); assert.equal(draft.references[0]!.body, "Original evidence");
  assert.equal((await f.bound.invoke(actions.draft, { id: draft.id })).draft.id, draft.id);
  const saved = await f.bound.invoke(actions.saveDraft, { id: draft.id });
  assert.equal((await f.bound.invoke(actions.saveDraft, { id: draft.id })).material.id, saved.material.id);
  await f.bound.invoke(actions.archiveDraft, { id: draft.id });
  assert.equal((await f.read()).drafts.length, 0);
  assert.equal((await f.bound.invoke(actions.read, { id: saved.material.id })).references[0]!.revision, 1);
  await f.bound.invoke(actions.deleteMaterial, { id: material.id });
  assert.equal((await f.bound.invoke(actions.read, { id: material.id, revision: 1 })).material.body, "Original evidence");
});

test("domain deleted during generation cannot reappear as a dangling draft classification", { timeout: 10_000 }, async t => {
  const started = Promise.withResolvers<void>(), release = Promise.withResolvers<string>();
  const f = fixture(t, async () => { started.resolve(); return release.promise; });
  const { domain } = await f.bound.invoke(actions.createDomain, { name: "Delete while awaiting" });
  const { material } = await f.bound.invoke(actions.createMaterial, { title: "Source", body: "Evidence", domain_id: domain.id });
  const pending = f.bound.invoke(actions.synthesize, { material_ids: [material.id] }); const rejected = assert.rejects(pending, { code: "cognia.not_found" });
  await started.promise; await f.bound.invoke(actions.deleteDomain, { id: domain.id });
  release.resolve("# Finding\nEvidence [S1]"); await rejected;
  assert.equal((await f.read()).drafts.length, 0); assert.equal((await f.read()).domains.length, 0);
});

test("query filters evidence by domain; failure, cancellation and invalid citations never persist a draft", async t => {
  let output = "# Good\nEvidence [S1]", calls = 0;
  const f = fixture(t, async prompt => { calls++; assert.doesNotMatch(prompt, /OTHER_DOMAIN/); return output; });
  const { domain } = await f.bound.invoke(actions.createDomain, { name: "selected" });
  await f.bound.invoke(actions.createMaterial, { title: "知识导入", body: "保留原文和来源", domain_id: domain.id });
  await f.bound.invoke(actions.createMaterial, { title: "知识导入", body: "OTHER_DOMAIN" });
  const queried = await f.bound.invoke(actions.query, { question: "知识导入有什么原则", domain_id: domain.id });
  assert.equal(queried.draft.references.length, 1);
  await assert.rejects(f.bound.invoke(actions.query, { question: "火星冰川" }), /没有找到/); assert.equal(calls, 1);
  output = "# Wrong\n[S9]"; await assert.rejects(f.bound.invoke(actions.query, { question: "知识导入", domain_id: domain.id }), /引用/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(f.service.invoke({ ...f.caller, signal: controller.signal }, actions.query, { question: "知识导入", domain_id: domain.id }));
  assert.equal((await f.read()).drafts.length, 1);
  const store = openCogniaStore(f.home); try { assert.equal(store.drafts().length, 1); } finally { store.close(); }
});


test("explicit material versions select what the user saw, including deleted current records, and reject ambiguous selections", async t => {
  const f = fixture(t, async prompt => { assert.match(prompt, /Historical evidence/); assert.doesNotMatch(prompt, /Latest evidence/); return "# Historical answer\nSource at the selected revision [S1]"; });
  const { material } = await f.bound.invoke(actions.createMaterial, { title: "Source", body: "Historical evidence" });
  await f.bound.invoke(actions.updateMaterial, { id: material.id, title: "Source", body: "Latest evidence" });
  const material_refs = [{ id: material.id, revision: 1 }];
  await f.bound.invoke(actions.deleteMaterial, { id: material.id });
  const { draft } = await f.bound.invoke(actions.synthesize, { material_refs });
  assert.equal(draft.references[0]!.revision, 1); assert.equal(draft.references[0]!.body, "Historical evidence");
  for (const input of [{}, { material_refs, material_ids: [material.id] }, { material_refs: [...material_refs, ...material_refs] }, { material_refs: [{ id: material.id, revision: 0 }] }]) {
    await assert.rejects(f.bound.invoke(actions.synthesize, input), { code: "actions.input_invalid" });
  }
});
