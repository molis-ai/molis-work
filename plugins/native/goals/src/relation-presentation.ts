import { t } from "@molis-ai/molis-work-plugin-sdk/ui";

export const GOALS_RELATION_LABELS: Record<string, { out: string; in: string }> = {
  part_of: { out: "属于", in: "包含" },
  depends_on: { out: "依赖", in: "被依赖" },
  conflicts_with: { out: "冲突于", in: "冲突于" },
  mitigates: { out: "缓解", in: "由此缓解" },
  extends: { out: "扩展", in: "由此扩展" },
  replaces: { out: "替代", in: "被替代" },
  corrects: { out: "修正", in: "被修正" },
  invalidates: { out: "使其失效", in: "被其失效" },
  migrates_from: { out: "迁移自", in: "迁移到" },
};

/** Both renderers select a word by the relation's saved type and the part of the interface being drawn. */
export function relationWordKey(type: string, part: "out" | "in" | "label" | "description"): string {
  return "goals.relation-kind." + type.replaceAll("_", "-") + "." + part;
}

export function goalRelationLabel(type: string, part: "out" | "in"): string | undefined {
  if (Object.hasOwn(GOALS_RELATION_LABELS, type)) return t.text(relationWordKey(type, part));
}
