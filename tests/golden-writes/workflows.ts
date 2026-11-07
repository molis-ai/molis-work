import { readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** workflows/workflows.db */
export default async function ({ call, tag }: GoldenWriteContext) {
  const { workflow } = await call("workflows.create", { title: `金样流程 ${tag}` });
  await call("workflows.update", { id: workflow.workflow_id, revision: workflow.revision, title: `金样流程 ${tag} 已改` });
  readsBack(await call("workflows.get", { id: workflow.workflow_id }), `金样流程 ${tag} 已改`);
}
