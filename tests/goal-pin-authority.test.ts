import assert from "node:assert/strict";
import test from "node:test";
import { ActionError, bindActionClient, LOCAL_PERSON_ACTOR_ID, type ActionCallContext, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import { pagesActions, PAGES_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-pages";
import { goalsActions, goalsArtifactInputActions, goalsDeliverableActions, GOALS_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-goals";
import { createContextLedger } from "@molis-ai/molis-work-module-context-ledger";
import { homeSqlitePath, openSqliteConnection } from "@molis-ai/molis-work-storage";
import { openTestHome } from "./fixtures/test-home.js";

for (const role of [goalsDeliverableActions, goalsArtifactInputActions]) for (const phase of ["before_dispatch", "after_pin"] as const)
  for (const interruption of ["revoke_parent", "cancel", "disable_parent", "archive_goal"] as const) {
    if (interruption === "archive_goal" && phase === "before_dispatch") continue;
    test(`W2-18-GOAL-PIN-01 W2-18-GOAL-PIN-02 ${role.pin.capability_id} ${phase} ${interruption}: real Host/Pages preserve parent control and committed owner facts`, { timeout: 20_000 }, async t => {
      let disabled = false, parentAllowed = true, holding = false, release = () => {}, reached = () => {};
      const gate = new Promise<void>(resolve => { release = resolve; }), barrier = new Promise<void>(resolve => { reached = resolve; });
      const h = await openTestHome(t, { host: { actionAvailability: (_caller, action) =>
        disabled && action.capability_id === role.pin.capability_id ? { available: false, code: "actions.plugin_disabled", reason: "Parent disabled" } : { available: true } } });
      const { host, home } = h, project = await h.createProject("Goal and Pages pin", ["pages"]);
      const ref = project.reference, projectId = project.project_id;
      const user: ActionCallContext = { actor_id: LOCAL_PERSON_ACTOR_ID, actor_kind: "user", audience: "user", project_id: projectId,
        permissions: [...GOALS_ACTION_PERMISSIONS, ...PAGES_ACTION_PERMISSIONS] };
      const client = host.actionClient(ref), abort = new AbortController();
      const actions = bindActionClient(client, () => user);
      try {
        const { artifacts } = await host.withProject(ref, runtime => runtime);
        await actions.invoke(goalsActions.create, { goal_id: "G1", title: "Delivery", outcome: "Pinned result", requirements: [{ requirement_id: "delivered", statement: "Ready" }], idempotency_key: "goal" });
        if (interruption === "archive_goal") {
          await actions.invoke(goalsActions.configure, { goal_id: "G1", expected_version: 0, idempotency_key: "delivery-type",
            types: [{ type_id: "delivery", version: 1, name: "Delivery", purpose: "Actual result", fields: [{ field_id: "body", name: "Body", purpose: "Evidence", format: "text", required: true }] }],
            requirement_bindings: [{ type_id: "delivery", requirement_id: "delivered" }] });
          await actions.invoke(goalsActions.report, { goal_id: "G1", idempotency_key: "delivery-report", events: [{ type_id: "delivery", type_version: 1,
            title: "Ready", fields: { body: "Pinned result" }, judgments: [{ requirement_id: "delivered", verdict: "supports" }] }] });
          // A report alone is the reporter's own word (PWA-144): the person accepts the requirement through the protected entry before completing.
          await client.invoke({ ...user, user_action: { source: "web", conversation_ref: "goal-pin", message_ref: "accept-delivered" } }, goalsActions.decide,
            { goal_id: "G1", idempotency_key: "accept-delivered", conclusion: "Delivered result accepted", accepts_requirements: true, scope: { requirement_ids: ["delivered"] } });
          const state = await actions.invoke(goalsActions.state, { goal_id: "G1" });
          const closed = await actions.invoke(goalsActions.close, { goal_id: "G1", kind: "complete", result: "Ready", reason: "Done",
            expected_config_version: state.config.version, expected_agreement_version: state.agreement.version, idempotency_key: "complete" });
          assert.equal(closed.work_status, "completed");
        }
        const created = await actions.invoke(pagesActions.create, { title: "Pinned", body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Keep this snapshot" }] }] } });
        const subject = { kind: "pages_document", id: created.document.id }, artifactId = "pages-" + created.document.id;
        // The parent must check again once Pages commits its own atomic pin.
        const pagesReturned = () => {
          const pages = openSqliteConnection(homeSqlitePath(home, "pages"), { readonly: true });
          try { return pages.prepare("SELECT artifact_version FROM pages WHERE id=? AND project_id=?").get(created.document.id, projectId)?.artifact_version === 1; }
          finally { pages.close(); }
        };
        const assertGrant = (target?: ActionReference) => {
          if (target?.capability_id === role.pin.capability_id && !parentAllowed) throw new ActionError("actions.forbidden", "Only the parent's exact grant was revoked");
        };
        // This trusted caller's live grant keeps Pages allowed. The barrier is in the real dispatch validation, never in a fake owner.
        const caller: ActionCallContext = { ...user, actor_id: "mcp:pin-fixture", actor_kind: "runtime", runtime_session_id: "pin-session", audience: "mcp", signal: abort.signal,
          assert_authority_current: assertGrant,
          validate_authority: async target => {
            const committed = artifacts.query.getArtifactVersion(projectId, { artifact_id: artifactId, version: 1 }) !== null;
            if (!holding && (phase === "before_dispatch" ? target.capability_id === pagesActions.artifactPin.capability_id
              : target.capability_id === role.pin.capability_id && committed && pagesReturned())) {
              holding = true; reached(); await gate;
            }
            assertGrant(target);
          } };
        const pending = client.invoke(caller, role.pin, { goal_id: "G1", subject });
        const settled = pending.then(() => "completed", () => "refused");
        assert.equal(await Promise.race([barrier.then(() => "barrier"), settled]), "barrier", "the parent must check again after the owner's async return");
        const fixedAtBarrier = artifacts.query.listArtifactVersions(projectId, artifactId);
        assert.equal(fixedAtBarrier.length, phase === "after_pin" ? 1 : 0);
        if (interruption === "revoke_parent") parentAllowed = false;
        if (interruption === "cancel") abort.abort(new ActionError("actions.cancelled", "Cancelled"));
        if (interruption === "disable_parent") disabled = true;
        if (interruption === "archive_goal") await actions.invoke(goalsActions.archive, { goal_id: "G1", archived: true, reason: "Archive completed Goal", idempotency_key: "archive" });
        release();
        const code = { revoke_parent: "actions.forbidden", cancel: "actions.cancelled", disable_parent: "actions.plugin_disabled", archive_goal: "goals.not_found" }[interruption];
        await assert.rejects(pending, { code });
        if (interruption === "archive_goal") {
          const edges = await host.withProject(ref, runtime => createContextLedger(runtime.store.db, { authorize: () => true }).query.list({ actor_id: user.actor_id, scope: { kind: "personal", id: projectId } }));
          assert.deepEqual(edges.filter(edge => edge.source.module === "goals" && edge.source.id === "G1"), []);
          await assert.rejects(client.invoke(user, role.list, { goal_id: "G1" }), { code: "goals.not_found" });
        } else {
          const listed = await client.invoke(user, role.list, { goal_id: "G1" }) as { deliverables?: unknown[]; inputs?: unknown[] };
          assert.deepEqual(listed.deliverables ?? listed.inputs, []);
        }
        const versions = artifacts.query.listArtifactVersions(projectId, artifactId);
        assert.deepEqual(versions.map(row => row.version), phase === "after_pin" ? [1] : []);
        if (phase === "after_pin" && interruption !== "archive_goal") {
          parentAllowed = true; disabled = false;
          const input = { goal_id: "G1", reference: { artifact_id: artifactId, version: 1 } };
          await client.invoke(user, role.add, input);
          assert.equal((await client.invoke(user, role.add, input) as { replayed: boolean }).replayed, true);
          assert.deepEqual(artifacts.query.listArtifactVersions(projectId, artifactId).map(row => row.version), [1], "recovering the committed owner version does not pin it again");
        }
      } finally { release(); }
    });
  }
