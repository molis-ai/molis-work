import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { createMolisWorkWebServer } from "../apps/desktop/launchers/web/server.js";

// W3-01 F: 设置 › 诊断 looks a call up by its 诊断编号, and the call history shows the id of each row. The pages are served by the real Host
// from a call log it wrote itself, so what is shown is what a person copying an id from an error would find.

const A = "a1b2c3d4-0001-4000-8000-000000000001"; // a command turned away before it ran
const B = "b2c3d4e5-0002-4000-8000-000000000002"; // a read that failed
const C = "c3d4e5f6-0003-4000-8000-000000000003"; // the Host's own typed command, which worked
const D = "d4e5f607-0004-4000-8000-000000000004"; // a command in no project that ran and failed
const E1 = "e1000001-0005-4000-8000-000000000005", E2 = "e2000002-0005-4000-8000-000000000006", E3 = "e3000003-0005-4000-8000-000000000007"; // one failure, three times
const GONE = "f4000004-0006-4000-8000-000000000008"; // a command of a project that was deleted since

const rowsOf = (html: string) => [...html.matchAll(/<article data-call-row[\s\S]*?<\/article>/g)].map(match => match[0]);
const idsOf = (html: string) => [...html.matchAll(/data-molis-call-id="([^"]+)"/g)].map(match => match[1]);

async function withPages(run: (context: { read: (path: string) => Promise<string>; base: string; host: MolisWorkLocalHost; projectId: string;
  record: (id: string, capability: string, title: string, outcome: Record<string, unknown>, over?: Record<string, unknown>, call?: Record<string, unknown>) => void }) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "call-diagnostics-"));
  const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
  const created = await catalog.createProject({ display_name: "诊断范围", actor_id: "test" });
  const host = new MolisWorkLocalHost({ homeDirectory: home, functions: { env: {} } });
  const server = createMolisWorkWebServer({ homeDirectory: home, localHost: host, controlToken: "call-diagnostics-test-control-token" });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address(); assert.ok(address && typeof address === "object");
    const base = `http://127.0.0.1:${address.port}`;
    const read = async (path: string) => { const response = await fetch(base + path); assert.equal(response.status, 200, path); return response.text(); };
    const record = (id: string, capability: string, title: string, outcome: Record<string, unknown>, over: Record<string, unknown> = {}, call: Record<string, unknown> = {}) =>
      host.callLog!.record({ actor_id: "web-user", project_id: created.project_id, audience: "user", permissions: [], call_id: id, ...over } as never,
        { capability_id: capability, version: 1, provider_id: "system.fixture", operation: "command", title, provider_title: "测试服务", ...call } as never, outcome as never);
    await run({ read, base, host, projectId: created.project_id, record });
  } finally {
    if (server.listening) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await host.close(); catalog.close(); await rm(home, { recursive: true, force: true });
  }
}

const refused = { ok: false, code: "test.disconnected", message: "此原因不会被记录", refused: true };
const seed = (context: Parameters<Parameters<typeof withPages>[0]>[0]) => {
  const { record } = context;
  record(A, "test.fixture.write", "保存设置", refused);
  record(B, "test.fixture.read", "读取目录", { ok: false, code: "test.broken", message: "读取内容不会被记录" }, {}, { operation: "query" });
  record(C, "test.fixture.host", "宿主写入", { ok: true }, { actor_id: "local-host" }, { path: "typed" });
  record(D, "test.fixture.disk", "写入磁盘", { ok: false, code: "test.disk_full", message: "磁盘已满" }, { project_id: null });
  for (const id of [E1, E2, E3]) record(id, "test.fixture.sync", "同步目录", { ok: false, code: "test.sync_failed", message: "同步失败" });
};

test("the diagnostics page lists the rows of the operation whose 诊断编号 is asked for, by its first characters, in any letter case", { timeout: 60_000 }, async () => {
  await withPages(async context => {
    seed(context);
    const { read, projectId } = context;
    const page = await read("/settings/diagnostics?call=a1b2c3d4");
    assert.deepEqual(idsOf(page), [A], "only the operation asked for");
    const [row] = rowsOf(page);
    assert.match(row!, /保存设置/);
    assert.match(row!, /<span class="is-unavailable">未执行<\/span>/, "a refused call reads as not run, not as failed");
    assert.match(row!, /诊断编号 a1b2c3d4/, "the short form a person sees");
    assert.match(row!, /aria-label="复制诊断编号 a1b2c3d4"/);
    assert.match(row!, new RegExp(`data-molis-call-id="${A}"`), "the whole id is what the button copies");
    assert.doesNotMatch(row!, /data-copy-value/, "one hook for the copy: the request helper's handler is in the Workbench's program too, so a mounted page needs no second one");
    assert.match(row!, /测试服务/);
    assert.match(row!, /test\.disconnected/, "the error code is kept");
    assert.doesNotMatch(page, /此原因不会被记录/, "the reason a refusal gave is not kept, so it is not shown");
    assert.match(page, /<div class="capability-history"><p role="status">找到 1 条记录<\/p><article data-call-row/, "the count sits at the head of the rows it counts");
    assert.doesNotMatch(page, /capability-count/, "the count line is not the capability index's, whose 24px side padding would set it off from the field and the rows");
    assert.match(row!, /诊断范围/, "which project it was in");
    assert.match(row!, new RegExp(`href="/capabilities/history\\?project=${projectId}"`), "and where that project's call history is");
    assert.match(page, /value="a1b2c3d4"/, "the lookup box keeps what was asked");
    assert.match(page, /data-settings-section="diagnostics"/);
    assert.match(page, /安装状态/, "it is still the diagnostics page, with the installation under the lookup");

    assert.deepEqual(idsOf(await read("/settings/diagnostics?call=A1B2C3")), [A], "six characters are enough, and case does not matter");
    assert.deepEqual(idsOf(await read("/settings/diagnostics?call=%20a1b2c3d4%20")), [A], "spaces around a pasted id are not part of it");
    assert.deepEqual(idsOf(await read(`/settings/diagnostics?call=${A}`)), [A], "the whole id works");
    // A call of no project is found too, and says so; it links to the call history of Home.
    const home = rowsOf(await read("/settings/diagnostics?call=d4e5f607"))[0]!;
    assert.match(home, /写入磁盘/);
    assert.match(home, /失败原因：磁盘已满/, "a command that ran and failed keeps the line of what went wrong");
    assert.match(home, /不属于任何项目/);
    assert.match(home, /href="\/capabilities\/history"/);
  });
});

test("the diagnostics page opened on its own copies a 诊断编号 with the shared request helper's handler and carries no second one", { timeout: 60_000 }, async () => {
  await withPages(async context => {
    seed(context);
    const page = await context.read("/settings/diagnostics?call=a1b2c3d4");
    assert.match(page, /molisCallCopy/, "the page installs the request helper, whose handler copies every [data-molis-call-id] button");
    assert.equal((page.match(/closest\??\.?\(["']\[data-molis-call-id\]["']\)/g) ?? []).length, 1, "one handler for the button, so one click is one copy and one message");
    assert.doesNotMatch(page, /诊断编号已复制/, "this page's own copy script was taken out when the helper arrived");
  });
});

test("an operation that made the same call three times is one row, found by any of its ids, and shows the one that was asked for", { timeout: 60_000 }, async () => {
  await withPages(async context => {
    seed(context);
    const { read } = context;
    assert.deepEqual(idsOf(await read("/settings/diagnostics?call=e1000001")), [E1]);
    assert.deepEqual(idsOf(await read("/settings/diagnostics?call=e2000002")), [E2]);
    const newest = await read("/settings/diagnostics?call=e3000003");
    assert.deepEqual(idsOf(newest), [E3]);
    assert.match(rowsOf(newest)[0]!, /连续 3 次相同结果/);
    // Without a lookup the same row is listed once, under its newest id.
    assert.deepEqual(idsOf(await read("/settings/diagnostics")).filter(id => id.startsWith("e")), [E3]);
  });
});

test("an id that is not in the log, and one that is too short to look for, are told so instead of listing something else", { timeout: 60_000 }, async () => {
  await withPages(async context => {
    seed(context);
    const { read } = context;
    const missing = await read("/settings/diagnostics?call=ffffffff");
    assert.deepEqual(idsOf(missing), []);
    assert.match(missing, /没有找到以 ffffffff 开头的诊断编号/);
    assert.match(missing, /安装状态/);
    const short = await read("/settings/diagnostics?call=a1b2c");
    assert.deepEqual(idsOf(short), [], "five characters would match too much to be a lookup");
    assert.match(short, /诊断编号至少要 6 位/);
    assert.deepEqual(idsOf(await read("/settings/diagnostics?call=")), idsOf(await read("/settings/diagnostics")), "an empty box is no lookup");
  });
});

test("with no id asked for, the page lists the newest failed or refused calls of every project, and never a call that worked", { timeout: 60_000 }, async () => {
  await withPages(async context => {
    seed(context);
    const { read } = context;
    const page = await read("/settings/diagnostics");
    assert.deepEqual(idsOf(page), [E3, D, B, A], "newest first; the Host's own command that worked (C) is not a problem to look into");
    assert.match(page, /最近失败或未执行的调用/);
    assert.match(page, /连续 3 次相同结果/);
  });
});

test("the list of recent problems stops at twenty", { timeout: 60_000 }, async () => {
  await withPages(async ({ read, record }) => {
    for (let n = 0; n < 25; n++) record(`${n.toString(16).padStart(8, "0")}-0007-4000-8000-000000000000`, `test.fixture.many${n}`, `操作 ${n}`, { ok: false, code: "test.broken", message: "x" });
    const ids = idsOf(await read("/settings/diagnostics"));
    assert.equal(ids.length, 20);
    assert.equal(ids[0], "00000018-0007-4000-8000-000000000000", "the newest is first");
  });
});

test("an empty log says there is nothing to look into", { timeout: 60_000 }, async () => {
  await withPages(async ({ read }) => {
    const page = await read("/settings/diagnostics");
    assert.deepEqual(idsOf(page), []);
    assert.match(page, /最近没有失败或未执行的调用/);
  });
});

test("what is typed into the lookup is escaped and cut, and a call of a deleted project has no link to its history", { timeout: 60_000 }, async () => {
  await withPages(async context => {
    seed(context);
    const { read, record } = context;
    const hostile = await read(`/settings/diagnostics?call=${encodeURIComponent('"><script>alert(1)</script>')}`);
    assert.doesNotMatch(hostile, /<script>alert\(1\)<\/script>/);
    assert.match(hostile, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.doesNotMatch(await read(`/settings/diagnostics?call=${"x".repeat(500)}`), /x{65}/, "an address pasted whole is not echoed back whole");
    record(GONE, "test.fixture.gone", "已删项目的操作", { ok: false, code: "test.broken", message: "x" }, { project_id: "removed-project" });
    const gone = rowsOf(await read("/settings/diagnostics?call=f4000004"))[0]!;
    assert.match(gone, /已不存在的项目/);
    assert.doesNotMatch(gone, /href=/, "that project's call history would not open");
  });
});

test("the lookup keeps the settings context and the desktop shell, and the installation API is not given the call rows", { timeout: 60_000 }, async () => {
  await withPages(async context => {
    seed(context);
    const { read, base, projectId } = context;
    const page = await read(`/settings/diagnostics?project=${projectId}&desktop=1`);
    const form = page.match(/<form[^>]*data-call-lookup[^>]*>/)?.[0] ?? "";
    assert.match(form, /action="\/settings\/diagnostics"/);
    assert.match(form, /method="get"/);
    assert.match(page, new RegExp(`<input type="hidden" name="project" value="${projectId}">`));
    assert.match(page, /<input type="hidden" name="desktop" value="1">/);
    const found = await read(`/settings/diagnostics?call=d4e5f607&desktop=1`);
    assert.match(rowsOf(found)[0]!, /href="\/capabilities\/history\?desktop=1"/, "the link to a call history keeps the desktop shell");
    const api = await (await fetch(base + "/api/settings/diagnostics")).json() as Record<string, unknown>;
    assert.deepEqual(Object.keys(api).sort(), ["home_directory", "installation_state", "launchers", "project_count", "release_directory", "version"],
      "the page's call rows are not part of the installation diagnostics, which other readers compare field by field");
  });
});

test("the call history shows the id of every row with a copy button, 未执行 for a refusal, and Molis Work for the Host's own calls", { timeout: 60_000 }, async () => {
  await withPages(async context => {
    seed(context);
    const { read, projectId } = context;
    const history = await read(`/capabilities/history?project=${projectId}`);
    assert.deepEqual(idsOf(history), [E3, C, B, A], "every row has its id (a folded one its newest)");
    const byId = (id: string) => rowsOf(history).find(row => row.includes(`data-molis-call-id="${id}"`))!;
    assert.match(byId(A), /<span class="is-unavailable">未执行<\/span>/);
    assert.match(byId(A), /· 你 ·/);
    assert.match(byId(C), /· Molis Work ·/, "a call the Host made for itself is not shown as the person's");
    assert.doesNotMatch(byId(C), /· 你 ·/);
    assert.match(byId(B), /<span class="is-unavailable">失败<\/span>/);
    assert.match(byId(A), /诊断编号 a1b2c3d4/);
    assert.match(history, /href="\/settings\/diagnostics[^"]*"/, "and the page says where to look an id up");
    assert.deepEqual(idsOf(await read("/capabilities/history")), [D]);
  });
});
