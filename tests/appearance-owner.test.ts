import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test, { type TestContext } from "node:test";
import { ActionError, bindActionClient, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { APPEARANCE_READ_PERMISSION, APPEARANCE_WRITE_PERMISSION, appearanceSelectionActions as actions,
  type UiAppearanceApplyInput, type UiAppearanceSelection } from "@molis-ai/molis-work-contracts/platform/ui";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { APPEARANCE_STATE_PATH, createAppearanceOwner, UI_LOCALE_RELATIVE_PATH } from "@molis-ai/molis-work-service-appearance";

const person: ActionCallContext = { actor_id: "appearance-person", audience: "user", project_id: null,
  permissions: [APPEARANCE_READ_PERMISSION, APPEARANCE_WRITE_PERMISSION] };
const font = { id: "system-sans", revision: 1 };
const baseline: UiAppearanceSelection = { skin: { id: "soft-workbench", revision: 1 }, font: { policy: "follow-skin" }, mono: null };
const pinned: UiAppearanceSelection = { skin: baseline.skin, font: { policy: "pinned", scheme: font }, mono: font };
const select = (request_id: string, expected_revision: number, selection = pinned): UiAppearanceApplyInput =>
  ({ request_id, expected_revision, choice: { kind: "selection", selection } });
const restore = (request_id: string, expected_revision: number): UiAppearanceApplyInput =>
  ({ request_id, expected_revision, choice: { kind: "restore" } });

const isLocale = (value: unknown): value is "zh" | "en" => value === "zh" || value === "en";
const ignore = () => { /* These tests inspect state and notifications. */ };

function open(home: string) {
  const owner = createAppearanceOwner(home, { locale: {
    defaultLocale: "zh", isSupported: isLocale, readFailed: ignore, writeFailed: ignore, writeSucceeded: ignore,
  }, listenerFailed: ignore });
  const dispatcher = new ActionService();
  const unregister = dispatcher.registerProvider(owner.provider());
  const client = (caller: ActionCallContext = person) => bindActionClient(dispatcher, () => caller);
  return { owner, client, dispatcher, close: () => { owner.close(); unregister(); } };
}

async function isolatedHome(t: TestContext) {
  const home = await realpath(await mkdtemp(join(tmpdir(), "appearance-owner-")));
  t.after(() => rm(home, { recursive: true, force: true }));
  const opened = open(home);
  t.after(opened.close);
  opened.owner.locale.remember("en");
  return { home, path: join(home, APPEARANCE_STATE_PATH), localeFile: join(home, UI_LOCALE_RELATIVE_PATH), ...opened };
}

test("FSS-01 FSS-14 FSS-19 FSS-24 FSS-32 persist precise choices and actor receipts, reopen, and undo the original restore", async t => {
  const setup = await isolatedHome(t);
  const client = setup.client(), revisions: number[] = [];
  setup.owner.subscribe(revision => revisions.push(revision));
  const initial = await client.invoke(actions.get, {});
  assert.deepEqual(initial.selection, baseline);
  assert.deepEqual(initial.effective_selection, baseline);
  assert.equal(initial.selection_revision, 0);
  assert.deepEqual(initial.builtins.skins.find(row => row.ref.id === baseline.skin.id)?.ref, baseline.skin);
  assert.deepEqual(initial.builtins.fonts.find(row => row.ref.id === font.id)?.ref, font);
  assert.deepEqual(initial.problems, []);
  assert.equal(fs.existsSync(setup.path), false);

  const input = select("pin", 0);
  const applied = await client.invoke(actions.apply, input);
  assert.deepEqual(applied, { request_id: "pin", selection_revision: 1, selection: pinned });
  assert.deepEqual(await client.invoke(actions.apply, select("pin", 0, { mono: font, font: { scheme: font, policy: "pinned" }, skin: baseline.skin })), applied);
  await assert.rejects(client.invoke(actions.apply, restore("pin", 0)), { code: "appearance.request_reused" });
  const saved = await client.invoke(actions.apply, restore("restore", 1));
  assert.deepEqual(saved, { request_id: "restore", selection_revision: 2, selection: baseline });
  assert.deepEqual(revisions, [1, 2]);
  assert.equal(fs.statSync(setup.path).mode & 0o777, 0o600);
  assert.equal(JSON.parse(fs.readFileSync(setup.path, "utf8")).schema_version, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(setup.localeFile, "utf8")), { schema_version: 1, locale: "en" });
  setup.close();

  const restarted = open(setup.home);
  t.after(restarted.close);
  const current = restarted.client(), another = restarted.client({ ...person, actor_id: "another-person" });
  assert.deepEqual((await current.invoke(actions.get, { request_id: "restore" })).recovery, { applied: saved });
  assert.equal((await another.invoke(actions.get, { request_id: "restore" })).recovery, undefined);
  await assert.rejects(another.invoke(actions.undo, { applied_request_id: "restore", expected_revision: 2 }), { code: "appearance.application_missing" });
  await assert.rejects(current.invoke(actions.undo, { applied_request_id: "pin", expected_revision: 1 }), { code: "appearance.revision_changed" });
  const undo = { applied_request_id: saved.request_id, expected_revision: saved.selection_revision };
  const undone = await current.invoke(actions.undo, undo);
  assert.deepEqual(undone, { request_id: "restore", selection_revision: 3, selection: pinned });
  const same = await another.invoke(actions.apply, select("pin", 3));
  assert.equal(same.selection_revision, 4, "two formal applications of the same combination have different revisions");
  assert.deepEqual(await current.invoke(actions.undo, undo), undone);
  assert.deepEqual(await current.invoke(actions.apply, input), applied);
  assert.deepEqual((await current.invoke(actions.get, { request_id: "restore" })).recovery, { applied: saved, undone });
  assert.deepEqual(restarted.owner.snapshot({ tag: "zh", source: "explicit" }).font, { scheme: font, policy: "pinned", mono: font });
  assert.equal(restarted.owner.locale.lastUsed(), "en", "the last-used language is independent from the page snapshot and the reset");
});

test("FSS-19 FSS-27 reject malformed actions and unavailable definitions, and choose only one writer from a revision", { timeout: 10_000 }, async t => {
  const setup = await isolatedHome(t), revisions: number[] = [];
  setup.owner.subscribe(revision => revisions.push(revision));
  const client = setup.client();
  await assert.rejects(setup.dispatcher.invoke(person, actions.apply, { ...select("forged", 0), actor_id: "someone-else" }), { code: "actions.input_invalid" });
  await assert.rejects(setup.client({ ...person, permissions: [APPEARANCE_READ_PERMISSION] }).invoke(actions.apply, restore("forbidden", 0)), { code: "actions.forbidden" });
  await assert.rejects(client.invoke(actions.apply, select("missing", 0, { ...pinned, skin: { ...pinned.skin, revision: 2 } })), { code: "appearance.selection_unavailable" });
  assert.equal(fs.existsSync(setup.path), false);

  const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
  let checks = 0;
  const first = setup.client({ ...person, validate_authority: async () => {
    if (++checks === 2) { entered.resolve(); await release.promise; }
  } }).invoke(actions.apply, select("first", 0));
  t.after(() => release.resolve());
  await Promise.race([entered.promise, first.then(() => { throw new Error("first action did not wait at beforeEffect"); })]);
  const second = client.invoke(actions.apply, restore("second", 0));
  const results = Promise.allSettled([first, second]);
  release.resolve();
  const settled = await results;
  assert.equal(settled.filter(row => row.status === "fulfilled").length, 1);
  const conflict = settled.find(row => row.status === "rejected");
  assert.equal(conflict?.reason.code, "appearance.revision_changed");
  assert.equal((await client.invoke(actions.get, {})).selection_revision, 1);
  assert.deepEqual(revisions, [1]);
});

for (const stop of ["cancel", "revoke", "close"] as const) {
  test(`FSS-27 ${stop} before the commit leaves existing selection, receipt and notification intact`, { timeout: 10_000 }, async t => {
    const setup = await isolatedHome(t), client = setup.client(), revisions: number[] = [];
    const first = await client.invoke(actions.apply, select("first", 0));
    const saved = fs.readFileSync(setup.path, "utf8");
    setup.owner.subscribe(revision => revisions.push(revision));
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>(), abort = new AbortController();
    let checks = 0, revoked = false;
    const delayed = setup.client({ ...person, signal: abort.signal, validate_authority: async () => {
      if (++checks !== 2) return;
      entered.resolve();
      await release.promise;
      if (revoked) throw new ActionError("actions.forbidden", "Revoked");
    } }).invoke(actions.apply, restore("refused", first.selection_revision));
    t.after(() => release.resolve());
    await Promise.race([entered.promise, delayed.then(() => { throw new Error("action did not wait at beforeEffect"); })]);
    const refusal = assert.rejects(delayed, { code: { cancel: "actions.cancelled", revoke: "actions.forbidden", close: "actions.host_closed" }[stop] });
    if (stop === "cancel") abort.abort(new ActionError("actions.cancelled", "Cancelled"));
    if (stop === "revoke") revoked = true;
    if (stop === "close") setup.owner.close();
    release.resolve();
    await refusal;
    assert.equal(fs.readFileSync(setup.path, "utf8"), saved);
    assert.deepEqual(revisions, []);
    const reopened = open(setup.home);
    t.after(reopened.close);
    assert.equal((await reopened.client().invoke(actions.get, { request_id: "refused" })).recovery, undefined);
  });
}

test("FSS-19 FSS-24 show the last usable choice for a superseded definition, and refuse undo to that superseded choice", async t => {
  const setup = await isolatedHome(t), client = setup.client();
  await client.invoke(actions.apply, select("usable", 0));
  await client.invoke(actions.apply, restore("superseded", 1));
  // Simulate a once-shipped baseline that no longer has an exact resource in this release.
  const state = JSON.parse(fs.readFileSync(setup.path, "utf8"));
  state.selection.skin.revision = 2;
  state.applications[1].applied.selection = state.selection;
  const superseded = JSON.stringify(state);
  fs.writeFileSync(setup.path, superseded);
  const read = await client.invoke(actions.get, {});
  assert.equal(read.selection?.skin.revision, 2);
  assert.deepEqual(read.effective_selection, pinned);
  assert.ok(read.problems.some(problem => problem.code === "appearance.skin_unavailable"));
  assert.equal(fs.readFileSync(setup.path, "utf8"), superseded, "read-only projection never changes formal choices");
  const saved = await client.invoke(actions.apply, restore("recover", 2));
  assert.deepEqual(saved.selection, baseline);
  await assert.rejects(client.invoke(actions.undo, { applied_request_id: "recover", expected_revision: 3 }), { code: "appearance.selection_unavailable" });
  assert.deepEqual((await client.invoke(actions.get, { request_id: "recover" })).recovery, { applied: saved });
});

test("FSS-24 FSS-27 refuse future or unreadable state and an interface directory outside the Home", async t => {
  const setup = await isolatedHome(t), client = setup.client(), revisions: number[] = [];
  setup.owner.subscribe(revision => revisions.push(revision));
  fs.mkdirSync(dirname(setup.path));
  for (const [content, status, code] of [
    ['{"schema_version":2,"unknown":"preserve"}', "too_new", "storage.store_too_new"],
    ['{"schema_version":1,"selection_revision":1}', "unreadable", "storage.schema_version_mismatch"],
    ["{incomplete", "unreadable", "storage.schema_version_mismatch"],
  ]) {
    fs.writeFileSync(setup.path, content);
    const read = await client.invoke(actions.get, {});
    assert.equal(read.selection_revision, null);
    assert.deepEqual(read.effective_selection, baseline);
    assert.ok(read.problems.some(problem => problem.code === `appearance.state_${status}`));
    await assert.rejects(client.invoke(actions.apply, restore("recover", 0)), { code });
    assert.equal(fs.readFileSync(setup.path, "utf8"), content);
  }
  fs.rmSync(dirname(setup.path), { recursive: true });
  const outside = await mkdtemp(join(tmpdir(), "appearance-outside-"));
  t.after(() => rm(outside, { recursive: true, force: true }));
  fs.symlinkSync(outside, dirname(setup.path));
  await assert.rejects(client.invoke(actions.apply, restore("linked", 0)), { code: "storage.schema_version_mismatch" });
  assert.deepEqual(fs.readdirSync(outside), []);
  assert.deepEqual(revisions, []);
});

test("FSS-27 read the real state after Storage fails before or after rename and signal only confirmed commits", async t => {
  const setup = await isolatedHome(t), client = setup.client(), revisions: number[] = [];
  setup.owner.subscribe(revision => revisions.push(revision));
  const rename = fs.renameSync;
  const beforeRename = t.mock.method(fs, "renameSync", (from, to) => {
    if (to === setup.path) throw new Error("injected rename failure");
    return rename(from, to);
  });
  await assert.rejects(client.invoke(actions.apply, select("retry", 0)), { code: "appearance.write_failed" });
  assert.equal(fs.existsSync(setup.path), false);
  assert.equal((await client.invoke(actions.get, { request_id: "retry" })).recovery, undefined);
  assert.deepEqual(revisions, []);
  beforeRename.mock.restore();

  const sync = fs.fsyncSync;
  const directory = fs.statSync(dirname(setup.path));
  function failDirectorySync(onFailure: () => void) {
    return t.mock.method(fs, "fsyncSync", descriptor => {
      const target = fs.fstatSync(descriptor);
      if (target.dev !== directory.dev || target.ino !== directory.ino) return sync(descriptor);
      onFailure();
      throw new Error("injected directory sync failure after rename");
    });
  }

  let failedSyncs = 0;
  const afterRename = failDirectorySync(() => { failedSyncs++; });
  const saved = await client.invoke(actions.apply, select("retry", 0));
  assert.deepEqual((await client.invoke(actions.get, { request_id: "retry" })).recovery, { applied: saved });
  const undone = await client.invoke(actions.undo, { applied_request_id: "retry", expected_revision: 1 });
  assert.deepEqual((await client.invoke(actions.get, { request_id: "retry" })).recovery, { applied: saved, undone });
  assert.deepEqual(undone, { request_id: "retry", selection_revision: 2, selection: baseline });
  assert.deepEqual(revisions, [1, 2]);
  assert.equal(failedSyncs, 2);
  afterRename.mock.restore();

  let committed: Buffer | undefined;
  const unreadableAfterRename = failDirectorySync(() => {
    committed = fs.readFileSync(setup.path);
    fs.writeFileSync(setup.path, "{cannot confirm the file while it is unreadable");
  });
  await assert.rejects(client.invoke(actions.apply, restore("unknown", 2)), { code: "actions.outcome_unknown" });
  assert.deepEqual(revisions, [1, 2], "unconfirmed writes publish no invalidation");
  unreadableAfterRename.mock.restore();
  assert.ok(committed);
  fs.writeFileSync(setup.path, committed);
  assert.deepEqual((await client.invoke(actions.get, { request_id: "unknown" })).recovery?.applied,
    { request_id: "unknown", selection_revision: 3, selection: baseline });
});

test("FSS-71 read the existing locale format, retain cached success, and preserve a newer record", async t => {
  const setup = await isolatedHome(t);
  const { locale } = setup.owner;
  fs.writeFileSync(setup.localeFile, '{"schema_version":1,"locale":"zh"}');
  assert.equal(locale.read(), "en", "the owner retains its last successful read or write");
  locale.remember("en");
  assert.equal(fs.readFileSync(setup.localeFile, "utf8"), '{"schema_version":1,"locale":"zh"}', "a repeated choice does not rewrite");
  setup.close();

  const newer = '{"schema_version":2,"locale":"en","extra":"preserve"}';
  fs.writeFileSync(setup.localeFile, newer);
  const restarted = open(setup.home);
  t.after(restarted.close);
  assert.equal(restarted.owner.locale.read(), null);
  assert.equal(restarted.owner.locale.lastUsed(), "zh");
  restarted.owner.locale.remember("en");
  assert.equal(fs.readFileSync(setup.localeFile, "utf8"), newer);
});
