import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs, { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { createPrologueNodeAdapter, openPrologueMemoryAdoptionInspection, type PrologueSessionIndexFact } from "@molis-ai/molis-work-service-agent-host";
import { memoryRuntimePolicy } from "@molis-ai/molis-work-app-local-host";

const requireSdk = createRequire(new URL("../horizontal/agent-host/package.json", import.meta.url));
const { createNodeHost } = await import(requireSdk.resolve("@prologue/sdk/node"));
const app = { appId: "io.molis.work", appVersion: "1.0.0" };
const owner = { project_id: "project", plugin_id: "plugin", install_id: "installation", actor_id: "person" };
const kind = `molis-agent-index-${createHash("sha256").update(app.appId).digest("hex").slice(0, 24)}`;
const privateText = "PRIVATE title task original_input must not escape";
const ref = (id: string) => ({ kind: "session" as const, id, revision: 1 });
const row = (id: string) => ({ schema: 1, ref: ref(id), owner, title: privateText, attempts: [
  { frozen: { workspace: "none" }, task: privateText, original_input: { text: privateText } },
], workspace: "none" });

function bytes(root: string): Record<string, Buffer> {
  const result: Record<string, Buffer> = {};
  const visit = (directory: string, relative = "") => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const key = join(relative, entry.name), path = join(directory, entry.name);
      if (entry.isDirectory()) visit(path, key); else result[key] = readFileSync(path);
    }
  };
  visit(root); return result;
}

function fixture(t: TestContext) {
  const home = mkdtempSync(join(tmpdir(), "molis-source-index-")), storageRoot = join(home, "agent-runtime");
  const host = createNodeHost({ storageRoot });
  t.after(async () => { await host.storage.close?.(); rmSync(home, { recursive: true, force: true }); });
  t.mock.method(globalThis, "fetch", async () => { assert.fail("source inspection must not send network requests"); });
  return { storageRoot, host,
    async seed(id: string, value: unknown = row(id), storageKind = kind) {
      const secureBody = new TextEncoder().encode(typeof value === "string" ? value : JSON.stringify(value));
      try { await host.storage.commit({ kind: storageKind, id, expectedVersion: 0, metadata: { schema: 1 }, secureBody }); }
      finally { secureBody.fill(0); }
    },
    open: (control: { signal?: AbortSignal; assertCurrent?: () => void } = {}) => openPrologueMemoryAdoptionInspection({
      storageRoot, appVersion: app.appVersion, scopes: [{ scope: "user", owner: owner.actor_id }],
      policy: memoryRuntimePolicy(() => undefined).policy, ...control,
    }),
  };
}

test("source pages read real App-created Sessions and original lifecycle decisions without changing any source bytes", async t => {
  const f = fixture(t);
  const adapter = await createPrologueNodeAdapter({ app, storageRoot: f.storageRoot,
    modelConfiguration: async () => { assert.fail("no model configuration in source inspection"); } });
  const expected: PrologueSessionIndexFact[] = [];
  try {
    for (const action of ["active", "archive", "purge"] as const) {
      const session = await adapter.createSession({ ...owner, workspace: "none", role_id: "reader", title: privateText });
      if (action !== "active") {
        const state = await adapter.sessionLifecycle!.read(session, owner);
        assert.ok(state.version); assert.equal(state.state, "active");
        const decision = { operation_id: `original-${action}`, expected_version: state.version, expected_state: "active" as const };
        if (action === "archive") await adapter.sessionLifecycle!.archive(session, decision, owner);
        else await adapter.sessionLifecycle!.purge(session, decision, await adapter.sessionLifecycle!.previewPurge(session, owner), owner);
      }
      const raw = await f.host.storage.readSecure({ kind, id: session.session_id });
      try {
        const saved = JSON.parse(new TextDecoder().decode(raw));
        expected.push({ sessionRef: ref(session.session_id), owner, ...(saved.lifecycle ? { lifecycle: saved.lifecycle } : {}) });
      } finally { raw.fill(0); }
    }
  } finally { await adapter.close(); }
  const before = bytes(f.storageRoot), inspection = await f.open();
  try {
    assert.equal("storage" in inspection, false);
    const found: PrologueSessionIndexFact[] = []; let cursor: string | undefined;
    do {
      const page = await inspection.inspectSessionIndexes({ limit: 1, cursor });
      assert.equal(page.facts.length, 1);
      assert.equal(page.exhausted, page.cursor === undefined);
      assert.deepEqual(Object.keys(page).sort(), page.exhausted ? ["exhausted", "facts"] : ["cursor", "exhausted", "facts"]);
      found.push(...page.facts); cursor = page.cursor;
    } while (cursor);
    assert.deepEqual(found, expected.sort((a, b) => a.sessionRef.id.localeCompare(b.sessionRef.id)));
    assert.equal(JSON.stringify(found).includes(privateText), false);
  } finally { await inspection.close(); }
  assert.deepEqual(bytes(f.storageRoot), before);
});

test("all original lifecycle phases are projected field by field; unrelated kinds and absent actor stay absent", async t => {
  const f = fixture(t), expected: PrologueSessionIndexFact[] = [];
  for (const action of ["archive", "unarchive", "purge"] as const) for (const phase of ["prepared", "sdk-complete", "complete"] as const) {
    const id = `${action}-${phase}`, sessionRef = ref(id);
    const decision = { operation_id: `original-${id}`, expected_version: 4, expected_state: "archived" as const };
    const preview = action === "purge" ? { sessionRef, atVersion: 4, runs: 3, resources: 2, destroysKey: true } : undefined;
    const receipt = phase === "prepared" ? undefined : { scope: "agent-host-session" as const,
      session: { runtime_id: "prologue", session_id: id }, operation_id: decision.operation_id, action,
      state: action === "purge" ? "purged" as const : action === "archive" ? "archived" as const : "active" as const, version: action === "purge" ? 6 : 5 };
    const lifecycle = { action, phase, decision, ...(preview ? { preview } : {}), ...(receipt ? { receipt } : {}) };
    expected.push({ sessionRef, owner, lifecycle });
    await f.seed(id, { ...row(id), owner: { ...owner, title: privateText }, ref: { ...sessionRef, title: privateText },
      lifecycle: { ...lifecycle, title: privateText, decision: { ...decision, task: privateText },
        ...(preview ? { preview: { ...preview, title: privateText, sessionRef: { ...sessionRef, title: privateText } } } : {}),
        ...(receipt ? { receipt: { ...receipt, task: privateText, session: { ...receipt.session, title: privateText } } } : {}) } });
  }
  const { actor_id: _actor, ...withoutActor } = owner;
  await f.seed("without-actor", { ...row("without-actor"), owner: withoutActor });
  expected.push({ sessionRef: ref("without-actor"), owner: withoutActor });
  await f.seed("foreign", row("foreign"), "other-app-index");
  const before = bytes(f.storageRoot), inspection = await f.open();
  try {
    const page = await inspection.inspectSessionIndexes({ limit: 10_000 });
    assert.equal(page.exhausted, true);
    assert.deepEqual(page.facts, expected.sort((a, b) => a.sessionRef.id.localeCompare(b.sessionRef.id)));
    assert.equal(JSON.stringify(page).includes(privateText), false);
  } finally { await inspection.close(); }
  assert.deepEqual(bytes(f.storageRoot), before);
});

for (const cause of ["bad-json", "bad-owner", "bad-actor", "bad-lifecycle", "bad-timing", "tombstone"] as const)
  test(`source page refuses ${cause} without returning the earlier valid row or writing`, async t => {
    const f = fixture(t); await f.seed("a-good");
    const bad = row("z-bad");
    await f.seed("z-bad", cause === "bad-json" ? privateText : cause === "bad-owner" ? { ...bad, owner: { ...owner, project_id: 42 } }
      : cause === "bad-actor" ? { ...bad, owner: { ...owner, actor_id: " " } }
      : cause === "bad-lifecycle" ? { ...bad, lifecycle: { action: "purge", phase: "complete", decision: { operation_id: "broken" } } }
      : cause === "bad-timing" ? { ...bad, attempts: [{ frozen: { workspace: "none" }, timing: { ended_at: privateText } }] } : bad);
    if (cause === "tombstone") await f.host.storage.remove({ kind, id: "z-bad", expectedVersion: 1 });
    const before = bytes(f.storageRoot), inspection = await f.open();
    try { await assert.rejects(inspection.inspectSessionIndexes({}), error => { assert.ok(error instanceof Error); assert.equal(error.message.includes(privateText), false); return true; }); }
    finally { await inspection.close(); }
    assert.deepEqual(bytes(f.storageRoot), before);
  });

test("empty fixed Index kind is only an exhausted page; invalid page controls and closed reads reject", async t => {
  const f = fixture(t); await f.seed("unrelated", row("unrelated"), "other-app-index");
  const before = bytes(f.storageRoot), inspection = await f.open();
  assert.deepEqual(await inspection.inspectSessionIndexes({}), { facts: [], exhausted: true });
  for (const limit of [NaN, Infinity, 0, -1, 1.5]) await assert.rejects(inspection.inspectSessionIndexes({ limit }));
  await assert.rejects(inspection.inspectSessionIndexes({ cursor: "invalid" }));
  await inspection.close();
  await assert.rejects(inspection.inspectSessionIndexes({}));
  assert.deepEqual(bytes(f.storageRoot), before);
});

for (const cause of ["cancel", "revoke", "close"] as const) test(`source page ${cause} after a real encrypted read refuses delivery and leaves source unchanged`, async t => {
  const f = fixture(t); await f.seed("source");
  const before = bytes(f.storageRoot), controller = new AbortController();
  let allowed = true, closing: Promise<void> | undefined, reads = 0;
  const inspection = await f.open({ assertCurrent: () => { if (!allowed) throw new Error("source authority revoked"); } });
  const file = Object.keys(before).find(path => path.endsWith("/source.json")); assert.ok(file);
  const identity = fs.statSync(join(f.storageRoot, file), { bigint: true }), read = fs.readFileSync;
  const fault = t.mock.method(fs, "readFileSync", (...args: Parameters<typeof fs.readFileSync>) => {
    const value = read(...args), held = typeof args[0] === "number" ? fs.fstatSync(args[0], { bigint: true }) : undefined;
    if (held?.dev === identity.dev && held?.ino === identity.ino && ++reads === 3) queueMicrotask(() => {
      if (cause === "cancel") controller.abort(); else if (cause === "revoke") allowed = false; else closing = inspection.close();
    });
    return value;
  });
  syncBuiltinESMExports();
  try { await assert.rejects(inspection.inspectSessionIndexes({ signal: controller.signal })); assert.ok(reads >= 3); }
  finally { fault.mock.restore(); syncBuiltinESMExports(); await (closing ?? inspection.close()); }
  assert.deepEqual(bytes(f.storageRoot), before);
});

for (const cause of ["missing", "version", "earlier-row-version"] as const) test(`source page refuses actual ${cause} change after enumeration`, async t => {
  const f = fixture(t); await f.seed("a-first"); await f.seed("z-last");
  const before = bytes(f.storageRoot), first = Object.keys(before).find(path => path.endsWith("/a-first.json")), last = Object.keys(before).find(path => path.endsWith("/z-last.json"));
  assert.ok(first && last);
  const target = join(f.storageRoot, first), observed = join(f.storageRoot, cause === "earlier-row-version" ? last : first);
  const identity = fs.statSync(observed, { bigint: true }), read = fs.readFileSync;
  let reads = 0, changed = false, afterFault: Record<string, Buffer> | undefined;
  const inspection = await f.open();
  const fault = t.mock.method(fs, "readFileSync", (...args: Parameters<typeof fs.readFileSync>) => {
    const value = read(...args), held = typeof args[0] === "number" ? fs.fstatSync(args[0], { bigint: true }) : undefined;
    if (held?.dev === identity.dev && held?.ino === identity.ino && ++reads === (cause === "earlier-row-version" ? 3 : 1)) {
      if (cause === "missing") fs.unlinkSync(target);
      else { const envelope = JSON.parse(String(read(target))); envelope.version++; fs.writeFileSync(target, JSON.stringify(envelope)); }
      changed = true; afterFault = bytes(f.storageRoot);
    }
    return value;
  });
  syncBuiltinESMExports();
  try { await assert.rejects(inspection.inspectSessionIndexes({})); assert.equal(changed, true); }
  finally { fault.mock.restore(); syncBuiltinESMExports(); await inspection.close(); }
  assert.deepEqual(bytes(f.storageRoot), afterFault, "only the deliberately injected external mutation changed storage");
});
