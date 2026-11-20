import { readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/**
 * placement/placement.db: an object made in the personal space, and the person using it in a project. Then moved into the project and back, which its
 * owner records each time, and attached to one of the project's Goals. It ends in the personal space: as a second document in the project, its knowledge card's number would depend on which of the two was indexed first.
 */
export default async function ({ call, projectId, tag }: GoldenWriteContext) {
  const { object } = await call("placement.create", { station: "pages", project_id: "personal", request_id: `golden-placement-${tag}`, title: `金样摆放 ${tag}` });
  await call("placement.link", { object, project_id: projectId });
  await call("placement.move", { object, to_project_id: projectId });
  readsBack(await call("placement.locate", { object }), projectId);
  await call("placement.move", { object, to_project_id: "personal" });
  readsBack(await call("placement.locate", { object }), "personal");
  // Attached to one of the project's Goals from where it lives (`placement.attached_in`).
  const { kinds } = await call("placement.attach.targets", { project_id: projectId, object }) as { kinds: Array<{ kind: string; targets: Array<{ id: string }> }> };
  const goal = kinds.find(entry => entry.kind === "goal")?.targets.map(target => target.id).sort()[0];
  if (!goal) throw new Error("golden placement: the project has no Goal to attach to");
  await call("placement.attach", { object, project_id: projectId, target: { kind: "goal", id: goal } });
}
