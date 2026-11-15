import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { importedDocumentFile } from "@molis-ai/molis-work-contracts/modules/artifacts";
import { bindActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { contextFileSkip } from "@molis-ai/molis-work-contracts/services/materials";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import {
  MolisWorkLocalHost,
  molisWorkHostProjectReference,
  waitContextJourney,
} from "@molis-ai/molis-work-app-local-host";
import { artifactsActions } from "@molis-ai/molis-work-module-artifacts";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { recordingTextModel, wireText } from "./fixtures/recording-text-model.js";
import { serveTestHost } from "./fixtures/test-home.js";

const SECRET_TOKEN_A = ["sk", "live", "secret9876543210abcdef123456"].join("-");
const SECRET_TOKEN_B = ["ghp", "99887766554433221100aabbccddeeff"].join("_");
const ENV_KEY = ["OPENAI", "API", "KEY"].join("_");
const SECRET_ENV = `${ENV_KEY}=${SECRET_TOKEN_A}\nPORT=3000\n`;
const SECRET_JSON = JSON.stringify({ service: "payments", ["api" + "_secret"]: SECRET_TOKEN_B, region: "us-west" }, null, 2);

interface JourneySecretHold {
  key: string;
  path: string;
  preview_names: string[];
}

interface JourneyView {
  id: string;
  phase: string;
  project_id: string;
  summary: { title: string; body: string } | null;
  sources: Array<{
    kind: string;
    references?: Array<{ path: string; secret_mode?: string }>;
    held_secrets?: JourneySecretHold[];
  }>;
}

async function setupOnboardingHarness(t: TestContext) {
  const dir = await mkdtemp(join(tmpdir(), "molis-sec-onb-secret-"));
  const model = await recordingTextModel(t, dir, () => "# 项目背景\n已整理公开材料 [S1]");
  const host = new MolisWorkLocalHost({ homeDirectory: dir });
  const served = await serveTestHost(null, { home: dir, host });
  const withCatalog = host.ensureWebCatalog(dir, openMolisWorkProjectCatalog).withCatalog;

  t.after(async () => {
    await served.close();
    await host.close();
    await rm(dir, { recursive: true, force: true });
  });

  const seenWireBodies = () => model.requests.map(req => `${JSON.stringify(req.system ?? "")}\n${wireText(req)}`);

  async function stageFile(journeyId: string, relPath: string, content: string | Buffer): Promise<{ path: string; staged: string }> {
    const res = await fetch(`${served.origin}/api/onboarding/context/${encodeURIComponent(journeyId)}/files?path=${encodeURIComponent(relPath)}`, {
      method: "POST",
      headers: {
        origin: served.origin,
        "content-type": "application/octet-stream",
        "x-molis-work-control-token": served.controlToken,
        "x-molis-work-idempotency-key": randomUUID(),
      },
      body: Buffer.from(content),
    });
    assert.equal(res.status, 201);
    return await res.json() as { path: string; staged: string };
  }

  async function listProjectArtifacts(projectId: string) {
    const project = await withCatalog({ homeDirectory: dir }, catalog => catalog.getProject(projectId));
    const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
    const client = bindActionClient(host.actionClient(reference), () => ({
      actor_id: "sec-test",
      project_id: projectId,
      audience: "user",
      permissions: ["artifacts:read"],
    }));
    const result = await client.invoke(artifactsActions.browser, {});
    return result.versions ?? [];
  }

  return { dir, model, served, seenWireBodies, stageFile, listProjectArtifacts };
}

test("S-onboarding-secret-hold unapproved secret-like files stay held locally and never reach the model or project stores", async t => {
  // C2, ONB-37, S-onboarding-secret-hold
  const { dir, served, seenWireBodies, stageFile, listProjectArtifacts } = await setupOnboardingHarness(t);
  const id = randomUUID();
  await served.web.post("/api/onboarding/context", { id });

  const readme = await stageFile(id, "README.md", "# 公开说明\n普通项目介绍。");
  const dotEnv = await stageFile(id, ".env.local", SECRET_ENV);
  const cfgJson = await stageFile(id, "config/settings.json", SECRET_JSON);

  await served.web.post(`/api/onboarding/context/${id}/selection`, {
    sources: [{
      kind: "files",
      selected: true,
      files: [
        { path: readme.path, staged: readme.staged },
        { path: dotEnv.path, staged: dotEnv.staged },
        { path: cfgJson.path, staged: cfgJson.staged },
      ],
    }],
  });

  await served.web.post(`/api/onboarding/context/${id}/start`, {});
  await waitContextJourney(dir, id);
  const ready = await served.web.get<JourneyView>(`/api/onboarding/context/${id}`);
  assert.equal(ready.phase, "review");

  const source = ready.sources.find(s => s.kind === "files")!;
  assert.equal(source.references?.length, 1);
  assert.equal(source.references?.[0]?.path, "README.md");
  assert.equal(source.held_secrets?.length, 2);
  assert.deepEqual(source.held_secrets?.map(h => h.path).sort(), [".env.local", "config/settings.json"]);
  assert.ok(source.held_secrets?.find(h => h.path === ".env.local")?.preview_names.includes("OPENAI_API_KEY"));

  for (const wireBody of seenWireBodies()) {
    assert.equal(wireBody.includes(SECRET_TOKEN_A), false, "raw .env secret value must never reach model wire");
    assert.equal(wireBody.includes(SECRET_TOKEN_B), false, "raw JSON secret value must never reach model wire");
    assert.equal(wireBody.includes("OPENAI_API_KEY"), false, "unapproved .env variable names stay held too");
  }

  const adopted = await served.web.post<JourneyView>(`/api/onboarding/context/${id}/adopt`, {
    title: "安全核验项目",
    body: ready.summary!.body,
  });
  assert.equal(adopted.phase, "complete");
  const store = openPagesStore(dir);
  try {
    for (const page of store.list(adopted.project_id)) {
      const full = JSON.stringify(store.get(page.id, adopted.project_id).body);
      assert.equal(full.includes(SECRET_TOKEN_A), false);
      assert.equal(full.includes(SECRET_TOKEN_B), false);
    }
  } finally {
    store.close();
  }
  const items = await listProjectArtifacts(adopted.project_id);
  const serialized = JSON.stringify(items);
  assert.equal(serialized.includes(".env.local"), false);
  assert.equal(serialized.includes("settings.json"), false);
  assert.equal(serialized.includes(SECRET_TOKEN_A), false);
  assert.equal(serialized.includes(SECRET_TOKEN_B), false);
});

test("S-onboarding-secret-hold strip redacts secret values while keeping variable names and never imports raw secret files", async t => {
  // C2, S-onboarding-secret-hold
  const { dir, served, seenWireBodies, stageFile, listProjectArtifacts } = await setupOnboardingHarness(t);
  const id = randomUUID();
  await served.web.post("/api/onboarding/context", { id });

  const dotEnv = await stageFile(id, ".env.local", SECRET_ENV);
  await served.web.post(`/api/onboarding/context/${id}/selection`, {
    sources: [{ kind: "files", selected: true, files: [{ path: dotEnv.path, staged: dotEnv.staged }] }],
  });

  await served.web.post(`/api/onboarding/context/${id}/start`, {});
  await waitContextJourney(dir, id);
  const firstPass = await served.web.get<JourneyView>(`/api/onboarding/context/${id}`);
  assert.equal(firstPass.phase, "failed");
  assert.equal(seenWireBodies().length, 0, "no model call when every selected file is held for secret confirmation");

  const held = firstPass.sources.find(s => s.kind === "files")?.held_secrets?.[0];
  assert.ok(held);
  await served.web.post(`/api/onboarding/context/${id}/secret`, { key: held.key, decision: "strip" });
  await waitContextJourney(dir, id);
  const secondPass = await served.web.get<JourneyView>(`/api/onboarding/context/${id}`);
  assert.equal(secondPass.phase, "review");
  assert.ok(seenWireBodies().length >= 1);
  for (const wireBody of seenWireBodies()) {
    assert.equal(wireBody.includes(SECRET_TOKEN_A), false, "stripped prompt must never contain raw secret value");
  }
  assert.ok(seenWireBodies().some(p => p.includes("OPENAI_API_KEY=<REDACTED>")), "stripped prompt preserves variable name with REDACTED marker");

  const adopted = await served.web.post<JourneyView>(`/api/onboarding/context/${id}/adopt`, {
    title: "脱敏导入项目",
    body: secondPass.summary!.body,
  });
  assert.equal(adopted.phase, "complete");
  const store = openPagesStore(dir);
  try {
    const allBodies = store.list(adopted.project_id).map(p => JSON.stringify(store.get(p.id, adopted.project_id).body)).join("\n");
    assert.equal(allBodies.includes(SECRET_TOKEN_A), false, "Pages document must not contain raw secret");
    assert.equal(allBodies.includes("OPENAI_API_KEY=<REDACTED>"), true, "Pages document stores stripped content");
  } finally {
    store.close();
  }
  const items = await listProjectArtifacts(adopted.project_id);
  const serialized = JSON.stringify(items);
  assert.equal(items.some(v => {
    const file = importedDocumentFile(v);
    return Boolean(file?.data_base64 || file?.stored);
  }), false, "raw secret file bytes must never be imported into Artifacts when stripped");
  assert.equal(serialized.includes(SECRET_TOKEN_A), false, "Artifacts must never contain raw secret value");
  assert.equal(serialized.includes("OPENAI_API_KEY=<REDACTED>"), true, "Stripped variable name with REDACTED marker is stored");
});

test("S-onboarding-secret-hold exclude drops the held secret file and byte edits invalidate prior raw approval", async t => {
  // C2, S-onboarding-secret-hold
  const { dir, model, served, seenWireBodies, stageFile } = await setupOnboardingHarness(t);
  const id = randomUUID();
  await served.web.post("/api/onboarding/context", { id });

  const readme = await stageFile(id, "README.md", "# 说明\n公开内容。");
  const v1 = await stageFile(id, ".env.local", SECRET_ENV);
  const extra = await stageFile(id, "config/creds.json", SECRET_JSON);
  await served.web.post(`/api/onboarding/context/${id}/selection`, {
    sources: [{
      kind: "files",
      selected: true,
      files: [
        { path: readme.path, staged: readme.staged },
        { path: v1.path, staged: v1.staged },
        { path: extra.path, staged: extra.staged },
      ],
    }],
  });

  await served.web.post(`/api/onboarding/context/${id}/start`, {});
  await waitContextJourney(dir, id);
  const ready = await served.web.get<JourneyView>(`/api/onboarding/context/${id}`);
  const heldEnv = ready.sources.find(s => s.kind === "files")!.held_secrets!.find(h => h.path === ".env.local")!;
  const heldJson = ready.sources.find(s => s.kind === "files")!.held_secrets!.find(h => h.path === "config/creds.json")!;

  await served.web.post(`/api/onboarding/context/${id}/secret`, { key: heldJson.key, decision: "exclude" });
  await waitContextJourney(dir, id);
  const afterExclude = await served.web.get<JourneyView>(`/api/onboarding/context/${id}`);
  assert.equal(afterExclude.sources.find(s => s.kind === "files")!.held_secrets!.some(h => h.path === "config/creds.json"), false);

  await served.web.post(`/api/onboarding/context/${id}/secret`, { key: heldEnv.key, decision: "raw" });
  await waitContextJourney(dir, id);
  const afterRaw = await served.web.get<JourneyView>(`/api/onboarding/context/${id}`);
  assert.equal(afterRaw.sources.find(s => s.kind === "files")!.references!.some(r => r.path === ".env.local" && r.secret_mode === "raw"), true);

  // Reopen and modify the bytes of .env.local: the old sha256-scoped raw approval must NOT carry over to new secret bytes!
  const newToken = ["sk", "live", "brandnewtoken9999999999999999"].join("-");
  const reopened = await served.web.post<JourneyView>(`/api/onboarding/context/${id}/reopen`, {});
  assert.equal(reopened.phase, "selecting");
  const v2 = await stageFile(id, ".env.local", `${ENV_KEY}=${newToken}\n`);
  await served.web.post(`/api/onboarding/context/${id}/selection`, {
    sources: [{
      kind: "files",
      selected: true,
      files: [
        { path: readme.path, staged: readme.staged },
        { path: v2.path, staged: v2.staged },
      ],
    }],
  });
  model.requests.length = 0;
  await served.web.post(`/api/onboarding/context/${id}/start`, {});
  await waitContextJourney(dir, id);
  const afterEdit = await served.web.get<JourneyView>(`/api/onboarding/context/${id}`);
  const srcAfterEdit = afterEdit.sources.find(s => s.kind === "files")!;
  assert.equal(srcAfterEdit.held_secrets?.some(h => h.path === ".env.local"), true, "edited secret file is held again until re-confirmed");
  for (const wireBody of seenWireBodies()) {
    assert.equal(wireBody.includes(newToken), false, "edited secret token must never leak via stale raw approval");
  }
  for (const secretPath of [
    "config/client_secret_web.json",
    "auth.json",
    ".npmrc",
    ".netrc",
    ".pypirc",
    ".pgpass",
  ]) {
    assert.equal(contextFileSkip(secretPath), "secret", `${secretPath} must classify as secret in contextFileSkip`);
  }
});
