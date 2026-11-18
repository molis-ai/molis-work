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

// PEQ-04 C1 (specs/plugin-equal-standing/spec.md §5.2): 「挂到…」 reaches Goals only through the relation Goals declares, and each of its five
// parts runs inside Goals' own database windows in the real Host. A part over a self-windowed action may wait; one that Goals opens a window
// for answers synchronously, or Goals refuses it (`goals.storage.async_body`), which is what the golden Home's placement write first met.

test("PEQ-04 C1 Goals' attach parts and placement's 「挂到…」 run through Goals' windows in the Host", () => runWithLocale("zh", async () => {
  const home = await mkdtemp(join(tmpdir(), "placement-attach-goals-"));
  const project = await withCatalog({ homeDirectory: home }, catalog => catalog.createProject({ display_name: "Attach", actor_id: "user" }));
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

    // The parts, called as the platform calls them.
    const { targets } = await call<{ targets: { id: string; title: string }[] }>(goalsActions.attachCandidates.capability_id, {});
    assert.deepEqual(targets.map(target => target.id), [goal_id], "candidates read Goals' directory inside a read window");
    const subject = { kind: "page", id: "attach-subject" };
    const { binding } = await call<{ binding: { binding_id: string } }>(goalsActions.attachBind.capability_id, { target_id: goal_id, subject, title: "一页资料" });
    const listed = await call<{ bindings: { binding_id: string; target_id: string }[] }>(goalsActions.attachList.capability_id, { subject });
    assert.deepEqual(listed.bindings.map(entry => [entry.binding_id, entry.target_id]), [[binding.binding_id, goal_id]]);
    assert.deepEqual(await call(goalsActions.attachRelease.capability_id, { target_id: goal_id, binding_id: binding.binding_id }), { released: true },
      "release runs inside the write window Goals opens");
    assert.deepEqual((await call<{ bindings: unknown[] }>(goalsActions.attachList.capability_id, { subject })).bindings, []);
    const made = await call<{ target: { id: string } }>(goalsActions.attachCreate.capability_id, { title: "从资料建成", body: "内容", source: "一页资料", idempotency_key: "attach-create" });
    assert.ok(made.target.id && made.target.id !== goal_id, "create makes a Goal inside the write window Goals opens");

    // Placement finds the relation by declaration and asks its owner.
    const { kinds } = await call<{ kinds: { kind: string; targets: { id: string }[] }[] }>("placement.attach.targets", { project_id: project.project_id });
    assert.deepEqual(kinds.find(entry => entry.kind === "goal")?.targets.map(target => target.id).sort(), [goal_id, made.target.id].sort());
    const { object } = await call<{ object: { kind: string; id: string; project_id: string | null } }>("placement.create",
      { station: "pages", project_id: project.project_id, request_id: "attach-page", title: "放好的一页" });
    const { key } = await call<{ key: string }>("placement.attach", { object, project_id: project.project_id, target: { kind: "goal", id: goal_id } });
    assert.ok(key);
    const attached = await call<{ bindings: { target_id: string }[] }>(goalsActions.attachList.capability_id, { subject: { kind: object.kind, id: object.id } });
    assert.deepEqual(attached.bindings.map(entry => entry.target_id), [goal_id], "Goals keeps the binding placement asked for");
  } finally {
    await host.close();
    await rm(home, { recursive: true, force: true });
  }
}));
