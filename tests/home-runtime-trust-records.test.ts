import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { MolisWorkLocalHost } from "@molis-ai/molis-work-app-local-host";
import { pluginManifestDigest, SqlitePluginConsentLedger } from "@molis-ai/molis-work-plugin-runtime";

const SHELF = "io.molis.work.shelf";
const pathOf = (home: string) => join(home, "plugin-runtime", "plugin-runtime.db");
function consents(home: string) {
  const db = new DatabaseSync(pathOf(home), { readOnly: true });
  try { return new SqlitePluginConsentLedger(db).consents(SHELF).filter(row => row.kind === "always_on"); }
  finally { db.close(); }
}
async function startShelf(home: string) {
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  try {
    await host.homePlugins!.ready();
    const install = host.homePlugins!.installation(SHELF), manifest = host.homePlugins!.manifest(SHELF);
    assert.ok(install && manifest);
    assert.equal(manifest.always_on, true);
    assert.equal(install.publisher_trust, "host");
    assert.equal(install.publisher_signature, manifest.publisher.signature);
    assert.equal(install.manifest_digest, pluginManifestDigest(manifest));
    return install;
  } finally { await host.homePlugins!.close(); await host.close(); }
}

// RAC-381-T1's actual Host assertions survive removal of its former migration rehearsal.
test("RAC-2366 RAC-381-T1 a new Home records build trust and consent once; restart never revives revoked consent", async () => {
  const home = mkdtempSync(join(tmpdir(), "clean-home-runtime-trust-"));
  try {
    const shelf = await startShelf(home), first = consents(home);
    const db = new DatabaseSync(pathOf(home), { readOnly: true });
    try {
      assert.equal(db.prepare("PRAGMA user_version").get()!.user_version, 1);
      assert.equal(db.prepare("PRAGMA integrity_check").get()!.integrity_check, "ok");
      assert.deepEqual(db.prepare("PRAGMA foreign_key_check").all(), []);
    } finally { db.close(); }
    assert.equal(first.length, 1);
    assert.deepEqual(first.map(({ plugin_id, publisher_signature, kind, subject, manifest_digest, granted_by, revoked_at }) =>
      ({ plugin_id, publisher_signature, kind, subject, manifest_digest, granted_by, revoked_at })), [{
      plugin_id: SHELF, publisher_signature: shelf.publisher_signature, kind: "always_on", subject: "always_on",
      manifest_digest: shelf.manifest_digest, granted_by: "host_build", revoked_at: null,
    }]);
    assert.match(first[0]!.granted_at, /^\d{4}-\d\d-\d\dT/u);
    assert.equal((await startShelf(home)).install_id, shelf.install_id);
    assert.deepEqual(consents(home), first);
    const revokedAt = "2026-10-24T00:00:00.000Z", writable = new DatabaseSync(pathOf(home));
    try { writable.prepare("UPDATE plugin_consents SET revoked_at = ? WHERE consent_id = ?").run(revokedAt, first[0]!.consent_id); }
    finally { writable.close(); }
    const revoked = first.map(row => ({ ...row, revoked_at: revokedAt }));
    assert.deepEqual(consents(home), revoked);
    await startShelf(home);
    assert.deepEqual(consents(home), revoked);
  } finally { rmSync(home, { recursive: true, force: true }); }
});
