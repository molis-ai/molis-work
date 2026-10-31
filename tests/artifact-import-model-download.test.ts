import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference, resolveWebControlToken } from "@molis-ai/molis-work-app-local-host";
import type { ActionAudience } from "@molis-ai/molis-work-contracts/platform/actions";
import { ARTIFACT_ACTION_PERMISSIONS, artifactsActions, type ArtifactImportResult } from "@molis-ai/molis-work-module-artifacts";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

// specs/project-knowledge PMAT-48, docs/system/SECURITY-INVARIANTS.md S-39: an audio or video file imported before the speech
// model is downloaded says so in the result (not in the saved snapshot); only a person's explicit yes downloads it, and that
// import streams the download's and the transcription's progress. The Host's own speech helper only exists on macOS.

test("S-39 PMAT-48 an import downloads the speech model only on a person's explicit yes, says when it is needed, and streams the progress", { timeout: 90_000, skip: process.platform !== "darwin" }, async t => {
  const home = await mkdtemp(join(tmpdir(), "import-model-"));
  const project = await withCatalog({ homeDirectory: home }, async catalog => {
    const created = await catalog.createProject({ display_name: "资料", actor_id: "owner" });
    assert.throws(() => catalog.addProjectPlugin({ project_id: created.project_id, plugin_id: "artifacts", actor_id: "owner" }), (error: unknown) => error instanceof Error && "code" in error && error.code === "catalog.plugin_not_found");
    return created;
  });
  // The helper records each download permission it is given; without one it answers as the real helper does when the model is missing.
  const helper = join(home, "speech-helper"), choices = join(home, "choices.jsonl"), downloaded = join(home, "downloaded");
  const prior = process.env.MOLIS_MATERIAL_WHISPER_HELPER; process.env.MOLIS_MATERIAL_WHISPER_HELPER = helper;
  t.after(() => { if (prior === undefined) delete process.env.MOLIS_MATERIAL_WHISPER_HELPER; else process.env.MOLIS_MATERIAL_WHISPER_HELPER = prior; });
  writeFileSync(helper, `#!${process.execPath}
const fs = require('node:fs'); const allowed = process.argv.includes('--allow-model-download');
fs.appendFileSync(${JSON.stringify(choices)}, JSON.stringify(allowed) + '\\n');
if (!allowed && !fs.existsSync(${JSON.stringify(downloaded)})) { process.stdout.write(JSON.stringify({ error: 'model_required', message: 'explicit download required', approximate_bytes: 626 * 1024 * 1024 })); process.exit(1); }
if (allowed) { for (const progress of [0, 0.5, 1]) process.stderr.write(JSON.stringify({ stage: 'downloading', progress }) + '\\n'); fs.writeFileSync(${JSON.stringify(downloaded)}, 'user approved'); }
process.stderr.write(JSON.stringify({ stage: 'transcribing', progress: 0.5 }) + '\\n');
process.stdout.write(JSON.stringify({ text: '周会纪要：下周三上线。', extractor: 'fixture-speech', pages: [], coverage: { status: 'sufficient', processed_pages: 0, total_pages: 0, issues: [] } }));
`, { mode: 0o700 });

  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  const token = resolveWebControlToken({ homeDirectory: home });
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: token });
  t.after(async () => {
    await new Promise<void>(resolve => server.listening ? server.close(() => resolve()) : resolve());
    await host.close(); await rm(home, { recursive: true, force: true });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  const post = (body: unknown, accept?: string) => fetch(`${base}/projects/${project.project_id}/api/artifacts/import`, { method: "POST", body: JSON.stringify(body),
    headers: { "content-type": "application/json", origin: base, "x-molis-work-control-token": token, "x-molis-work-idempotency-key": randomUUID(), ...accept ? { accept } : {} } });
  const file = { source: "file" as const, filename: "周会.m4a", original_file: { filename: "周会.m4a", mime: "audio/mp4", data_base64: Buffer.from("media fixture").toString("base64") } };
  const said = () => readFileSync(choices, "utf8").trim().split("\n").map(line => JSON.parse(line) as boolean);

  // A person's import with no answer yet: the original is kept without text, and the result says the model is needed and how big it is.
  const first = await post(file);
  assert.equal(first.status, 201, await first.clone().text());
  const asked = await first.json() as ArtifactImportResult;
  assert.deepEqual(asked.model_required, { approximate_bytes: 626 * 1024 * 1024 });
  assert.match(asked.warnings.join("\n"), /转写要先下载本机语音模型（约 626 MB），同意下载后重新导入即可/u);
  assert.equal(existsSync(downloaded), false);

  // An Agent, an MCP client or a workflow passing the yes downloads nothing: the consent is a person's, read from who calls (S-39).
  const client = host.actionClient(molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id }));
  for (const audience of ["agent", "mcp", "workflow"] as ActionAudience[]) {
    const result = await client.invoke({ actor_id: "owner", project_id: project.project_id, audience, permissions: ARTIFACT_ACTION_PERMISSIONS },
      artifactsActions.importFile, { ...file, allow_model_download: true });
    assert.deepEqual(result.model_required, { approximate_bytes: 626 * 1024 * 1024 }, audience);
    assert.equal(existsSync(downloaded), false, audience);
  }
  assert.deepEqual(said(), [false, false, false, false]);

  // The person's yes, asking for progress: the download and the transcription stream as progress lines, then the new version with its text.
  const streamed = await post({ ...file, allow_model_download: true }, "application/x-ndjson");
  assert.equal(streamed.status, 200);
  assert.match(streamed.headers.get("content-type") ?? "", /application\/x-ndjson/u);
  const lines = (await streamed.text()).trim().split("\n").map(line => JSON.parse(line) as { type: string; stage?: string; result?: ArtifactImportResult });
  assert.deepEqual([...new Set(lines.filter(line => line.type === "progress").map(line => line.stage))], ["downloading", "transcribing"]);
  const done = lines.at(-1)!;
  assert.equal(done.type, "result", JSON.stringify(lines));
  assert.equal(done.result!.model_required, undefined);
  assert.equal(done.result!.version, 2);
  assert.equal(readFileSync(downloaded, "utf8"), "user approved");
  assert.deepEqual(said(), [false, false, false, false, true]);

  // The saved snapshots hold the text read and the note, never whether a model was missing: that was said to the one importing.
  const read = await client.invoke({ actor_id: "owner", project_id: project.project_id, audience: "user", permissions: ARTIFACT_ACTION_PERMISSIONS },
    artifactsActions.read, { reference: { artifact_id: asked.artifact_id, version: 2 } });
  const payload = read.selected!.payload as Record<string, unknown>;
  assert.equal(payload.content, "周会纪要：下周三上线。");
  assert.equal(Object.hasOwn(payload, "model_required"), false);
  const before = await client.invoke({ actor_id: "owner", project_id: project.project_id, audience: "user", permissions: ARTIFACT_ACTION_PERMISSIONS },
    artifactsActions.read, { reference: { artifact_id: asked.artifact_id, version: 1 } });
  assert.equal(Object.hasOwn(before.selected!.payload as Record<string, unknown>, "model_required"), false);
});
