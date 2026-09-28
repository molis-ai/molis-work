import assert from "node:assert/strict";
import test from "node:test";
import { chmodSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readCliHelp } from "../modules/shelf/src/runtimes.js";

test("a CLI help probe that times out is asked again instead of being remembered as having no headless entry", t => {
  const bin = mkdtempSync(join(tmpdir(), "shelf-cli-probe-"));
  t.after(() => rmSync(bin, { recursive: true, force: true }));
  const cli = join(bin, "claude");
  // First start is slower than the 3 s probe budget, as a cold CLI can be. `exec` so the timeout ends the only
  // process holding the output pipe, instead of leaving an orphaned sleep that decides when the probe returns.
  writeFileSync(cli, "#!/bin/sh\nexec sleep 5\n"); chmodSync(cli, 0o755);
  assert.equal(readCliHelp(cli).includes("--print"), false);
  writeFileSync(cli, "#!/bin/sh\necho '  --print Print response and exit'\n"); chmodSync(cli, 0o755);
  assert.match(readCliHelp(cli), /--print/);
  // A completed answer is kept.
  writeFileSync(cli, "#!/bin/sh\necho 'changed'\n"); chmodSync(cli, 0o755);
  assert.match(readCliHelp(cli), /--print/);
});
