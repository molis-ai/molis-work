// @requires-platform darwin
import assert from "node:assert/strict";
import test from "node:test";
import { SKILL_AUTHORED_PLUGIN_IDS, type SkillCatalogEntry, type SkillDraft, type SkillDraftAdoptResult, type SkillTrial } from "@molis-ai/molis-work-contracts/services/skills";
import { homeSqlitePath, openSqliteConnection } from "@molis-ai/molis-work-storage";
import { serveHomeRuntime } from "./fixtures/home-runtime.js";
import { mac } from "./fixtures/signed-package-host.js";

const fields = { name: "完成采用后才生效", description: "整理记录时使用。", applies_to: "assistant", body: "# 原正式做法" };

// QEA-118: fail the real draft-owner transaction after the signed package installation has run.
// The expected result is read through the normal catalog and draft routes, followed by the same draft's actual retry.
for (const scope of ["home", "project"] as const) for (const upgrade of [false, true]) {
  test(`QEA-118 ${scope} Skill ${upgrade ? "upgrade" : "creation"} keeps its prior installation when draft settlement fails and retries once`, { ...mac, timeout: 120_000 }, async t => {
    const replay = scope === "project" && upgrade;
    const f = await serveHomeRuntime(t, replay ? {
      completeText: async (prompt: string) => prompt.includes("你在对照技能回放的结果")
        ? JSON.stringify({ results: [...prompt.matchAll(/\{"index":(\d+),"output":/gu)].map(([, index]) => ({ index: Number(index), verdict: "match", differences: [] })) })
        : "保留这个已知答案",
    } : undefined);
    const project = scope === "project" ? await f.project("采用事务") : undefined;
    const prefix = project ? `/projects/${project.project_id}` : "";
    const post = async <T>(route: string, body: object) => {
      // The current Home settings page sends signed installation through its personal-space project entry.
      const entry = !project && route.startsWith("plugin-trust/") ? "/projects/personal" : prefix;
      const response = await f.request(`${entry}/api/${route}`, { method: "POST", body });
      return { status: response.status, body: await response.json() as T };
    };
    const create = async (target: object, body: string) => {
      const result = await post<SkillDraft>("skills/drafts/create", { scope, target, fields: { ...fields, body } });
      assert.equal(result.status, 200, JSON.stringify(result.body));
      return result.body;
    };
    const adopt = (draft: SkillDraft) => post<SkillDraftAdoptResult>("plugin-trust/skills/drafts/adopt", { draft_id: draft.draft_id, expected_revision: draft.revision });
    const mine = async () => {
      const result = await post<{ skills: SkillCatalogEntry[] }>("skills/list", {});
      assert.equal(result.status, 200, JSON.stringify(result.body));
      return result.body.skills.filter(skill => skill.pack.plugin_id === SKILL_AUTHORED_PLUGIN_IDS[scope]);
    };
    let target: { kind: "new" } | { kind: "own"; skill_id: string } = { kind: "new" };
    if (upgrade) {
      const first = await adopt(await create(target, fields.body));
      assert.equal(first.status, 200, JSON.stringify(first.body));
      target = { kind: "own", skill_id: first.body.skill_id };
    }
    let draft = await create(target, "# 本次要采用的新做法");
    const read = () => post<SkillDraft>("skills/drafts/read", { draft_id: draft.draft_id });
    if (replay) {
      const known = await post<{ case_id: string }>("skills/drafts/cases/put", { draft_id: draft.draft_id, title: "记录示例", task: "整理记录", expected: "保留这个已知答案" });
      assert.equal(known.status, 200);
      const trial = await post<SkillTrial>("skills/drafts/trial", { draft_id: draft.draft_id, expected_revision: draft.revision, case_id: known.body.case_id });
      assert.equal(trial.status, 200, JSON.stringify(trial.body));
      draft = (await read()).body;
      assert.equal(draft.trial?.trial_id, trial.body.trial_id);
      assert.equal(draft.trial_needed, false);
    }
    const alter = (sql: string) => {
      const db = openSqliteConnection(homeSqlitePath(f.home, "agent-definitions"), { fileMustExist: true });
      try { db.exec(sql); } finally { db.close(); }
    };
    alter("CREATE TRIGGER qea_adoption_settlement BEFORE DELETE ON skill_drafts BEGIN SELECT RAISE(ABORT, 'fixture draft settlement refused'); END");
    try {
      const failed = await adopt(draft);
      assert.equal(failed.status, 500, "the actual owner transaction refuses settlement");
      const retained = await read();
      assert.equal(retained.status, 200);
      assert.deepEqual(retained.body.fields, draft.fields);
      assert.equal(retained.body.revision, draft.revision);
      assert.deepEqual(retained.body.cases, draft.cases);
      assert.deepEqual(retained.body.trial, draft.trial);
      const installed = await mine();
      t.diagnostic(JSON.stringify({ scope, upgrade, response: failed.status, versions: installed.map(skill => skill.ref.version) }));
      assert.equal(installed.length, upgrade ? 1 : 0, "a failed adoption cannot leave a newly created Skill in the actual catalog");
      if (upgrade) {
        assert.equal(installed[0]!.ref.version, 1, "a failed adoption keeps the original Skill version");
        assert.equal(installed[0]!.excerpt, fields.body);
      }
    } finally { alter("DROP TRIGGER qea_adoption_settlement"); }
    const retry = await adopt(draft);
    assert.equal(retry.status, 200, JSON.stringify(retry.body));
    assert.equal(retry.body.skill_version, upgrade ? 2 : 1);
    const installed = await mine();
    assert.equal(installed.length, 1);
    assert.equal(installed[0]!.ref.version, retry.body.skill_version);
    assert.equal(installed[0]!.excerpt, draft.fields.body);
    assert.equal((await read()).status, 404);
    if (replay) {
      const next = await create({ kind: "own", skill_id: retry.body.skill_id }, draft.fields.body);
      assert.deepEqual(next.cases.map(item => item.expected), ["保留这个已知答案"], "the retry moves the draft's known answer to the installed Skill");
    }
  });
}
