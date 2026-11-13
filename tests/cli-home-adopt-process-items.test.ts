import assert from "node:assert/strict";
import test from "node:test";
import { openTestHome } from "./fixtures/test-home.js";
import { runLocalHomeCli } from "../apps/local-host/src/cli-home.js";

// BL-local-space-process-items-adoption: a Home without account sync gets the same explicit adoption through the offline CLI, after
// the Host is stopped. The command takes the storage owner, adopts every project library, and only then retires Files' consents and
// project memberships. The real adoption itself is covered by files-era-adoption/process-items-adoption; this checks the entry.
test("BL-local-space-process-items-adoption the offline CLI adopts a local Home after the Host stops", async t => {
  const home = await openTestHome(t);
  await home.createProject("Local adoption");
  await home.close();
  await home.host.close();
  assert.equal(await runLocalHomeCli(["adopt-process-items", "--confirm", "--home", home.home, "--json"]), 0);
});

test("BL-local-space-process-items-adoption the CLI refuses without --confirm", async () => {
  await assert.rejects(() => runLocalHomeCli(["adopt-process-items", "--home", "/tmp/no-such-home"]), /--confirm/u);
});
