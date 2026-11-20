import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/**
 * The project's guidance in the project library (`guidance_entries`, `guidance_revisions`): the platform's since batch 44
 * (specs/plugin-equal-standing/contract-design.md §9), whichever plugins the project has. An entry added, then edited, so the
 * replay writes a revision on top of the rows stored in the project library.
 */
export default async function ({ call, tag }: GoldenWriteContext) {
  const write = { reason: "合成的理由", confirmation_summary: "合成的确认", user_confirmed: true };
  const added = await call("projects.guidance.add", { ...write, kind: "constraint", content: `金样说明 ${tag}`, idempotency_key: `golden-guidance-${tag}` });
  await call("projects.guidance.update", { ...write, guidance_id: field(added, "guidance_id"), action: "edit", kind: "constraint",
    content: `金样说明 ${tag}（改过）`, idempotency_key: `golden-guidance-edit-${tag}` });
  readsBack(await call("projects.guidance.read"), `金样说明 ${tag}（改过）`);
}
