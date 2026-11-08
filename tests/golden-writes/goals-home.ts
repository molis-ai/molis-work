import { readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

const INPUT_FIELDS = ["kind", "summary", "applies_to", "domain_tags", "steps", "required_coverage", "dependency_rules", "evidence_requirements", "completion_checks", "failure_modes", "source_refs", "confidence", "enabled"];

/** goals/goals.db, the Home half of Goals: a personal method with the contents of a built-in one. */
export default async function ({ call, tag }: GoldenWriteContext) {
  const { methods } = await call("goals.planning.personal.list");
  const builtIn = methods.find((item: { method_id: string }) => item.method_id === "domain-software-development");
  const method = { ...Object.fromEntries(INPUT_FIELDS.map(key => [key, builtIn[key]])), method_id: `golden-${tag}`, name: `金样方法 ${tag}` };
  await call("goals.planning.personal.save", { method }, { user_action: { source: "web", conversation_ref: "golden", message_ref: `golden-${tag}` } });
  await call("goals.planning.personal.save", { method: { ...method, name: `金样方法 ${tag} 已改` } }, { user_action: { source: "web", conversation_ref: "golden", message_ref: `golden-${tag}-changed` } });
  readsBack(await call("goals.planning.personal.list"), `金样方法 ${tag} 已改`);
}
