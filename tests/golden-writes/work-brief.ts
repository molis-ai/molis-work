import { readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** The partition's `libraries/work-brief.db` (batch 109-1), and its brief's row in the main database's overview table. */
export default async function ({ call, tag }: GoldenWriteContext) {
  await call("work-brief.briefs.save", { request_id: `golden-brief-${tag}`, draft: { claims: [{ text: `金样简报 ${tag}`, supplied_by: "owner" }] } });
  readsBack(await call("work-brief.briefs.get"), `金样简报 ${tag}`);
}
