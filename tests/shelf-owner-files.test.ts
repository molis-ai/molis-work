import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import type { PluginOwnerFilesClient, PluginOwnerFilesWriter } from "@molis-ai/molis-work-contracts/platform/plugin";
import { openShelfStore } from "@molis-ai/molis-work-module-shelf";
import { SHELF_OWNER_FILES } from "@molis-ai/molis-work-plugin-shelf";
import { openHostShelfFiles, openHostShelfStore } from "@molis-ai/molis-work-app-local-host";
import { shelfTestAi, shelfTestReceipt } from "./shelf-test-ai.js";

/** PG-026 (specs/repository-anti-corruption/privileges.md): Shelf keeps its files through the owner-files client, over the entries it declares. */

async function withHome<T>(run: (home: string, root: string) => Promise<T>): Promise<T> {
  const home = mkdtempSync(join(tmpdir(), "shelf-owner-files-"));
  try { return await run(home, join(home, SHELF_OWNER_FILES.store_name)); }
  finally { rmSync(home, { recursive: true, force: true }); }
}

/** The event log's whole-file append, written the way the store writes it. */
function appendLine(writer: PluginOwnerFilesWriter, file: string, message: string): void {
  const before = writer.read(file);
  const line = Buffer.from(`${JSON.stringify({ message })}\n`);
  writer.replaceFileAtomic(file, before ? Buffer.concat([Buffer.from(before), line]) : line);
}

const linesOf = (bytes: string | Buffer): string[] => String(bytes).split("\n").filter(Boolean).map(line => (JSON.parse(line) as { message: string }).message);

test("PG-026-S1-1 Shelf declares its catalog, copies and jobs, and nothing else", () => {
  assert.equal(SHELF_OWNER_FILES.store_name, "shelf");
  assert.deepEqual(SHELF_OWNER_FILES.entries, [
    { name: "catalog.json", kind: "file" }, { name: "files", kind: "directory" }, { name: "jobs", kind: "directory" },
  ]);
});

test("PG-026-S1-2 a write outside the declared entries, or off a strict relative path, is refused and creates nothing", async () => {
  await withHome(async (home, root) => {
    const files = openHostShelfFiles(home);
    for (const relative of ["../x", "x.txt", "other/file", "/tmp/x", "files/../x", "files//a", "files/a\\b", "jobs/a\u0000b", "settings.json"]) {
      await assert.rejects(files.write(writer => writer.writeFile(relative, Buffer.from("refused"), "create")), { code: "host.owner_file_invalid" }, relative);
      await assert.rejects(files.write(writer => writer.mkdir(relative)), { code: "host.owner_file_invalid" }, relative);
      assert.throws(() => files.stat(relative), { code: "host.owner_file_invalid" }, relative);
      assert.throws(() => files.read(relative), { code: "host.owner_file_invalid" }, relative);
    }
    // A declared top-level directory cannot be removed as a whole, and a file entry has no children.
    await assert.rejects(files.write(writer => writer.removeTree("files")));
    await assert.rejects(files.write(writer => writer.writeFile("catalog.json/child", Buffer.from("refused"), "create")), { code: "host.owner_file_invalid" });
    assert.equal(existsSync(join(dirname(home), "x")), false, "nothing lands beside the Home");
    assert.equal(existsSync(join(home, "x.txt")), false);
    assert.equal(existsSync(join(root, "x.txt")), false);
    assert.deepEqual(readdirSync(home).filter(name => name !== SHELF_OWNER_FILES.store_name), []);
  });
});

test("PG-026-S1-3 a link in place of a declared directory is refused, and the target outside stays empty", async () => {
  await withHome(async (home, root) => {
    const outside = join(home, "outside");
    mkdirSync(outside); mkdirSync(root);
    symlinkSync(outside, join(root, "files"));
    const files = openHostShelfFiles(home);
    await assert.rejects(files.write(writer => writer.writeFile("files/a.txt", Buffer.from("refused"), "create")), { code: "host.owner_file_unsafe" });
    assert.throws(() => files.list("files"), { code: "host.owner_file_unsafe" });
    assert.deepEqual(readdirSync(outside), []);
  });
});

test("PG-026-S1-4 the write callback must finish synchronously, and its writer stops working once it returns", async () => {
  await withHome(async (home, root) => {
    const files = openHostShelfFiles(home);
    await assert.rejects(files.write(async writer => { writer.mkdir("files/pending"); }), { code: "actions.async_required" });
    let kept: PluginOwnerFilesWriter | undefined;
    await files.write(writer => { kept = writer; writer.mkdir("files/kept"); });
    assert.ok(kept);
    assert.throws(() => kept!.mkdir("files/late"), { code: "actions.expired" });
    assert.throws(() => kept!.replaceFileAtomic("catalog.json", Buffer.from("late")), { code: "actions.expired" });
    assert.throws(() => kept!.read("catalog.json"), { code: "actions.expired" });
    assert.equal(existsSync(join(root, "files", "late")), false);
    assert.equal(existsSync(join(root, "catalog.json")), false);
    assert.equal(existsSync(join(root, "files", "kept")), true);
  });
});

test("PG-026-S1-5 events.jsonl is replaced as a whole file: read, one line added, swapped in", async () => {
  await withHome(async (home, root) => {
    const files = openHostShelfFiles(home), file = "jobs/job_1/events.jsonl";
    await files.write(writer => { writer.mkdir("jobs/job_1"); appendLine(writer, file, "复制到只读 input/"); });
    const first = readFileSync(join(root, file), "utf8");
    assert.equal(first, `${JSON.stringify({ message: "复制到只读 input/" })}\n`);
    await files.write(writer => appendLine(writer, file, "写入 output/"));
    const second = readFileSync(join(root, file), "utf8");
    assert.equal(second, `${first}${JSON.stringify({ message: "写入 output/" })}\n`, "the earlier line is kept byte for byte");
    assert.deepEqual(linesOf(files.read(file)!), ["复制到只读 input/", "写入 output/"]);
    assert.deepEqual(readdirSync(join(root, "jobs", "job_1")), ["events.jsonl"], "no temporary file is left beside it");
  });
});

test("PG-026-S1-6 many appends started together lose no line", async () => {
  await withHome(async (home, root) => {
    const files = openHostShelfFiles(home), file = "jobs/job_1/events.jsonl", count = 40;
    await files.write(writer => writer.mkdir("jobs/job_1"));
    await Promise.all(Array.from({ length: count }, (_, index) => files.write(writer => appendLine(writer, file, `line ${index}`))));
    const lines = linesOf(readFileSync(join(root, file), "utf8"));
    assert.equal(lines.length, count);
    assert.deepEqual([...lines].sort(), Array.from({ length: count }, (_, index) => `line ${index}`).sort());
  });
});

test("PG-026-S1-7 a real job writes its events through the client, and the catalog keeps every row of work started together", async () => {
  await withHome(async (home, root) => {
    const store = openHostShelfStore(home, { disabled: true }, {}, shelfTestAi());
    const [one, two] = await Promise.all([
      store.admit({ filename: "one.md", bytes: Buffer.from("# 一\n第一份材料"), mime: "text/markdown" }),
      store.admit({ filename: "two.md", bytes: Buffer.from("# 二\n第二份材料"), mime: "text/markdown" }),
    ]);
    await Promise.all([store.addClipboard("clip one"), store.addClipboard("clip two")]);
    const [first, second] = await Promise.all([
      store.runJob({ recipe: "summarize", item_id: one.item_id }),
      store.runJob({ recipe: "summarize", item_id: two.item_id }),
    ]);
    const snapshot = await store.snapshot();
    assert.deepEqual(snapshot.materials.map(item => item.name).sort(), ["one.md", "two.md"]);
    assert.equal(snapshot.clipboard.length, 2, "two clipboard rows added together are both kept");
    assert.equal(snapshot.results.length, 2, "two jobs finished together leave two results");
    assert.equal(snapshot.running_jobs.length, 0);
    for (const outcome of [first, second]) {
      const events = linesOf(readFileSync(join(root, "jobs", outcome.job.job_id, "events.jsonl"), "utf8"));
      assert.deepEqual(events, ["复制到只读 input/", "写入 output/"]);
    }
  });
});

test("PG-026-S1-8 a missing catalog reads as an empty shelf, and the first write creates it with the sample copy beside it", async () => {
  await withHome(async (home, root) => {
    const store = openHostShelfStore(home, { disabled: true });
    assert.doesNotThrow(() => store.settings(), "a missing catalog still gives the default settings");
    assert.equal(existsSync(join(root, "catalog.json")), false, "reading creates no catalog");
    const first = await store.snapshot();
    assert.deepEqual([first.results, first.clipboard, first.running_jobs], [[], [], []]);
    assert.deepEqual(first.materials.map(item => item.name), ["试用示例.pdf"], "the first look seeds the sample, as before");
    const catalog = JSON.parse(readFileSync(join(root, "catalog.json"), "utf8")) as { items: Array<{ relative_path: string }> };
    assert.equal(catalog.items.length, 1);
    assert.equal(existsSync(join(root, catalog.items[0]!.relative_path)), true, "the sample copy was written under files/ through the client");
    await store.addClipboard("first clip");
    assert.equal((await store.snapshot()).clipboard.length, 1);
  });
});

test("PG-026-S1-9 a cancel decides on the run's row as its write finds it: a run that finished meanwhile keeps its record", async () => {
  await withHome(async (home, root) => {
    // The catalog while a real run is going, and after it finished.
    const source = mkdtempSync(join(tmpdir(), "shelf-owner-files-source-"));
    let running: Buffer, finished: Buffer, jobId: string;
    try {
      let enter!: () => void, release!: () => void;
      const started = new Promise<void>(resolve => { enter = resolve; }), held = new Promise<void>(resolve => { release = resolve; });
      const real = openHostShelfStore(source, { disabled: true }, {}, shelfTestAi(async () => { enter(); await held; return { text: "摘要", execution: shelfTestReceipt }; }));
      const item = await real.admit({ filename: "材料.md", bytes: Buffer.from("原材料"), mime: "text/markdown" });
      const pending = real.runJob({ recipe: "summarize", item_id: item.item_id });
      await started;
      running = readFileSync(join(source, SHELF_OWNER_FILES.store_name, "catalog.json"));
      release();
      jobId = (await pending).job.job_id;
      finished = readFileSync(join(source, SHELF_OWNER_FILES.store_name, "catalog.json"));
    } finally { rmSync(source, { recursive: true, force: true }); }
    // A client whose writes wait their turn, as one across a process boundary would (S2's services.ownerFiles).
    const host = openHostShelfFiles(home);
    let open!: () => void;
    const turn = new Promise<void>(resolve => { open = resolve; });
    const files: PluginOwnerFilesClient = { rootPath: () => host.rootPath(), stat: relative => host.stat(relative), read: relative => host.read(relative), list: relative => host.list(relative),
      write: <Result>(run: (writer: PluginOwnerFilesWriter) => Result) => turn.then(() => host.write(run)) };
    await host.write(writer => writer.replaceFileAtomic("catalog.json", running));
    const cancelling = openShelfStore(root, files, { disabled: true }).cancelJob(jobId);
    // The run finishes after the cancel read its row and before the cancel's write lands.
    await host.write(writer => writer.replaceFileAtomic("catalog.json", finished));
    open();
    assert.equal((await cancelling).status, "succeeded", "the cancel answers with the record the run left");
    const catalog = JSON.parse(readFileSync(join(root, "catalog.json"), "utf8")) as { jobs: Array<{ job_id: string; status: string; result_item_id: string | null }> };
    const row = catalog.jobs.find(job => job.job_id === jobId);
    assert.equal(row?.status, "succeeded", "a finished run is not rewritten as cancelled");
    assert.ok(row?.result_item_id, "the finished run still points at its result");
  });
});
