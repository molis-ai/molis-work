import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** The project tables of Feed. */
export default async function ({ call, tag }: GoldenWriteContext) {
  const created = await call("feed.rules.create", { name: `金样规则 ${tag}`, match: { contains: "金样" } });
  await call("feed.rules.update", { rule_id: field(created, "rule_id"), patch: { name: `金样规则 ${tag} 已改` } });
  readsBack(await call("feed.rules.list"), `金样规则 ${tag} 已改`);
}
