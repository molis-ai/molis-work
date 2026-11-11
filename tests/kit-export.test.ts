import assert from "node:assert/strict";
import test from "node:test";
import type { PromptOverridesFile } from "@molis-ai/molis-work-contracts/services/agent-definitions";
import type { PluginPackageExport } from "@molis-ai/molis-work-contracts/services/kit";
import { pluginPackageExport, promptOverrideActions } from "@molis-ai/molis-work-app-local-host";
import { CONTENT_PLUGIN_ID, signedContentPackage } from "./fixtures/content-package.js";
import { kitHost } from "./fixtures/kit-host.js";
import { newPublisher } from "./fixtures/sandbox-package.js";

// 「导出这个包」 (specs/capability-pack/contract-design.md §4.9, CPK-06): a content package exactly as kept, installed again elsewhere with the
// same version and signer; the person's prompt edits out to a file and back row by row.

const rejects = (code: string, extra?: (error: { details?: Record<string, unknown> }) => boolean) => (error: unknown) =>
  (error as { code?: string }).code === code && (!extra || extra(error as { details?: Record<string, unknown> }));

test("CPK-06: a content package exports as kept and installs in another Home with the same version and signer; a built-in plugin has no package", { timeout: 180_000 }, async t => {
  const a = await kitHost(t), b = await kitHost(t), publisher = newPublisher(), bundle = signedContentPackage(publisher);
  await a.install(bundle);
  const packs = (await a.kit()).packs, content = packs.find(pack => pack.source?.plugin_id === CONTENT_PLUGIN_ID)!;
  assert.equal(content.export.package, true);
  const file = await a.invoke<PluginPackageExport>(pluginPackageExport, { install_id: content.source!.install_id });
  assert.equal(file.publisher_key_id, publisher.identity, "never re-signed: the third party's key stays");
  assert.deepEqual(JSON.parse(file.content), bundle, "the bundle as installed");
  const installed = await b.install(JSON.parse(file.content));
  assert.deepEqual([installed.plugin_id, installed.version, installed.publisher_key_id], [file.plugin_id, file.version, publisher.identity]);
  const coding = packs.find(pack => pack.source?.plugin_id === "io.molis.work.coding")!;
  assert.equal(coding.export.package, false);
  await assert.rejects(a.invoke(pluginPackageExport, { install_id: coding.source!.install_id }), rejects("plugin.export_unavailable", error => error.details?.reason === "host_build"));
});

test("CPK-06: prompt edits go out to a file and back row by row; a file on another default is shown, not applied", { timeout: 120_000 }, async t => {
  const h = await kitHost(t);
  const empty = await h.invoke<PromptOverridesFile>(promptOverrideActions.export, {});
  assert.deepEqual(empty.overrides, [], "nothing edited yet");
  const prompt = (await h.kit()).entries.find(entry => entry.kind === "prompt")!;
  if (prompt.kind !== "prompt") throw new Error("no prompt");
  const fileOf = (base_version: number, body: string): PromptOverridesFile => ({ format: "molis.prompt-overrides", format_version: 1, exported_at: new Date().toISOString(),
    overrides: [{ ...prompt.ref, title: "文件里的标题", base_version, body }] });
  type Preview = { preview_id: string; rows: Array<{ row_id: string; status: string; title: string; default_version: number | null; diff: { rows: unknown[] } }> };
  const stale = await h.invoke<Preview>(promptOverrideActions.preview, { file: fileOf(9999, "改过的正文") });
  assert.equal(stale.rows[0]!.status, "base_mismatch");
  assert.notEqual(stale.rows[0]!.title, "文件里的标题", "the register's title, not the file's");
  await assert.rejects(h.invoke(promptOverrideActions.confirm, { preview_id: stale.preview_id, row_ids: [stale.rows[0]!.row_id] }), rejects("agent_definitions.overrides_row_not_applicable"));
  const fresh = await h.invoke<Preview>(promptOverrideActions.preview, { file: fileOf(stale.rows[0]!.default_version!, "改过的正文") });
  assert.equal(fresh.rows[0]!.status, "applicable");
  assert.ok(fresh.rows[0]!.diff.rows.length > 0);
  const done = await h.invoke<{ applied: Array<{ key: string; revision: number }> }>(promptOverrideActions.confirm, { preview_id: fresh.preview_id, row_ids: [fresh.rows[0]!.row_id] });
  assert.deepEqual(done.applied.map(row => row.key), [`${prompt.ref.owner_id}/${prompt.ref.prompt_id}`]);
  const out = await h.invoke<PromptOverridesFile>(promptOverrideActions.export, {});
  assert.deepEqual(out.overrides.map(row => [row.owner_id, row.prompt_id, row.body]), [[prompt.ref.owner_id, prompt.ref.prompt_id, "改过的正文"]]);
  const again = await h.invoke<Preview>(promptOverrideActions.preview, { file: out });
  assert.equal(again.rows[0]!.status, "same");
});
