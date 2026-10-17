import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { silentVoiceWav } from "@molis-ai/molis-work-app-local-host";

const run = promisify(execFile);
const models = process.env.UIV_VOICE_MODEL_DIR;
const helper = process.env.UIV_JELLY_WHISPER_HELPER || fileURLToPath(new URL("../apps/local-host/native/materials/bin/jelly-whisper", import.meta.url));

test("UIV-08 UIV-09 native language detection preserves short Chinese and does not invent silent speech", { timeout: 180_000 }, async t => {
  if (process.platform !== "darwin" || !models || !existsSync(models) || !existsSync(helper)) {
    t.skip("A prepared local Whisper model and macOS helper are required; this synthetic regression does not replace human UIV-09 acceptance"); return;
  }
  const directory = await mkdtemp(join(tmpdir(), "molis-native-voice-language-"));
  try {
    const silence = join(directory, "silence.wav"); await writeFile(silence, silentVoiceWav());
    const chinese = fileURLToPath(new URL("./fixtures/unified-input/short-chinese.m4a", import.meta.url));
    const args = (audio: string) => ["-p", "(version 1)(allow default)(deny network*)", helper, "extract", audio, models, directory];
    const options = { timeout: 150_000, maxBuffer: 2_000_000 };
    const { stdout } = await run("/usr/bin/sandbox-exec", args(chinese), options);
    const result: { segments: { text: string }[] } = JSON.parse(stdout);
    assert.equal(result.segments.map(segment => segment.text).join("\n"), "今天核对统一输入", "compare the spoken content independently of the decoder implementation");
    // The helper rejects insufficient content; the production voice adapter maps this to its no-speech state.
    await assert.rejects(run("/usr/bin/sandbox-exec", args(silence), options), error => {
      assert.ok(error && typeof error === "object" && "code" in error && "stdout" in error);
      assert.equal(error.code, 1); assert.equal(typeof error.stdout, "string");
      const empty: Record<string, unknown> = JSON.parse(String(error.stdout));
      assert.equal(empty.error, "insufficient_content");
      assert.equal(empty.text, undefined, "silence must not invent draft text");
      return true;
    });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
