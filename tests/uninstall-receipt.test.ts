import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import type { ProjectRecord } from "@molis-ai/molis-work-contracts/modules/projects";
import { withCallId } from "@molis-ai/molis-work-kernel";
import { captureHostLog, MolisWorkUninstallService, MolisWorkWebServiceManager, RuntimeIntegrationService, type HostLogEntry } from "@molis-ai/molis-work-app-local-host";

async function fixture(t: TestContext) {
  const directory = await fs.mkdtemp(join(tmpdir(), "molis-work-uninstall-receipt-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const home = join(directory, "home");
  await fs.mkdir(join(home, "projects"), { recursive: true });
  const demoFile = join(home, "projects", "demo.data");
  const userFile = join(home, "projects", "user.data");
  await fs.writeFile(demoFile, "existing demo data\n");
  await fs.writeFile(userFile, "existing private user data\n");
  const projects: ProjectRecord[] = [
    { project_id: "demo", display_name: "Demo", database_path: demoFile, source: "created", data_class: "regenerable_demo", created_at: "2026-10-24", updated_at: "2026-10-24" },
    { project_id: "user", display_name: "User", database_path: userFile, source: "created", data_class: "user", created_at: "2026-10-24", updated_at: "2026-10-24" },
  ];
  const primary = new Error("演示项目清理失败");
  const privateValue = "private-receipt-material-do-not-log";
  const receiptFailure = Object.assign(new Error(`${privateValue} ${home}/config/uninstall.json`), {
    name: "ReceiptWriteError", code: "EACCES", path: join(home, "config", "uninstall.json"),
  });
  const state: { deniedWrite: "none" | "initial" | "failed"; removals: number; writes: string[]; beforeRefusal?: string } = {
    deniedWrite: "none", removals: 0, writes: [],
  };
  const service = new MolisWorkUninstallService({
    homeDirectory: home,
    projects: {
      inspect: async () => ({ projects, conflict: null }),
      removeDemos: async () => { state.removals++; throw primary; },
    },
    runtimeIntegrationService: new RuntimeIntegrationService({
      homeDirectory: home, userHomeDirectory: directory,
      runtimeExecutables: { codex: null, "claude-code": null, opencode: null, "pi-agent": null, "grok-build": null },
    }),
    webServiceManager: new MolisWorkWebServiceManager({ homeDirectory: home, userHomeDirectory: directory, platform: "linux" }),
  });
  const rename = fs.rename;
  t.mock.method(fs, "rename", async (...args: Parameters<typeof fs.rename>) => {
    if (args[1] === service.receiptPath) {
      const receipt = JSON.parse(await fs.readFile(args[0], "utf8")) as { state: string };
      state.writes.push(receipt.state);
      if (state.deniedWrite === "initial" || state.deniedWrite === "failed" && receipt.state === "failed") {
        if (receipt.state === "failed") state.beforeRefusal = await fs.readFile(service.receiptPath, "utf8");
        throw receiptFailure;
      }
    }
    return rename(...args);
  });
  const unchanged = async () => {
    assert.equal(await fs.readFile(demoFile, "utf8"), "existing demo data\n");
    assert.equal(await fs.readFile(userFile, "utf8"), "existing private user data\n");
  };
  return { home, service, state, primary, receiptFailure, privateValue, unchanged };
}

async function failedStep(service: MolisWorkUninstallService): Promise<ActionError> {
  const plan = await service.prepare();
  assert.equal(plan.status, "ready");
  return service.confirm({ plan_id: plan.plan_id, decision: "confirmed" }).then(
    () => assert.fail("the failed removal must reject confirmation"),
    (error: unknown) => {
      assert.ok(error instanceof ActionError);
      assert.equal(error.code, "installer.uninstall.step_failed");
      return error;
    },
  );
}

async function logged<T>(run: () => Promise<T>) {
  const entries: HostLogEntry[] = [];
  const restore = captureHostLog(entries);
  try { return { value: await run(), entries }; } finally { restore(); }
}

test("RAC-114: a failed uninstall step still saves its failed receipt and preserves the original reply", async t => {
  const item = await fixture(t);
  const { value: error, entries } = await logged(() => failedStep(item.service));
  assert.equal(error.message, `卸载未完成，进度收据已保留：${item.primary.message}`);
  const receipt = JSON.parse(await fs.readFile(item.service.receiptPath, "utf8")) as { state: string; error: string; preserved_projects: { project_id: string }[] };
  assert.equal(receipt.state, "failed");
  assert.equal(receipt.error, item.primary.message);
  assert.deepEqual(receipt.preserved_projects.map(project => project.project_id), ["user"]);
  assert.deepEqual(item.state.writes, ["in_progress", "failed"]);
  assert.equal(item.state.removals, 1);
  assert.deepEqual(entries, []);
  await item.unchanged();
});

test("RAC-114: a failed receipt write keeps the uninstall error primary, tells the truth, and recovers on an explicit new preview", async t => {
  const item = await fixture(t);
  item.state.deniedWrite = "failed";
  const { value: error } = await logged(() => failedStep(item.service));
  assert.equal(error.message, `卸载未完成，失败进度未能写入收据：${item.primary.message}`);
  assert.ok(!error.message.includes(item.privateValue));
  assert.ok(!error.message.includes(item.home));
  assert.deepEqual(item.state.writes, ["in_progress", "failed"]);
  assert.equal(item.state.removals, 1, "no automatic retry of the uninstall step");
  const retained = await fs.readFile(item.service.receiptPath, "utf8");
  assert.equal(retained, item.state.beforeRefusal, "the old receipt is not an updated failure receipt");
  assert.equal((JSON.parse(retained) as { state: string }).state, "in_progress");
  await item.unchanged();

  item.state.deniedWrite = "none";
  const { value: next, entries } = await logged(() => failedStep(item.service));
  assert.equal(next.message, `卸载未完成，进度收据已保留：${item.primary.message}`);
  const receipt = JSON.parse(await fs.readFile(item.service.receiptPath, "utf8")) as { state: string; error: string };
  assert.equal(receipt.state, "failed");
  assert.equal(receipt.error, item.primary.message);
  assert.deepEqual(item.state.writes, ["in_progress", "failed", "in_progress", "failed"]);
  assert.equal(item.state.removals, 2);
  assert.deepEqual(entries, []);
  await item.unchanged();
});

test("RAC-114: a refused failure receipt writes one correlated diagnostic without its private message, stack or path", async t => {
  const item = await fixture(t);
  item.state.deniedWrite = "failed";
  const callId = "a53ac674-5ad6-4f40-8719-42de096858bf";
  const { value: error, entries } = await logged(() => withCallId(callId, () => failedStep(item.service)));
  assert.ok(error.message.includes(item.primary.message));
  assert.deepEqual(entries.map(({ at, ...entry }) => { assert.ok(!Number.isNaN(Date.parse(at))); return entry; }), [{
    level: "warn", area: "installer", event: "uninstall_receipt_write_failed", call_id: callId,
    error: { name: "ReceiptWriteError", code: "EACCES" }, fields: { completed_steps: 0, purge_user_data: false },
  }]);
  const diagnostic = JSON.stringify(entries);
  for (const privateText of [item.receiptFailure.message, item.receiptFailure.stack!, item.privateValue, item.home, item.primary.message]) {
    assert.ok(!diagnostic.includes(privateText), "the diagnostic must not contain failure content");
  }
  assert.deepEqual(item.state.writes, ["in_progress", "failed"], "one failed-state write, with no retry");
  await item.unchanged();
});

test("RAC-114: an initial receipt write refusal propagates before any uninstall effect", async t => {
  const item = await fixture(t);
  item.state.deniedWrite = "initial";
  const plan = await item.service.prepare();
  const { entries } = await logged(async () => {
    await assert.rejects(item.service.confirm({ plan_id: plan.plan_id, decision: "confirmed" }), error => error === item.receiptFailure);
  });
  assert.equal(item.state.removals, 0);
  assert.deepEqual(item.state.writes, ["in_progress"]);
  await assert.rejects(fs.stat(item.service.receiptPath), { code: "ENOENT" });
  assert.deepEqual(entries, []);
  await item.unchanged();
});
