// @requires-platform darwin
import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { PLUGIN_ROUTE_STREAM_LIMITS } from "@molis-ai/molis-work-plugin-sdk";
import { openTestHome } from "./fixtures/test-home.js";

async function until(condition: () => boolean, message: string): Promise<void> {
  const end = Date.now() + 5_000;
  while (!condition() && Date.now() < end) await delay(25);
  assert.ok(condition(), message);
}

// QEA-24: real HTTP, action authorization, native extraction process and artifact persistence.
// The speech helper supplies deterministic text; this does not assess a real transcription model.
for (const raw of [false, true]) for (const mode of ["response", "stream", "progress-overflow"] as const) {
  const streamed = mode !== "response", overflow = mode === "progress-overflow";
  test(`QEA-24 ${raw ? "raw" : "JSON"} ${mode} import stops extraction on ${overflow ? "excess progress" : "disconnect"} before saving; retry saves once`,
    { timeout: 60_000, skip: process.platform !== "darwin" }, async t => {
      const home = await openTestHome(t, { host: { completeText: null } });
      const project = await home.createProject("Import cancellation");
      const helper = join(home.home, "speech-helper"), started = join(home.home, "started"), release = join(home.home, "release");
      await writeFile(helper, `#!${process.execPath}
const fs = require('node:fs');
fs.writeFileSync(${JSON.stringify(started)}, String(process.pid));
const overflowing=${overflow}&&!fs.existsSync(${JSON.stringify(release)}), start=Date.now();
for(let i=0;i<(overflowing?${PLUGIN_ROUTE_STREAM_LIMITS.lines + 1}:1);i++) process.stderr.write(JSON.stringify({stage:'transcribing',progress:0.25})+'\\n');
const timer=setInterval(()=>{if(fs.existsSync(${JSON.stringify(release)}) || overflowing && Date.now()-start>1000){
 clearInterval(timer); process.stdout.write(JSON.stringify({text:'Recognized speech.',extractor:'fixture',pages:[],coverage:{status:'sufficient',processed_pages:0,total_pages:0,issues:[]}}));
}},25);
setTimeout(()=>process.exit(2),15000).unref();
`, { mode: 0o700 });
      const previous = process.env.MOLIS_MATERIAL_WHISPER_HELPER;
      process.env.MOLIS_MATERIAL_WHISPER_HELPER = helper;
      t.after(() => { if (previous === undefined) delete process.env.MOLIS_MATERIAL_WHISPER_HELPER; else process.env.MOLIS_MATERIAL_WHISPER_HELPER = previous; });
      const prefix = `/projects/${project.project_id}/api/artifacts`;
      const bytes = raw ? Buffer.alloc(6 * 1024 * 1024 + 1, 97) : Buffer.from("speech input");
      const post = (signal?: AbortSignal) => fetch(home.origin + prefix + (raw ? "/import/original" : "/import"), {
        method: "POST", signal,
        headers: { origin: home.origin, "x-molis-work-control-token": home.controlToken, "x-molis-work-idempotency-key": randomUUID(),
          "content-type": raw ? "audio/mp4" : "application/json", ...raw ? { "x-molis-work-filename": "recording.m4a" } : {},
          ...streamed ? { accept: "application/x-ndjson" } : {} },
        body: raw ? bytes : JSON.stringify({ source: "file", filename: "recording.m4a", original_file: { filename: "recording.m4a", mime: "audio/mp4", data_base64: bytes.toString("base64") } }),
      }).then(async response => ({ status: response.status, text: await response.text() }));
      await home.web.get(prefix + "/versions"); // Finish normal project/runtime startup before observing the extractor.
      const controller = new AbortController();
      const pending = post(controller.signal);
      void pending.catch(() => {}); // Cleanup may abort before the helper-start assertion succeeds.
      const cancelled = overflow ? undefined : assert.rejects(pending, { name: "AbortError" });
      try {
        await until(() => existsSync(started), "the actual extraction process starts");
        const pid = Number(readFileSync(started, "utf8"));
        if (overflow) {
          const response = await pending;
          assert.equal(response.status, 200);
          const final = JSON.parse(response.text.trim().split("\n").at(-1)!);
          assert.equal(final.type, "error"); assert.equal(final.code, "actions.output_invalid");
        } else { controller.abort(); await cancelled; }
        await until(() => { try { process.kill(pid, 0); return false; } catch (error) { return (error as NodeJS.ErrnoException).code === "ESRCH"; } }, "cancellation reaches and stops the extraction process");
        assert.deepEqual((await home.web.get<{ versions: unknown[] }>(prefix + "/versions")).versions, [], "cancelled extraction registers no artifact version; retained content-addressed originals are not claimed absent");
      } finally { controller.abort(); await writeFile(release, "finish"); }
      const parse = (text: string) => streamed ? JSON.parse(text.trim().split("\n").at(-1)!).result : JSON.parse(text);
      const first = await post();
      assert.equal(first.status, streamed ? 200 : 201, first.text);
      const saved = parse(first.text);
      assert.equal(saved.version, 1); assert.equal(saved.reused, false);
      const again = await post();
      assert.equal(again.status, 200, again.text);
      const reused = parse(again.text);
      assert.equal(reused.artifact_id, saved.artifact_id); assert.equal(reused.version, 1); assert.equal(reused.reused, true);
      assert.equal((await home.web.get<{ versions: unknown[] }>(prefix + "/versions")).versions.length, 1);
    });
}
