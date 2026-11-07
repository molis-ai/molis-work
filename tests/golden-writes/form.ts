import { field, readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** form/form.db */
export default async function ({ call, tag }: GoldenWriteContext) {
  const created = await call("form.create", { title: `金样表单 ${tag}` });
  await call("form.questions.add", { id: field(created, "id"), prompt: `金样问题 ${tag}` });
  readsBack(await call("form.get", { id: field(created, "id") }), `金样问题 ${tag}`);
}
