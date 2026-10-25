import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ActionError, LOCAL_PERSON_ACTOR_ID, type ActionCallContext } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionService } from "@molis-ai/molis-work-kernel";
import { MemoryPluginConsentLedger, PLUGIN_TRUST_SCHEMA_SQL, SqlitePluginConsentLedger, alwaysOnAgreed, type PluginConsentLedger } from "@molis-ai/molis-work-plugin-runtime";
import { HomeConsentLedger, MolisWorkLocalHost, PLUGIN_CONSENT_PERMISSIONS, pluginConsentActions, pluginConsentProvider } from "@molis-ai/molis-work-app-local-host";

// S-77 (ac-trust T5): an agreement is taken back by the person and only the person. Revoking writes `revoked_at` once and nothing else
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

test("RAC-385 S-77 the memory ledger: revoking writes revoked_at once, answers the row, and an unknown id answers nothing", () => revokesOnce(memory()));
test("RAC-385 S-77 the sqlite ledger: revoking writes revoked_at once, answers the row, and an unknown id answers nothing", () => revokesOnce(sqlite()));
test("RAC-385 S-77 the memory ledger: the host's build does not agree again once a person took the agreement back", () => hostDoesNotAgreeAgain(memory()));
test("RAC-385 S-77 the sqlite ledger: the host's build does not agree again once a person took the agreement back", () => hostDoesNotAgreeAgain(sqlite()));

function service(ledger: PluginConsentLedger) {
  const actions = new ActionService();
  actions.registerProvider(pluginConsentProvider(ledger));
  const caller = (extra: Partial<ActionCallContext> = {}): ActionCallContext => ({ actor_id: LOCAL_PERSON_ACTOR_ID, project_id: null, audience: "user", permissions: PLUGIN_CONSENT_PERMISSIONS, ...extra });
  const revoke = (consent_id: string, context: ActionCallContext) =>
    actions.invoke(context, { capability_id: pluginConsentActions.revoke.capability_id, version: 1 }, { consent_id });
  return { actions, caller, revoke };
}

class ObservedLedger extends MemoryPluginConsentLedger {
  reads = 0;
  writes = 0;
  override consents(pluginId: string) { this.reads += 1; return super.consents(pluginId); }
  override revoke(id: string, at: string) { this.writes += 1; return super.revoke(id, at); }
}

test("RAC-393-ENTRY RAC-393-LIST S-77 both actions refuse non-user audiences and fabricated settings provenance before touching the ledger", async () => {
  const ledger = new ObservedLedger();
  const row = record(ledger);
  const { actions, caller, revoke } = service(ledger);
  const list = (context: ActionCallContext) => actions.invoke(context, pluginConsentActions.list, { plugin_id: GOALS });
  ledger.reads = 0; ledger.writes = 0;
  for (const audience of ["agent", "mcp", "workflow", "plugin"] as const) {
    const context = caller({ audience });
    assert.deepEqual((await actions.discover(context)).filter(view => view.capability_id.startsWith("plugins.consents.")), [], `${audience} does not see them`);
    await assert.rejects(list(context), code("actions.forbidden"), `${audience} cannot list`);
    await assert.rejects(revoke(row.consent_id, context), code("actions.forbidden"), `${audience} cannot revoke`);
    assert.deepEqual([ledger.reads, ledger.writes], [0, 0], `${audience} never touched the ledger`);
  }
  for (const user_action of [undefined, { source: "web", conversation_ref: "web:settings:plugin-consents", message_ref: "web:request:forged" }]) {
    const context = caller({ user_action });
    await assert.rejects(list(context), code("actions.forbidden"));
    await assert.rejects(revoke(row.consent_id, context), code("actions.forbidden"));
  }
  assert.deepEqual([ledger.reads, ledger.writes], [0, 0], "even a user with matching audit text has no Host settings credential");
  assert.deepEqual(ledger.consents(GOALS), [row], "every rejection preserves the original ledger");
});

test("RAC-385 S-77 the Host agrees to Goals' 常开 once at startup, and a person's revocation stands across the next start", async () => {
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

test("RAC-393 S-77 the Host registers the consent actions with its other platform providers: system providers that belong to no plugin", async () => {
  const home = await mkdtemp(join(tmpdir(), "molis-work-consent-providers-"));
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  try {
    const views = await host.inspectActionMetadata({ actor_id: "local-person", project_id: null, audience: "user", permissions: PLUGIN_CONSENT_PERMISSIONS });
    const consents = views.filter(view => view.capability_id.startsWith("plugins.consents."));
    assert.deepEqual(consents.map(view => view.capability_id).sort(), [pluginConsentActions.list.capability_id, pluginConsentActions.revoke.capability_id].sort());
    for (const view of consents) assert.deepEqual([view.provider.kind, view.provider.plugin_id], ["system", undefined]);
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});
