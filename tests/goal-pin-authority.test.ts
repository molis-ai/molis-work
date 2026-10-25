import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActionError, bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { MolisWorkLocalHost, molisWorkHostProjectReference } from "@molis-ai/molis-work-app-local-host";
import { pagesActions, PAGES_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-pages";
import { openPagesStore } from "./fixtures/plugin-home-stores.js";
import { goalsActions, goalsArtifactInputActions, goalsDeliverableActions, GOALS_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-goals";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";

for (const role of [goalsDeliverableActions, goalsArtifactInputActions]) for (const phase of ["before_dispatch", "after_pin"] as const)
  for (const interruption of ["revoke_parent", "cancel", "disable_parent", "archive_goal"] as const) {
    if (interruption === "archive_goal" && phase === "before_dispatch") continue;
    test(`W2-18-GOAL-PIN-01 W2-18-GOAL-PIN-02 ${role.pin.capability_id} ${phase} ${interruption}: real Host/Pages preserve parent control and committed owner facts`, { timeout: 20_000 }, async () => {
      const home = await mkdtemp(join(tmpdir(), "goal-pin-authority-"));
      let disabled = false, parentAllowed = true, holding = false, release = () => {}, reached = () => {};
      const gate = new Promise<void>(resolve => { release = resolve; }), barrier = new Promise<void>(resolve => { reached = resolve; });
      const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: (_caller, action) =>
        disabled && action.capability_id === role.pin.capability_id ? { available: false, code: "actions.plugin_disabled", reason: "Parent disabled" } : { available: true } });
      const ref = molisWorkHostProjectReference({ projectId: "board", databasePath: join(home, "project.sqlite") });
      const user: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", audience: "user", project_id: "board",
        permissions: [...GOALS_ACTION_PERMISSIONS, ...PAGES_ACTION_PERMISSIONS] };
      const client = host.actionClient(ref), abort = new AbortController();
      const actions = bindActionClient(client, () => user);
      try {
        const { coordinator: app, artifacts } = await host.withProject(ref, runtime => runtime);
        app.initializeBoard({ project_id: "board", actor_id: user.actor_id, idempotency_key: "board" });
        await actions.invoke(goalsActions.create, { goal_id: "G1", title: "Delivery", outcome: "Pinned result", requirements: [{ requirement_id: "delivered", statement: "Ready" }], idempotency_key: "goal" });
        if (interruption === "archive_goal") {
          await actions.invoke(goalsActions.configure, { goal_id: "G1", expected_version: 0, idempotency_key: "delivery-type",
            types: [{ type_id: "delivery", version: 1, name: "Delivery", purpose: "Actual result", fields: [{ field_id: "body", name: "Body", purpose: "Evidence", format: "text", required: true }] }],
            requirement_bindings: [{ type_id: "delivery", requirement_id: "delivered" }] });
          await actions.invoke(goalsActions.report, { goal_id: "G1", idempotency_key: "delivery-report", events: [{ type_id: "delivery", type_version: 1,
            title: "Ready", fields: { body: "Pinned result" }, judgments: [{ requirement_id: "delivered", verdict: "supports" }] }] });
          const state = await actions.invoke(goalsActions.state, { goal_id: "G1" });
          const closed = await actions.invoke(goalsActions.close, { goal_id: "G1", kind: "complete", result: "Ready", reason: "Done",
            expected_config_version: state.config.version, expected_agreement_version: state.agreement.version, idempotency_key: "complete" });
          assert.equal(closed.work_status, "completed");
        }
        const created = await actions.invoke(pagesActions.create, { title: "Pinned", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Keep this snapshot" }] }] } });
        const subject = { kind: "pages_document", id: created.document.id }, artifactId = "pages-" + created.document.id;
        // The Runtime's Pages re-asks the original caller between its own commits, still inside its call and holding the project's queue.
        // "After the owner's async return" is the parent's own next check, once Pages has finished and recorded the pin.
        const pagesReturned = () => { const pages = openPagesStore(home); try { return pages.get(created.document.id, "board").artifact_version === 1; } finally { pages.close(); } };
        const assertGrant = (target?: ActionReference) => {
          if (target?.capability_id === role.pin.capability_id && !parentAllowed) throw new ActionError("actions.forbidden", "Only the parent's exact grant was revoked");
        };
        // This trusted caller's live grant keeps Pages allowed. The barrier is in the real dispatch validation, never in a fake owner.
        const caller: ActionCallContext = { ...user, actor_id: "mcp:pin-fixture", actor_kind: "runtime", runtime_session_id: "pin-session", audience: "mcp", signal: abort.signal,
          assert_authority_current: assertGrant,
          validate_authority: async target => {
            const committed = artifacts.query.getArtifactVersion("board", { artifact_id: artifactId, version: 1 }) !== null;
            if (!holding && (phase === "before_dispatch" ? target.capability_id === pagesActions.artifactPin.capability_id
              : target.capability_id === role.pin.capability_id && committed && pagesReturned())) {
              holding = true; reached(); await gate;
            }
            assertGrant(target);
          } };
        const pending = client.invoke(caller, role.pin, { goal_id: "G1", subject });
        const settled = pending.then(() => "completed", () => "refused");
        assert.equal(await Promise.race([barrier.then(() => "barrier"), settled]), "barrier", "the parent must check again after the owner's async return");
        const fixedAtBarrier = artifacts.query.listArtifactVersions("board", artifactId);
        assert.equal(fixedAtBarrier.length, phase === "after_pin" ? 1 : 0);
        if (interruption === "revoke_parent") parentAllowed = false;
        if (interruption === "cancel") abort.abort(new ActionError("actions.cancelled", "Cancelled"));
        if (interruption === "disable_parent") disabled = true;
        if (interruption === "archive_goal") await actions.invoke(goalsActions.archive, { goal_id: "G1", archived: true, reason: "Archive completed Goal", idempotency_key: "archive" });
        release();
        const code = { revoke_parent: "actions.forbidden", cancel: "actions.cancelled", disable_parent: "actions.plugin_disabled", archive_goal: "goals.not_found" }[interruption];
        await assert.rejects(pending, { code });
        if (interruption === "archive_goal") {
          const edges = await host.withProject(ref, runtime => createContextLedger(runtime.store.db, { authorize: () => true }).query.list({ actor_id: user.actor_id, scope: { kind: "personal", id: "board" } }));
          assert.deepEqual(edges.filter(edge => edge.source.module === "goals" && edge.source.id === "G1"), []);
          await assert.rejects(client.invoke(user, role.list, { goal_id: "G1" }), { code: "goals.not_found" });
        } else {
          const listed = await client.invoke(user, role.list, { goal_id: "G1" }) as { deliverables?: unknown[]; inputs?: unknown[] };
          assert.deepEqual(listed.deliverables ?? listed.inputs, []);
        }
        const versions = artifacts.query.listArtifactVersions("board", artifactId);
        assert.deepEqual(versions.map(row => row.version), phase === "after_pin" ? [1] : []);
        if (phase === "after_pin" && interruption !== "archive_goal") {
          parentAllowed = true; disabled = false;
          const input = { goal_id: "G1", reference: { artifact_id: artifactId, version: 1 } };
          await client.invoke(user, role.add, input);
          assert.equal((await client.invoke(user, role.add, input) as { replayed: boolean }).replayed, true);
          assert.deepEqual(artifacts.query.listArtifactVersions("board", artifactId).map(row => row.version), [1], "recovering the committed owner version does not pin it again");
        }
      } finally { release(); await host.close(); await rm(home, { recursive: true, force: true }); }
    });
  }
