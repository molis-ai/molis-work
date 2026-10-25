import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { seedSceneRules, withFunctionsService } from "@molis-ai/molis-work-app-local-host";
import { BUILTIN_PLUGIN_CATALOG } from "@molis-ai/molis-work-app-workbench";
import {
  INBOX_DISMISS_BEHAVIOR_ID,
  INBOX_DONE_BEHAVIOR_ID,
  SYSTEM_HOME_DOCK_FUNCTION_KEY,
  SYSTEM_INBOX_ADMIT_FUNCTION_KEY,
  SYSTEM_INBOX_NEXT_FUNCTION_KEY,
} from "@molis-ai/molis-work-contracts/modules/functions";
import type { ActionSceneDefinition } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginRegistration } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import { subjectOfferChoiceKey } from "@molis-ai/molis-work-kernel";
import * as feedModule from "@molis-ai/molis-work-module-feed";
import * as functionsModule from "@molis-ai/molis-work-module-functions";
import { createFunctionsService } from "@molis-ai/molis-work-module-functions";
import { homeSqlitePath } from "@molis-ai/molis-work-storage";

const REPOSITORY_NAME = /(?:Repository|Store)$/;
const ROOT = new URL("../", import.meta.url);

async function withHome<T>(run: (home: string) => Promise<T> | T): Promise<T> {
  const home = await mkdtemp(join(tmpdir(), "functions-feed-exits-"));
  try { return await run(home); } finally { await rm(home, { recursive: true, force: true }); }
}

/** The Home dock scene as the Host declares it, to the extent seeding reads it: its rule, and that its recommendations are other plugins' offers. */
const HOME_DOCK: ActionSceneDefinition = {
  scene_id: "home.dock", version: 1, title: "首页下一步", description: "首页", trigger: "事项到达", scope: "project", subject_kinds: [], permissions: [],
  input_schema: { type: "object" }, result_schema: { type: "object" }, recommendation_source: "subject-offers",
  default_rule: { function_key: SYSTEM_HOME_DOCK_FUNCTION_KEY, name: "首页事项处理建议", instructions: "根据事项原文推荐完成或忽略。", subject_kinds: ["inbox_entry"],
    options: [{ key: INBOX_DONE_BEHAVIOR_ID, description: "做完了" }, { key: INBOX_DISMISS_BEHAVIOR_ID, description: "忽略" }] },
};
/** The scenes the shipped Feed and Inbox declare, from the built-in catalog's public export, with the Home dock above: the three rules. */
const shippedScenes = (): ActionSceneDefinition[] => [...BUILTIN_PLUGIN_CATALOG.flatMap(entry => entry.manifest.action_scenes ?? []), HOME_DOCK];

test("RAC-170 the Feed entry exports no Repository or Store, and no second evidence-content store", () => {
  assert.deepEqual(Object.keys(feedModule).filter(name => REPOSITORY_NAME.test(name)), []);
  assert.equal("createFeedEvidenceContentStore" in feedModule, false);
});

test("RAC-171 the Functions entry exports no Repository or Store; the service opens its library and closes it", async () => {
  assert.deepEqual(Object.keys(functionsModule).filter(name => REPOSITORY_NAME.test(name)), []);
  for (const name of ["openFunctionsStore", "FunctionsStore", "seedDeclaredRules", "seedBuiltinFunctions"]) assert.equal(name in functionsModule, false, name);
  await withHome(home => {
    const first = createFunctionsService({ home, credential: () => null });
    const created = first.createChoice({ name: "kept" });
    first.close();
    const second = createFunctionsService({ home, credential: () => null });
    try { assert.equal(second.get(created.id).name, "kept"); } finally { second.close(); }
  });
});

test("RAC-172 the Home rule is seeded with the targets the Inbox declaration gives, as when its provider id was written out", async () => {
  await withHome(home => {
    // How the targets were written before they were found by declaration: the one Inbox provider, spelled out.
    const pinned = (offer_id: string) => subjectOfferChoiceKey({ capability_id: "inbox.actions.prepare", version: 1, provider_id: "io.molis.work.inbox" },
      { offer_id, title: offer_id, action: { capability_id: "inbox.entry.status", version: 1 } });
    seedSceneRules(home, shippedScenes(), { env: {}, credential: () => null });
    withFunctionsService(home, service => {
      assert.deepEqual({ ...service.getByKey(SYSTEM_HOME_DOCK_FUNCTION_KEY)!.scene_map },
        { [INBOX_DONE_BEHAVIOR_ID]: pinned(INBOX_DONE_BEHAVIOR_ID), [INBOX_DISMISS_BEHAVIOR_ID]: pinned(INBOX_DISMISS_BEHAVIOR_ID) });
      for (const key of [SYSTEM_INBOX_ADMIT_FUNCTION_KEY, SYSTEM_INBOX_NEXT_FUNCTION_KEY]) {
        assert.deepEqual({ ...service.getByKey(key)!.scene_map }, {}, `${key} uses behavior ids, not offer keys`);
      }
    }, { env: {}, credential: () => null });
  });
});

test("RAC-172 neither the Functions Module nor its Host file names a plugin id", async () => {
  const files = (await readdir(new URL("modules/functions/src/", ROOT))).map(name => `modules/functions/src/${name}`);
  for (const file of [...files, "apps/local-host/src/functions-host.ts"]) {
    assert.doesNotMatch(await readFile(new URL(file, ROOT), "utf8"), /io\.molis\.work\.[a-z]/, `${file} names a plugin id`);
  }
});

const declaredRules = () => shippedScenes().map(scene => ({ scene_id: scene.scene_id, rule: scene.default_rule! }));

test("RAC-173 a rule that is already there keeps its stored targets, and the resolver is asked only for rules it writes", async () => {
  await withHome(home => {
    const asked: string[] = [];
    const open = () => {
      const service = createFunctionsService({ home, credential: () => null });
      service.seedDeclaredRules(declaredRules(), rule => { asked.push(`${rule.function_key}@${rule.scene_id}`); return {}; });
      return service;
    };
    open().close();
    assert.deepEqual(asked.sort(), [`${SYSTEM_HOME_DOCK_FUNCTION_KEY}@home.dock`, `${SYSTEM_INBOX_ADMIT_FUNCTION_KEY}@feed.capture`, `${SYSTEM_INBOX_NEXT_FUNCTION_KEY}@inbox.next`].sort());
    asked.length = 0;
    open().close();
    assert.deepEqual(asked, [], "a rule already written is not asked about again");

    const db = new DatabaseSync(homeSqlitePath(home, "functions"));
    db.prepare("UPDATE functions SET scene_map_json = ? WHERE function_key = ?").run('{"inbox.done":"offer.mine"}', SYSTEM_HOME_DOCK_FUNCTION_KEY);
    db.close();
    withFunctionsService(home, service => {
      assert.deepEqual({ ...service.getByKey(SYSTEM_HOME_DOCK_FUNCTION_KEY)!.scene_map }, { "inbox.done": "offer.mine" });
    }, { env: {}, credential: () => null });
  });
});

test("RAC-173 the resolver is given each rule's scene, subject kinds and option keys", async () => {
  await withHome(home => {
    const seen = new Map<string, unknown>();
    const service = createFunctionsService({ home, credential: () => null });
    service.seedDeclaredRules([{ scene_id: "home.dock", recommendation_source: "subject-offers", rule: HOME_DOCK.default_rule! }], rule => { seen.set(rule.function_key, rule); return {}; });
    service.close();
    assert.deepEqual(seen.get(SYSTEM_HOME_DOCK_FUNCTION_KEY), { function_key: SYSTEM_HOME_DOCK_FUNCTION_KEY, scene_id: "home.dock", recommendation_source: "subject-offers",
      subject_kinds: ["inbox_entry"], option_keys: [INBOX_DONE_BEHAVIOR_ID, INBOX_DISMISS_BEHAVIOR_ID] });
  });
});

/**
 * RAC-176: an offer id two declarations answer to is left unmapped rather than guessed (PG-010's ambiguity branch). The one
 * composition point the Host reads is the built catalog's public export, so a second declaration of Inbox's offers is pushed
 * there for this test and removed in `finally`; no test-only entry point is added.
 */
test("RAC-176 an offer id that two declarations answer to is left unmapped, not guessed", async () => {
  const inbox = BUILTIN_PLUGIN_CATALOG.find(entry => entry.manifest.plugin_id === "io.molis.work.inbox");
  assert.ok(inbox, "the Inbox plugin is in the built-in catalog");
  const offers = inbox.manifest.actions?.find(definition => definition.capability_id === "inbox.actions.prepare");
  assert.ok(offers?.action.subject_offer_choices?.some(choice => choice.offer_id === INBOX_DONE_BEHAVIOR_ID), "Inbox declares the Home rule's done option");
  const second: PluginRegistration = { ...inbox, manifest: { ...inbox.manifest, plugin_id: "io.molis.work.inbox.second" } };
  const declarations = BUILTIN_PLUGIN_CATALOG as PluginRegistration[];
  declarations.push(second);
  try {
    await withHome(home => {
      seedSceneRules(home, [HOME_DOCK], { env: {}, credential: () => null });
      withFunctionsService(home, service => {
        assert.deepEqual({ ...service.getByKey(SYSTEM_HOME_DOCK_FUNCTION_KEY)!.scene_map }, {},
          "the done and dismiss offers are declared twice, so neither target is picked");
      }, { env: {}, credential: () => null });
    });
  } finally {
    declarations.splice(declarations.indexOf(second), 1);
  }
  assert.equal(declarations.includes(second), false, "the added declaration is removed again");
});
