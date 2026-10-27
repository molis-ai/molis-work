import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, LOCAL_OWNER_PERMISSIONS, molisWorkHostProjectReference, type ActionAvailabilityPolicy } from "@molis-ai/molis-work-app-local-host";
import { knowledgeManageActions, type KnowledgeCardsResponse } from "@molis-ai/molis-work-contracts/services/knowledge";
import type { ActionCallContext, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { openKnowledgeCards } from "@molis-ai/molis-work-storage";

// Production project Host, Coding owner and Knowledge management actions. The policy's second command check is beforeEffect;
// discovery uses its own unchanged snapshot, so it cannot accidentally trip this asynchronous command boundary.
test("MEM-40 S-71 Knowledge management rechecks the original card after its actual beforeEffect boundary", { timeout: 60_000 }, async t => {
  for (const operation of ["edit", "exclude", "organize"] as const) await t.test(operation, async t => {
    const home = await mkdtemp(join(tmpdir(), "knowledge-management-retention-"));
    const entered = Promise.withResolvers<void>(), release = Promise.withResolvers<void>();
    let armed = false, checks = 0;
    const successfulRetentionReads = new Set<string>();
    const definition = knowledgeManageActions[operation];
    const availability: ActionAvailabilityPolicy = Object.assign(async (caller: ActionCallContext, view: ActionView) => {
      if (armed && view.capability_id === definition.capability_id && ++checks === 2) {
        assert.ok(caller.call_id);
        assert.ok(successfulRetentionReads.has(caller.call_id),
          "this same actual operation already completed its owner's retention read; the barrier is after initial card visibility");
        armed = false; entered.resolve(); await release.promise;
      }
      return { available: true as const };
    }, { snapshotForDiscovery: () => () => ({ available: true as const }) });
    const catalog = await openMolisWorkProjectCatalog({ homeDirectory: home });
    let host: MolisWorkLocalHost | undefined;
    try {
      const project = await catalog.createProject({ display_name: "Retention management", actor_id: "web-user" });
      catalog.addProjectPlugin({ project_id: project.project_id, plugin_id: "coding", actor_id: "web-user" });
      host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null, actionAvailability: availability });
      const productionClient = host.actionClient.bind(host);
      host.actionClient = (...args) => {
        const client = productionClient(...args);
        return { ...client, invoke: async (caller, reference, input) => {
          const result = await client.invoke(caller, reference, input);
          if (reference.capability_id === "coding.subject.retention" && caller.call_id) successfulRetentionReads.add(caller.call_id);
          return result;
        } };
      };
      const reference = molisWorkHostProjectReference({ databasePath: project.database_path, projectId: project.project_id });
      const client = host.actionClient(reference);
      const caller: ActionCallContext = { actor_id: "web-user", project_id: project.project_id, audience: "user", permissions: [...LOCAL_OWNER_PERMISSIONS] };
      const views = await client.discover(caller);
      const invoke = async (capability: string, input: unknown) => {
        const view = views.find(view => view.capability_id === capability); assert.ok(view, capability);
        return client.invoke(caller, { capability_id: view.capability_id, version: view.version, provider_id: view.provider.provider_id }, input);
      };
      const created = await invoke("coding.sessions.create", { title: "Original source" }) as { session: { session_id: string } };
      const session_id = created.session.session_id, subject = { kind: "coding_session", id: session_id };
      for (const deadline = Date.now() + 10_000;;) {
        const listing = await invoke(knowledgeManageActions.cards.capability_id, {}) as KnowledgeCardsResponse;
        if (listing.cards.some(card => card.subject.id === session_id)) break;
        assert.ok(Date.now() < deadline, "the ordinary production catalog creates its real source card");
        await new Promise(resolve => setTimeout(resolve, 20));
      }
      const cards = openKnowledgeCards({ homeDirectory: home });
      try {
        const before = cards.get(project.project_id, subject)!;
        cards.put({ ...before, state: "failed", error: "earlier organize failed" });
        const original = cards.get(project.project_id, subject)!;
        armed = true;
        const pending = invoke(definition.capability_id, operation === "edit" ? { subject, brief: "Must not be written" }
          : operation === "exclude" ? { subject, excluded: true } : { subjects: [subject] });
        const rejected = assert.rejects(pending);
        await Promise.race([entered.promise, pending.then(() => { throw new Error("management bypassed beforeEffect"); })]);
        assert.deepEqual(cards.get(project.project_id, subject), original, "the command has not written before its effect boundary");
        const preview = await invoke("coding.sessions.archive.preview", { session_id }) as { archive_decision: unknown };
        await invoke("coding.sessions.update", { session_id, archive: true, archive_decision: preview.archive_decision });
        release.resolve(); await rejected;
        assert.deepEqual(cards.get(project.project_id, subject), original, "archive during beforeEffect neither edits nor queues the retained original");
      } finally { cards.close(); }
    } finally {
      release.resolve(); await host?.close(); catalog.close(); await rm(home, { recursive: true, force: true });
    }
  });
});
