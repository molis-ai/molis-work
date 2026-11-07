import type { GoldenWriteContext } from "../fixtures/golden-write.ts";

/** placement/placement.db: an object made in the personal space, and the person using it in a project. The link answers or throws; there is no list to read it from without a subject. */
export default async function ({ call, projectId, tag }: GoldenWriteContext) {
  const { object } = await call("placement.create", { station: "pages", project_id: "personal", request_id: `golden-placement-${tag}`, title: `金样摆放 ${tag}` });
  await call("placement.link", { object, project_id: projectId });
}
