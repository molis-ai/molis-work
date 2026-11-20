import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withMolisWorkProjectCatalog as withCatalog } from "@molis-ai/molis-work-app-desktop";
import { MolisWorkLocalHost, molisWorkHostProjectReference, installHostUiText, runWithLocale } from "@molis-ai/molis-work-app-local-host";
import { goalsActions } from "@molis-ai/molis-work-plugin-goals";
import type { ActionCallContext, ActionView } from "@molis-ai/molis-work-contracts/platform/actions";

installHostUiText();

// PEQ-04 C1 (specs/plugin-equal-standing/spec.md §5.2): 「挂到…」 reaches Goals only through the relation its parts declare
// (`placement_relation`), each in the platform's shape, and each part runs over Goals' own handlers in their own database windows in the
// real Host: one that waited inside a window Goals opens would be refused (`goals.storage.async_body`), which is what the golden Home's
// placement write first met.

test("PEQ-04 C1 Goals' attach parts and placement's 「挂到…」 run through Goals' windows in the Host", () => runWithLocale("zh", async () => {
  const home = await mkdtemp(join(tmpdir(), "placement-attach-goals-"));
  const project = await withCatalog({ homeDirectory: home }, async catalog => {
    const created = await catalog.createProject({ display_name: "Attach", actor_id: "user" });
    catalog.addProjectPlugin({ project_id: created.project_id, plugin_id: "goals", actor_id: "user" });
    return created;
  });
  const ref = molisWorkHostProjectReference({ projectId: project.project_id, databasePath: project.database_path });
  const host = new MolisWorkLocalHost({ homeDirectory: home, completeText: null });
  host.configurePersonalPlanning(home, withCatalog);
  const base: ActionCallContext = { actor_id: "web-user", audience: "user", project_id: project.project_id, permissions: [] };
  let views: readonly ActionView[] | undefined;
  const call = async <O = unknown>(capability: string, input: unknown): Promise<O> => {
    views ??= await host.inspectActions(base, ref);
    const view = views.find(item => item.capability_id === capability && item.version === 1);
    assert.ok(view, `${capability} is offered`);
    return await host.actionClient(ref).invoke({ ...base, permissions: view.action.permissions }, view, input) as O;
  };
  try {
    const { goal_id } = (await call<{ goal: { goal_id: string } }>(goalsActions.create.capability_id, { title: "挂接目标", outcome: "收下资料", idempotency_key: "attach-goal" })).goal;
    const goal = { kind: "goal", id: goal_id };

    // The parts, called as the platform calls them.
    const subject = { kind: "page", id: "attach-subject" };
    const REVISION = "5f1c".padEnd(64, "0"); // a revision as readers give it: the sha256 of what was read
    assert.deepEqual(await call(goalsActions.attachCandidates.capability_id, { subject }), { targets: [{ subject: goal, current: false }] },
      "candidates read Goals' directory inside a read window");
    assert.deepEqual(await call(goalsActions.attachBind.capability_id, { subject, target: goal, read: { title: "一页资料", revision: REVISION } }), { targets: [goal] });
    assert.deepEqual(await call(goalsActions.attachBind.capability_id, { subject, target: goal, read: { title: "一页资料", revision: REVISION } }), { targets: [goal] }, "binding again adds none");
    assert.deepEqual(await call(goalsActions.attachList.capability_id, { subject }), { targets: [goal] });
    const inputs = await call<{ bindings: { goal_id: string; title: string; snapshot_digest: string | null }[] }>(goalsActions.inputsList.capability_id, { goal_id });
    assert.deepEqual(inputs.bindings.map(binding => [binding.goal_id, binding.title, typeof binding.snapshot_digest]), [[goal_id, "一页资料", "string"]],
      "Goals names the input by what the person read, and keeps a digest of its revision");
    assert.deepEqual(await call(goalsActions.attachCandidates.capability_id, { subject }), { targets: [{ subject: goal, current: true }] });
    assert.deepEqual(await call(goalsActions.attachRelease.capability_id, { subject, target: goal }), { targets: [] }, "release runs inside the write window Goals opens");
    assert.deepEqual(await call(goalsActions.attachList.capability_id, { subject }), { targets: [] });
    const made = await call<{ targets: { kind: string; id: string }[] }>(goalsActions.attachCreate.capability_id,
      { subject, name: "从资料建成", request_id: "attach-create", read: { title: "一页资料", excerpt: "内容" } });
    assert.equal(made.targets[0]?.kind, "goal");
    assert.notEqual(made.targets[0]?.id, goal_id, "create makes a Goal inside the write window Goals opens, and names it first");
    assert.deepEqual(await call(goalsActions.attachCreate.capability_id, { subject, name: "从资料建成", request_id: "attach-create", read: { title: "一页资料", excerpt: "内容" } }), made,
      "the same request makes the same Goal");

    // Placement finds the relation by declaration and asks its owner.
    const { object } = await call<{ object: { kind: string; id: string; project_id: string | null } }>("placement.create",
      { station: "pages", project_id: project.project_id, request_id: "attach-page", title: "放好的一页" });
    const { kinds } = await call<{ kinds: { kind: string; targets: { id: string; current: boolean }[] }[] }>("placement.attach.targets", { project_id: project.project_id, object });
    assert.deepEqual(kinds.find(entry => entry.kind === "goal")?.targets.map(target => target.id).sort(), [goal_id, made.targets[0]!.id].sort());
    const { key } = await call<{ key: string }>("placement.attach", { object, project_id: project.project_id, target: goal });
    assert.ok(key);
    assert.deepEqual(await call(goalsActions.attachList.capability_id, { subject: { kind: object.kind, id: object.id } }), { targets: [goal] }, "Goals keeps the binding placement asked for");
    assert.deepEqual(await call("placement.unlink", { key }), { removed: true });
    assert.deepEqual(await call(goalsActions.attachList.capability_id, { subject: { kind: object.kind, id: object.id } }), { targets: [] });
  } finally {
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
}));
