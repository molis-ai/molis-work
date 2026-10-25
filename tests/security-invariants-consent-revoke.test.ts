import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ActionError, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { MemoryPluginConsentLedger, PLUGIN_TRUST_SCHEMA_SQL, SqlitePluginConsentLedger, alwaysOnAgreed, type PluginConsentLedger } from "@molis-ai/molis-work-plugin-runtime";
import { HomeConsentLedger, MolisWorkLocalHost, PLUGIN_CONSENT_PERMISSIONS, pluginConsentActions, pluginConsentProvider } from "@molis-ai/molis-work-app-local-host";

// S-X4 (ac-trust T5): an agreement is taken back by the person and only the person. Revoking writes `revoked_at` once and nothing else
// is rewritten; the host's own build does not agree again afterwards; what stood on the agreement (the 常开 list) stops at once.

const GOALS = "io.molis.work.goals";
const SIGNATURE = "goals-signature";
const AT = "2026-10-25T00:00:00.000Z";
const LATER = "2026-10-26T00:00:00.000Z";
const record = (ledger: PluginConsentLedger, grantedBy: "user" | "host_build" = "host_build") =>
  ledger.record({ plugin_id: GOALS, publisher_signature: SIGNATURE, manifest_digest: "digest", granted_by: grantedBy, grants: [{ kind: "always_on", subject: "always_on" }], at: AT })[0]!;
const code = (expected: string) => (error: unknown) => error instanceof ActionError && error.code === expected;

const memory = (): PluginConsentLedger => new MemoryPluginConsentLedger();
const sqlite = (): PluginConsentLedger => { const db = new DatabaseSync(":memory:"); db.exec(PLUGIN_TRUST_SCHEMA_SQL); return new SqlitePluginConsentLedger(db as never); };

function revokesOnce(ledger: PluginConsentLedger): void {
  const row = record(ledger);
  assert.equal(alwaysOnAgreed(ledger, GOALS, SIGNATURE), true);
  assert.deepEqual(ledger.revoke(row.consent_id, AT), { ...row, revoked_at: AT });
  assert.equal(ledger.revoke(row.consent_id, LATER)?.revoked_at, AT, "revoking again keeps the first time");
  assert.equal(ledger.revoke("no-such-row", AT), null);
  assert.equal(alwaysOnAgreed(ledger, GOALS, SIGNATURE), false, "the standing agreement is gone at once");
  assert.deepEqual(ledger.consents(GOALS).map(item => [item.consent_id, item.granted_by, item.revoked_at]), [[row.consent_id, "host_build", AT]], "the row stays, with who agreed");
}

function hostDoesNotAgreeAgain(ledger: PluginConsentLedger): void {
  const row = record(ledger);
  ledger.revoke(row.consent_id, AT);
  assert.deepEqual(record(ledger, "host_build"), undefined, "the next start of the Host writes nothing");
  assert.equal(alwaysOnAgreed(ledger, GOALS, SIGNATURE), false);
  const again = record(ledger, "user");
  assert.notEqual(again.consent_id, row.consent_id);
  assert.equal(alwaysOnAgreed(ledger, GOALS, SIGNATURE), true, "agreeing again is the person's own act");
}

test("RAC-385 S-X4 the memory ledger: revoking writes revoked_at once, answers the row, and an unknown id answers nothing", () => revokesOnce(memory()));
test("RAC-385 S-X4 the sqlite ledger: revoking writes revoked_at once, answers the row, and an unknown id answers nothing", () => revokesOnce(sqlite()));
test("RAC-385 S-X4 the memory ledger: the host's build does not agree again once a person took the agreement back", () => hostDoesNotAgreeAgain(memory()));
test("RAC-385 S-X4 the sqlite ledger: the host's build does not agree again once a person took the agreement back", () => hostDoesNotAgreeAgain(sqlite()));

function service(ledger: PluginConsentLedger) {
  const actions = new ActionService();
  actions.registerProvider(pluginConsentProvider(ledger));
  const caller = (extra: Partial<ActionCallContext> = {}): ActionCallContext => ({ actor_id: "local-person", audience: "user", permissions: PLUGIN_CONSENT_PERMISSIONS, ...extra });
  const revoke = (consent_id: string, context: ActionCallContext) =>
    actions.invoke(context, { capability_id: pluginConsentActions.revoke.capability_id, version: 1 }, { consent_id });
  return { actions, caller, revoke };
}

test("RAC-393 S-X4 only the person's own action revokes: no other audience sees the action, and a user call without the protected entry's user_action is refused", async () => {
  const ledger = new MemoryPluginConsentLedger();
  const row = record(ledger);
  const { actions, caller, revoke } = service(ledger);
  for (const audience of ["agent", "mcp", "workflow", "plugin"] as const) {
    assert.deepEqual((await actions.discover(caller({ audience }))).filter(view => view.capability_id.startsWith("plugins.consents.")), [], `${audience} does not see them`);
    await assert.rejects(revoke(row.consent_id, caller({ audience })), error => error instanceof ActionError, `${audience} cannot call them`);
  }
  await assert.rejects(revoke(row.consent_id, caller()), code("actions.forbidden"), "the entry gave no user action");
  assert.equal(alwaysOnAgreed(ledger, GOALS, SIGNATURE), true, "nothing was revoked");
});

test("RAC-385 S-X4 the person lists a plugin's agreements and takes one back; an unknown id is refused", async () => {
  const ledger = new MemoryPluginConsentLedger();
  const row = record(ledger);
  const { actions, caller, revoke } = service(ledger);
  const person = caller({ user_action: { source: "web", conversation_ref: "web:settings", message_ref: "web:click" } });
  const list = () => actions.invoke(person, { capability_id: pluginConsentActions.list.capability_id, version: 1 }, { plugin_id: GOALS });
  assert.deepEqual(((await list()) as { consents: unknown[] }).consents, [row]);
  const revoked = (await revoke(row.consent_id, person)) as { consent: { revoked_at: string | null } };
  assert.notEqual(revoked.consent.revoked_at, null);
  assert.equal(((await list()) as { consents: Array<{ revoked_at: string | null }> }).consents[0]!.revoked_at, revoked.consent.revoked_at);
  await assert.rejects(revoke("no-such-row", person), code("plugin.consent_unknown"));
  assert.equal(alwaysOnAgreed(ledger, GOALS, SIGNATURE), false);
});

test("RAC-385 S-X4 the Host agrees to Goals' 常开 once at startup, and a person's revocation stands across the next start", async () => {
  const home = await mkdtemp(join(tmpdir(), "molis-work-consent-startup-"));
  const start = async () => { const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null }); await host.homePlugins!.ready(); await host.homePlugins!.close(); await host.close(); };
  const goalsAgreements = () => new HomeConsentLedger(home).consents(GOALS).filter(row => row.kind === "always_on");
  try {
    await start();
    const [first, ...others] = goalsAgreements();
    assert.deepEqual([others.length, first!.granted_by, first!.revoked_at], [0, "host_build", null]);
    await start();
    assert.deepEqual(goalsAgreements(), [first], "the next start writes nothing");
    new HomeConsentLedger(home).revoke(first!.consent_id, AT);
    await start();
    assert.deepEqual(goalsAgreements(), [{ ...first!, revoked_at: AT }], "the Host does not agree again after the person took it back");
  } finally { await rm(home, { recursive: true, force: true }); }
});
