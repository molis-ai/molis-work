import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { acquireUpgradedHomeOwner, createHomeSnapshot, homeUpgradeDescriptors, MolisWorkLocalHost, restoreHomeSnapshot, runHomeUpgrade, upgradeFingerprint } from "@molis-ai/molis-work-app-local-host";
import { inspectMolisWorkProjectCatalogSnapshot } from "@molis-ai/molis-work-app-desktop";
import { acceptanceActions, acceptanceRequestId, ACCEPTANCE_PROVIDER_ID, ACCEPTANCE_READ_PERMISSION, ACCEPTANCE_REPORT_PERMISSION, type AcceptanceReadResult } from "@molis-ai/molis-work-contracts/modules/acceptance";
import type { ReviewRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type { ProjectTrustedDecision } from "@molis-ai/molis-work-contracts/services/project-approvals";
import { openAcceptance, purgeAcceptanceProject } from "@molis-ai/molis-work-module-acceptance";
import { projectReviewDecisions } from "@molis-ai/molis-work-service-project-approvals";
import { todoActions } from "@molis-ai/molis-work-plugin-todo";
import { homeSqlitePath, openSqliteConnection } from "@molis-ai/molis-work-storage";
import { ADD_TAG, BASELINE_V2, homeIdentityOf, ledgerOf, notesDescriptor, relativeStore, seedStore, stampFile, useDescriptors, versionOf, writeLedger } from "./fixtures/home-upgrade-home.js";
import { runRollbackPair } from "./fixtures/plugin-home-rollback-pair.js";
import { openTestHome, serveTestHost } from "./fixtures/test-home.js";

for (const recovery of ["valid stamp", "unfinished upgrade"] as const) {
  test(`QEA-86: ${recovery} recovers Acceptance and its trusted decision before any business open`, { timeout: 60_000 }, async t => {
    const env = await openTestHome(t), project = await env.createProject("Atomic acceptance", ["todo"]);
    const person = await env.host.localPersonContext(project.reference), client = env.host.actionClient(project.reference);
    const { item } = await client.invoke(person, todoActions.create, { title: "Retained delivery", placement: "project" }) as { item: { id: string } };
    const metadata = await env.host.inspectActions(person, project.reference);
    const provider = metadata.find(row => row.provider.plugin_id === "io.molis.work.todo")!.provider.provider_id;
    const subject = { provider_id: provider, subject: { kind: "todo_item", id: item.id } };
    const agent = { ...person, audience: "agent" as const, permissions: [ACCEPTANCE_READ_PERMISSION, ACCEPTANCE_REPORT_PERMISSION] };
    const call = (action: { capability_id: string; version: number }, input: unknown) => client.invoke(agent, { ...action, provider_id: ACCEPTANCE_PROVIDER_ID }, input);
    await call(acceptanceActions.set, { subject, requirements: [{ id: "r1", statement: "Confirm the delivered item", requires_person: true }] });
    await call(acceptanceActions.deliver, { subject, version: "v1" });
    const lookup = { action: { capability_id: acceptanceActions.decide.capability_id, version: acceptanceActions.decide.version, provider_id: ACCEPTANCE_PROVIDER_ID }, request_id: acceptanceRequestId(subject) };
    const review = await env.web.post<ReviewRequest>(`/projects/${project.project_id}/api/project-approvals/request`, lookup);
    await env.close(); await env.host.close();
    runHomeUpgrade(env.home);
    const stamp = readFileSync(stampFile(env.home));
    const clean = join(env.home, "..", `qea-clean-${project.project_id}`);
    t.after(async () => { const { rm } = await import("node:fs/promises"); await rm(clean, { recursive: true, force: true }); });
    assert.equal((await createHomeSnapshot({ homeDirectory: env.home, destination: clean })).status, "created");

    const file = project.database_path, libraryFile = homeSqlitePath(env.home, "acceptance");
    for (const [path, table] of [[file, "project_review_decisions"], [libraryFile, "acceptance_decisions"]]) {
      const db = openSqliteConnection(path!, { fileMustExist: true });
      try {
        assert.equal(db.pragma("journal_mode", { simple: true }), "delete");
        db.exec(`CREATE TABLE qea_padding (id INTEGER PRIMARY KEY, payload BLOB NOT NULL);
          INSERT INTO qea_padding VALUES (1, zeroblob(32768));
          CREATE TRIGGER qea_pad_commit AFTER INSERT ON ${table} BEGIN UPDATE qea_padding SET payload=randomblob(33554432) WHERE id=1; END;`);
      } finally { db.close(); }
    }
    const marker = await runRollbackPair(t, { file, libraryFile }, true, JSON.stringify({ home: env.home, projectId: project.project_id, lookup }), "acceptance");
    assert.ok(marker);
    const before = [file, libraryFile, file + "-journal", libraryFile + "-journal", marker].map(path => readFileSync(path));
    assert.throws(() => openAcceptance(env.home), { code: "actions.conflict" });
    assert.throws(() => purgeAcceptanceProject(env.home, project.project_id), { code: "actions.conflict" });
    const snapshot = join(clean, "..", `qea-pending-${project.project_id}`);
    await assert.rejects(createHomeSnapshot({ homeDirectory: env.home, destination: snapshot }), { code: "host.home_snapshot.changed" });
    assert.equal(existsSync(snapshot), false);
    await assert.rejects(restoreHomeSnapshot({ homeDirectory: env.home, source: clean, inspectCatalog: inspectMolisWorkProjectCatalogSnapshot }), { code: "actions.conflict" });
    assert.deepEqual([file, libraryFile, file + "-journal", libraryFile + "-journal", marker].map(path => readFileSync(path)), before);

    let upgradeRan = false;
    if (recovery === "unfinished upgrade") {
      const notes = seedStore(env.home, "notes");
      useDescriptors(t, notesDescriptor("notes", { baseline: { ...BASELINE_V2, upgrades: [{ from: 1, run(db) {
        assert.equal(existsSync(marker), false);
        assert.equal(existsSync(libraryFile + "-journal"), false);
        db.exec(ADD_TAG); upgradeRan = true;
      } }] } }));
      mkdirSync(join(env.home, "upgrade"), { recursive: true });
      writeLedger(env.home, { schema_version: 1, home_identity: homeIdentityOf(env.home), run_id: "qea-acceptance-upgrade", from: null,
        to: upgradeFingerprint(homeUpgradeDescriptors()), started_at: "2026-11-17T00:00:00Z",
        units: [{ kind: "sqlite", owner: "tests/notes", relative_path: relativeStore("notes"), from: 1, to: 2, group: null, state: "planned", error: null }] });
      runHomeUpgrade(env.home);
      assert.equal(upgradeRan, true); assert.equal(versionOf(notes), 2);
      assert.equal(ledgerOf(env.home).run_id, "qea-acceptance-upgrade");
      assert.equal(ledgerOf(env.home).units[0]?.state, "committed");
    } else {
      acquireUpgradedHomeOwner(env.home).release();
      assert.deepEqual(readFileSync(stampFile(env.home)), stamp);
    }
    for (const path of [marker, file + "-journal", libraryFile + "-journal"]) assert.equal(existsSync(path), false);
    const host = new MolisWorkLocalHost({ homeDirectory: env.home, completeText: null }), server = await serveTestHost(null, { home: env.home, host });
    try {
      const prefix = `/projects/${project.project_id}/api`;
      const view = (await server.web.post<AcceptanceReadResult>(prefix + "/acceptance/read", { subjects: [subject] })).views[0]!;
      assert.equal(view.requirements[0]?.person, "pending");
      assert.equal(view.requirements[0]?.decision, null);
      await host.withProject(project.reference, ({ store }) => {
        assert.equal(store.db.prepare("SELECT count(*) AS n FROM project_review_decisions").get()?.n, 0);
        assert.equal(projectReviewDecisions(store.db, project.project_id).forRequest(view.review_reference!.id), null);
      });
      const acceptance = openSqliteConnection(libraryFile, { readonly: true });
      try { assert.equal(acceptance.prepare("SELECT count(*) AS n FROM acceptance_decisions").get()?.n, 0); }
      finally { acceptance.close(); }
      const command = { reference: review.reference, choice_id: "accept_all", request_key: "qea-interrupted-acceptance" };
      const committed = await server.web.post<{ record: ProjectTrustedDecision }>(prefix + "/project-approvals/decide", command);
      const replayed = await server.web.post<{ record: ProjectTrustedDecision }>(prefix + "/project-approvals/decide", command);
      assert.equal(replayed.record.decision_id, committed.record.decision_id);
      const accepted = (await server.web.post<AcceptanceReadResult>(prefix + "/acceptance/read", { subjects: [subject] })).views[0]!;
      assert.equal(accepted.requirements[0]?.person, "accepted");
      assert.equal(accepted.requirements[0]?.decision?.decision_id, committed.record.decision_id);
      await host.withProject(project.reference, ({ store }) => {
        assert.equal(store.db.prepare("SELECT count(*) AS n FROM project_review_decisions").get()?.n, 1);
      });
      const persisted = openSqliteConnection(libraryFile, { readonly: true });
      try { assert.equal(persisted.prepare("SELECT count(*) AS n FROM acceptance_decisions").get()?.n, 1); }
      finally { persisted.close(); }
    } finally { await server.close(); await host.close(); }
  });
}
