import assert from "node:assert/strict";
import test from "node:test";
import { projectRulesPage } from "./fixtures/project-review-entry.js";
import { openTestHome } from "./fixtures/test-home.js";

test("APR-19 rule saves atomically preserve history, resist stale retries and require the protected local entry", async t => {
  const host = await openTestHome(t);
  const project = await host.createProject("Project rule save");
  const rules = projectRulesPage(host, project.project_id);
  const before = await rules.read();
  const scope = { kind: "project_default" };
  const first = { kind: "set", scope, requires_person: true, reason: "Review the final result", expected_revision: before.revision };
  const saved = await rules.change(first);
  const original = saved.rules[0]!;
  assert.equal(original.requires_person, true);
  assert.equal(original.reason, first.reason);
  assert.equal(saved.rules.length, before.rules.length + 1);
  // A caller that lost the reply reads the current revision; an old form cannot submit another rule.
  await assert.rejects(rules.change(first), { code: "actions.conflict" });
  assert.deepEqual(await rules.read(), saved);
  const second = { ...first, requires_person: false, reason: "The current task can finish without an extra rule", expected_revision: saved.revision };
  for (const invalid of [{ ...second, requires_person: "false" }, { ...second, scope: { ...scope, reviewers: 2 } }, { ...second, reason: " " }]) {
    await assert.rejects(rules.change(invalid), { code: "actions.input_invalid" });
  }
  const refused = await fetch(`${host.origin}/api/settings/authorizations/project-rules?project=${encodeURIComponent(project.project_id)}`, {
    method: "POST", headers: { origin: host.origin, "content-type": "application/json", "x-molis-work-idempotency-key": crypto.randomUUID() },
    body: JSON.stringify(second),
  });
  assert.equal(refused.status, 403);
  assert.deepEqual(await rules.read(), saved);
  const changed = await rules.change(second);
  assert.equal(changed.rules[0]?.state, "active");
  assert.equal(changed.rules[0]?.requires_person, false);
  assert.equal(changed.rules[0]?.reason, second.reason);
  assert.equal(changed.rules.find(rule => rule.id === original.id)?.state, "replaced");
  assert.equal(changed.rules.find(rule => rule.id === original.id)?.change_reason, second.reason);
  assert.deepEqual(await rules.read(), changed);
});
