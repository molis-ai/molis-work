import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { MolisWorkLocalHost, molisWorkHostProjectReference, createLocalFeedApplication, createLocalFeedSourceService, seedDemoBoard, DEMO_BOARD_ID } from "@molis-ai/molis-work-app-local-host";
import { bindActionClient, type ActionCallContext, type ActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SurfaceFocus } from "@molis-ai/molis-work-contracts/services/contextual";
import { contextualCandidates } from "@molis-ai/molis-work-kernel";
import { GOALS_ACTION_PERMISSIONS } from "@molis-ai/molis-work-plugin-goals";
import type { FunctionsHostOptions } from "../apps/local-host/src/functions-host.js";
import { homeActions, HOME_ACTION_PERMISSIONS } from "../apps/local-host/src/home-actions.js";
import { prepareSubjectOffers } from "../apps/local-host/src/contextual/contextual-service.js";

/**
 * One set of recommendations (specs/archive/contextual-interaction §6.4.3): on the same Feed and Inbox items, what the Home /
 * Dock prepares, recommends and runs is what the contextual service prepares — the same offers under the same keys —
 * and the rule's recommendation lands on those keys. Run before and after moving the Dock onto the service.
 */
test("the Dock and the contextual service see one set: same offers and keys, the rule recommends among them, the run is the same", async () => {
  const home = await mkdtemp(join(tmpdir(), "contextual-dock-parity-"));
  const databasePath = join(home, "project.db"); seedDemoBoard(databasePath);
  const reference = molisWorkHostProjectReference({ databasePath, boardId: DEMO_BOARD_ID, projectId: "parity-project" });
  const caller: ActionCallContext = { actor_id: "owner", project_id: reference.project_id, audience: "user", permissions: [...HOME_ACTION_PERMISSIONS, "inbox:write", ...GOALS_ACTION_PERMISSIONS] };
  const options: FunctionsHostOptions = { env: { TYPESAFE_API_KEY: "fixture-only" }, provider: {
    async evaluate(_key, record) {
      return { primitive: "choice", choice: "inbox.done", probabilities: { "inbox.done": 1 }, confidence: null, model: record.model, noul: null, score: null, legend: null };
    },
  } };
  const host = new MolisWorkLocalHost({ homeDirectory: home, functions: options });
  try {
    const runtime = await host.withProject(reference, runtime => runtime);
    const feed = createLocalFeedApplication(runtime.store.db);
    const source = createLocalFeedSourceService(runtime.store.db, reference.board_id).register({ kind: "research_library", repository: "molis-ai/research-library", research_source: "parity" }).source;
    const items = [1, 2, 3].map(n => feed.ingestItem({ source, externalId: `parity-${n}`, title: `材料 ${n}`, summary: `摘要 ${n}`, body: `正文 ${n}`,
      occurredAt: new Date().toISOString(), attention: false }).item);
    const entries = items.slice(0, 2).map(item => feed.ensureInboxEntryForFeedItem(reference.board_id, item.item_id, "manual").entry);
    const client = host.actionClient(reference);
    const actions = bindActionClient(client, () => caller);
    const directory = { discover: () => client.discover(caller), invoke: (target: ActionReference, input: unknown) => client.invoke(caller, target, input) };
    const subjects = [...items.map(item => ({ kind: "feed_item", id: item.item_id })), ...entries.map(entry => ({ kind: "inbox_entry", id: entry.entry_id }))];

    // Preparing: the Dock's route and the service give the same offers, keys, issues and sources, item by item.
    for (const [index, subject] of subjects.entries()) {
      const request_id = `parity-${index}`;
      const dock = await actions.invoke(homeActions.offers, { subject, request_id });
      const service = await prepareSubjectOffers(directory, { subject, request_id });
      assert.deepEqual(service, dock, `${subject.kind} ${subject.id}`);
      assert.ok(dock.offers.some(offer => offer.recommendation_key), `${subject.kind} has declared offers`);
      // The same identities are the contextual candidates of the whole object: the row, the starters and the rules pick among one set.
      const focus: SurfaceFocus = { context_id: `start:${subject.kind}:${subject.id}:`, plugin_id: "fixture", activity: "browsing", granularity: "object",
        object: subject, targets: [{ kind: "object", role: "object", text: "" }] };
      const keys = new Set(contextualCandidates(await client.discover(caller), focus).filter(item => item.origin === "subject").map(item => item.key));
      for (const offer of dock.offers.filter(item => item.recommendation_key)) assert.ok(keys.has(offer.recommendation_key!), `${offer.title} is a contextual candidate under the rule's key`);
    }

    // Judging with the bound rule: it recommends one of those keys, and reading the recommendations gives it back.
    await actions.invoke(homeActions.writeJudgment, { function_key: "system_pick_home_dock" });
    const inboxSubjects = entries.map(entry => ({ kind: "inbox_entry", id: entry.entry_id }));
    const judged = await actions.invoke(homeActions.evaluate, { subjects: inboxSubjects });
    assert.equal(judged.judgments.length, 2);
    for (const judgment of judged.judgments) {
      const { offers } = await prepareSubjectOffers(directory, { subject: { kind: judgment.subject.kind, id: judgment.subject.id }, request_id: "after-judgment" });
      const done = offers.find(offer => offer.offer_id === "inbox.done")!;
      assert.deepEqual(judgment.suggested_behavior_ids, [done.recommendation_key], "the rule's pick is the service's key for 做完了");
    }
    const recommended = (await actions.invoke(homeActions.recommendations, {})).judgments;
    assert.deepEqual(recommended.map(judgment => judgment.judgment_id).sort(), judged.judgments.map(judgment => judgment.judgment_id).sort());

    // Running the recommended offer through the Dock's execute does exactly what the prepared offer says.
    const target = entries[0]!;
    const request_id = "parity-run";
    const { offers } = await prepareSubjectOffers(directory, { subject: { kind: "inbox_entry", id: target.entry_id }, request_id });
    const done = offers.find(offer => offer.offer_id === "inbox.done")!;
    const { availability: _availability, ...offer } = done;
    const ran = await actions.invoke(homeActions.execute, { subject: { kind: "inbox_entry", id: target.entry_id }, request_id, offer });
    assert.equal(ran.title, "做完了");
    assert.equal(feed.getInboxEntry(reference.board_id, target.entry_id).status, "done");
    assert.equal(feed.getInboxEntry(reference.board_id, entries[1]!.entry_id).status, "open", "only the chosen item changed");
  } finally { await host.close(); await rm(home, { recursive: true, force: true }); }
});
