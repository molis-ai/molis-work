import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { pluginManifestDigest, SqlitePluginConsentLedger } from "@molis-ai/molis-work-plugin-runtime";

const SHELF = "system.shelf";
const pathOf = (home: string) => join(home, "plugin-runtime", "plugin-runtime.db");
function consents(home: string) {
  const db = new DatabaseSync(pathOf(home), { readOnly: true });
  try { return new SqlitePluginConsentLedger(db).consents(SHELF); }
  finally { db.close(); }
}
async function startShelf(home: string) {
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  try {
    await host.homePlugins!.ready();
    const install = host.homePlugins!.installation(SHELF), manifest = host.homePlugins!.manifest(SHELF);
    assert.ok(install && manifest);
    assert.equal(install.publisher_trust, "host");
    assert.equal(install.publisher_signature, manifest.publisher.signature);
    assert.equal(install.manifest_digest, pluginManifestDigest(manifest));
    return install;
  } finally { await host.homePlugins!.close(); await host.close(); }
}

// RAC-381-T1's actual Host assertions survive removal of its former migration rehearsal.
test("RAC-2366 RAC-381-T1 a new Home records build trust once, and the Host agrees to nothing for the platform part Shelf", async () => {
  const home = mkdtempSync(join(tmpdir(), "clean-home-runtime-trust-"));
  try {
    const shelf = await startShelf(home), first = consents(home);
    const db = new DatabaseSync(pathOf(home), { readOnly: true });
    try {
      assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 1);
      assert.equal(db.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok");
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    } finally { db.close(); }
    assert.deepEqual(first, [], "Shelf declares nothing that asks for an agreement (44B: nothing is 常开)");
    assert.equal((await startShelf(home)).install_id, shelf.install_id, "the next start keeps the same installation");
    assert.deepEqual(consents(home), []);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
