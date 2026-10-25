import assert from "node:assert/strict";
import { readdir, readFile, stat, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { installedMcpHome, tool, waitUntil } from "./fixtures/mcp-autostart.js";
import { storageOwnerProcesses } from "./fixtures/home-storage-owner.js";

interface Resolution { status: string; connection: { project_id: string; database_path: string } | null }
interface ProjectList { projects: Array<{ project_id: string; display_name: string }> }

test("RAC-625 RAC-626 RAC-628 RAC-629: installed MCP cold start, contention, cancellation, EOF and persistent reuse", { timeout: 240_000 }, async t => {
  const f = await installedMcpHome(t);
  let managed: NonNullable<Resolution["connection"]> | undefined;
  await t.test("cold start uses the same installed Home and persists one authenticated context write", async st => {
    st.after(f.cleanupCase);
    await f.release(); const peer = await f.connect("cold-session");
    const input = { display_name: "冷启动真实项目", user_confirmed: true, idempotency_key: "cold-create" };
    const created = await tool<Resolution>(peer, "context_create_and_bind", input);
    assert.equal(created.status, "bound"); assert.ok(created.connection?.project_id);
    managed = created.connection;
    const first = await f.health(); assert.equal((await readdir(f.attempts)).length, 1);
    await peer.close();
    const reused = await f.connect("cold-session");
    assert.equal((await tool<Resolution>(reused, "context_resolve")).connection?.project_id, created.connection.project_id);
    assert.deepEqual(await f.health(), first); assert.equal((await readdir(f.attempts)).length, 1);
    const projects = await tool<ProjectList>(reused, "context_list_projects");
    assert.equal(projects.projects.filter(project => project.display_name === input.display_name).length, 1);
    await reused.close();
    // Both MCP processes are gone; the resident still proves the same identity and serves the next client.
    assert.deepEqual(await f.health(), first); await f.stopHost();
  });
  t.signal.throwIfAborted();
  await t.test("trusted management uses the same resident after preflight and never adopts a local writable fallback", async st => {
    st.after(f.cleanupCase); assert.ok(managed); assert.equal(typeof managed.database_path, "string");
    const preload = fileURLToPath(new URL("./fixtures/mcp-autostart-no-local-sql.mjs", import.meta.url));
    const peer = await f.connect("management-session", { MOLIS_WORK_RUNTIME_ID: "", MOLIS_WORK_MCP_AUDIENCE: "management",
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${JSON.stringify(preload)}` });
    const count = (await readdir(f.attempts)).length;
    const forged = await peer.request("tools/call", { name: "molis_work_v1_event_decide", arguments: { database_path: managed.database_path,
      project_id: managed.project_id, goal_id: "missing", idempotency_key: "forged-decision", actor_id: "forged" } }).promise;
    assert.equal((forged.result as { isError: boolean }).isError, true); assert.equal((await readdir(f.attempts)).length, count);
    const initialized = await peer.request("tools/call", { name: "molis_work_v1_initialize", arguments: {
      database_path: managed.database_path, project_id: managed.project_id, idempotency_key: "management-cold" } }).promise;
    const result = initialized.result as { isError: boolean; content: Array<{ text: string }> };
    assert.equal(result.isError, true, "the existing Board must retain its original already-exists refusal");
    const failure = JSON.parse(result.content[0]!.text) as { code: string; call_id: string };
    assert.equal(failure.code, "goals.board.exists");
    assert.match(failure.call_id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      "the actual resident recorded this domain refusal; a local SQLite fallback would have been rejected by the preload");
    assert.equal((await readdir(f.attempts)).length, count + 1); await f.health(); await peer.close(); await f.stopHost();
  });
  t.signal.throwIfAborted();
  await t.test("two independent MCP processes race their real launch candidates but share one owner and idempotent write", async st => {
    st.after(f.cleanupCase);
    await f.reset(); const count = (await readdir(f.attempts)).length;
    const a = await f.connect("race-session"), b = await f.connect("race-session");
    const input = { display_name: "竞争只创建一次", user_confirmed: true, idempotency_key: "concurrent-create" };
    const left = a.request("tools/call", { name: "molis_work_v1_context_create_and_bind", arguments: input }).promise;
    const right = b.request("tools/call", { name: "molis_work_v1_context_create_and_bind", arguments: input }).promise;
    await waitUntil(async () => (await readdir(f.attempts)).length >= count + 2);
    await f.release(); const replies = (await Promise.all([left, right])).map(reply => reply.result as { isError: boolean; content: Array<{ text: string }> });
    const accepted = replies.filter(reply => !reply.isError), refused = replies.filter(reply => reply.isError);
    // Current creation contract refuses an in-flight duplicate; the client must explicitly resolve, never replay the write.
    assert.ok(accepted.length >= 1); assert.equal(accepted.length + refused.length, 2);
    for (const reply of refused) assert.match(JSON.stringify(reply), /work\.context\.idempotency_conflict/);
    const one = JSON.parse(accepted[0]!.content[0]!.text) as Resolution; assert.ok(one.connection);
    for (const reply of accepted) assert.equal((JSON.parse(reply.content[0]!.text) as Resolution).connection?.project_id, one.connection.project_id);
    assert.equal((await tool<Resolution>(a, "context_resolve")).connection?.project_id, one.connection.project_id);
    assert.equal((await tool<Resolution>(b, "context_resolve")).connection?.project_id, one.connection.project_id);
    const first = await f.health(), peers = storageOwnerProcesses(st), owner = await peers.start(join(f.home, "agent-runtime"));
    try { assert.deepEqual(await owner.request("acquire"), { code: "storage.owner.busy" }); }
    finally { await owner.stop(); }
    assert.equal((await tool<ProjectList>(a, "context_list_projects")).projects.filter(project => project.display_name === input.display_name).length, 1);
    assert.deepEqual(await f.health(), first);
    await Promise.all([a.close(), b.close()]); assert.deepEqual(await f.health(), first); await f.stopHost();
  });
  t.signal.throwIfAborted();
  await t.test("cancel and EOF end their waits while another MCP completes; cancelled tools never create projects", async st => {
    st.after(f.cleanupCase);
    await f.reset(); const count = (await readdir(f.attempts)).length;
    const a = await f.connect("cancel-session"), eof = await f.connect("eof-session"), survivor = await f.connect("survivor-session");
    a.notify({ id: 70, method: "tools/call", params: { name: "molis_work_v1_context_create_and_bind", arguments: {
      display_name: "取消绝不创建", user_confirmed: true, idempotency_key: "cancelled-create" } } });
    await waitUntil(async () => (await readdir(f.attempts)).length >= count + 1);
    a.notify({ method: "notifications/cancelled", params: { requestId: 70 } });
    assert.deepEqual((await a.request("ping").promise).result, {});
    const abandoned = tool(eof, "context_create_and_bind", { display_name: "EOF绝不创建", user_confirmed: true, idempotency_key: "eof-create" });
    const rejected = assert.rejects(abandoned, /MCP closed/);
    await waitUntil(async () => (await readdir(f.attempts)).length >= count + 2);
    const start = performance.now(); await eof.close(); await rejected; assert.ok(performance.now() - start < 3000);
    const resumed = tool<Resolution>(survivor, "context_resolve");
    await waitUntil(async () => (await readdir(f.attempts)).length >= count + 3);
    await f.release(); await resumed; await f.health();
    const projects = await tool<ProjectList>(survivor, "context_list_projects");
    assert.ok(!projects.projects.some(project => ["取消绝不创建", "EOF绝不创建"].includes(project.display_name)));
    await Promise.all([a.close(), survivor.close()]); await f.stopHost();
  });
  t.signal.throwIfAborted();
  await t.test("a real offline owner remains held with its inode and data intact; a new request can recover after release", async st => {
    st.after(f.cleanupCase);
    await f.release(); const peers = storageOwnerProcesses(st), owner = await peers.start(join(f.home, "agent-runtime"));
    const acquired = await owner.request("acquire"); assert.equal(acquired.state, "held");
    const file = join(f.home, "agent-runtime", ".molis-runtime-owner.db"), before = await stat(file);
    const peer = await f.connect("busy-session");
    try {
      const answer = await peer.request("tools/call", { name: "molis_work_v1_context_resolve", arguments: {} }).promise;
      assert.match(JSON.stringify(answer), /storage\.owner\.busy/);
      const after = await stat(file); assert.equal(after.ino, before.ino); assert.equal(after.dev, before.dev);
      assert.deepEqual(await owner.request("borrow"), { state: "borrowed" }); await owner.request("release-borrow");
    } finally { await owner.stop(); }
    await tool<Resolution>(peer, "context_resolve"); await f.health(); await peer.close(); await f.stopHost();
  });
  t.signal.throwIfAborted();
  await t.test("a committed real create with a severed response reports delivery_unknown and never replays", async st => {
    st.after(f.cleanupCase); await f.release();
    const marker = join(f.root, "response-cut"), preload = fileURLToPath(new URL("./fixtures/mcp-autostart-cut-response.mjs", import.meta.url));
    const peer = await f.connect("unknown-session", { MOLIS_WORK_TEST_C5_CUT_ONCE: marker,
      MOLIS_WORK_TEST_C5_WEB_ENV: join(f.root, "web-env"),
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${JSON.stringify(preload)}` });
    const input = { display_name: "C5-delivery-cut", user_confirmed: true, idempotency_key: "delivery-unknown-create" };
    const reply = await peer.request("tools/call", { name: "molis_work_v1_context_create_and_bind", arguments: input }).promise;
    assert.match(JSON.stringify(reply), /actions\.delivery_unknown/); assert.equal(await readFile(marker, "utf8"), "response cut after the real result\n");
    assert.deepEqual(JSON.parse(await readFile(join(f.root, "web-env"), "utf8")), { runtime: null, session: null, home: f.home, cwd: f.home });
    const attempts = (await readdir(f.attempts)).length;
    assert.equal((await tool<ProjectList>(peer, "context_list_projects")).projects.filter(project => project.display_name === input.display_name).length, 1);
    assert.equal((await readdir(f.attempts)).length, attempts); await f.health(); await peer.close(); await f.stopHost();
  });
  t.signal.throwIfAborted();
  await t.test("invalid identity/payload/startup arguments and another installation on PATH cannot start anything", async st => {
    st.after(f.cleanupCase);
    const count = (await readdir(f.attempts)).length;
    const peer = await f.connect("invalid-session");
    for (const params of [
      { name: "not_a_tool", arguments: {} },
      { name: "molis_work_v1_context_resolve", arguments: false },
      { name: "molis_work_v1_context_bind", arguments: { project_id: "x", user_confirmed: "yes" } },
      { name: "molis_work_v1_context_resolve", arguments: { command: "/bin/echo", home: "/tmp/elsewhere", port: 9999 } },
      { name: "molis_work_v1_context_bind", arguments: { project_id: "x", user_confirmed: true, actor_id: "forged" } },
    ]) {
      const answer = await peer.request("tools/call", params).promise;
      assert.equal((answer.result as { isError: boolean }).isError, true);
    }
    const missing = await f.connect("no-home", { MOLIS_WORK_HOME: "" });
    assert.match(JSON.stringify(await missing.request("tools/call", { name: "molis_work_v1_context_resolve", arguments: {} }).promise), /home_required/);
    const zero = await f.connect("port-zero", { MOLIS_WORK_WEB_URL: "http://127.0.0.1:0" });
    assert.match(JSON.stringify(await zero.request("tools/call", { name: "molis_work_v1_context_resolve", arguments: {} }).promise), /transport_invalid/);
    assert.equal((await readdir(f.attempts)).length, count);
    const fake = join(f.root, "fake-path"), sentinel = join(f.root, "other-install-ran"); await mkdir(fake);
    await writeFile(join(fake, "molis-work-web"), `#!/bin/sh\necho wrong > '${sentinel}'\n`, { mode: 0o755 });
    const launcher = await readFile(f.installed.launchers.web, "utf8");
    await writeFile(f.installed.launchers.web, "", { mode: 0o644 });
    const { chmod } = await import("node:fs/promises"); await chmod(f.installed.launchers.web, 0o644);
    const pathPeer = await f.connect("wrong-path", { PATH: `${fake}:${process.env.PATH}` });
    assert.match(JSON.stringify(await pathPeer.request("tools/call", { name: "molis_work_v1_context_resolve", arguments: {} }).promise), /startup_entry_missing/);
    await assert.rejects(stat(sentinel), { code: "ENOENT" });
    await writeFile(f.installed.launchers.web, launcher); await chmod(f.installed.launchers.web, 0o755);
    await Promise.all([peer.close(), missing.close(), zero.close(), pathPeer.close()]);
  });
});
