import {
  loadPlanningMethodSources,
  type ParsedPlanningMethodSource,
} from "./method-catalog.js";
import type {
  PlanningCoverageRule,
  PlanningDependencyRule,
  PlanningMethodComposition,
  PlanningMethodKind,
  PlanningMethodPack,
  PlanningMethodPackInput,
  PlanningMethodScope,
  ResolvedPlanningMethodPack,
} from "@molis-ai/molis-work-contracts/modules/goals";

export type {
  PlanningCoverageRule,
  PlanningDependencyRule,
  PlanningMethodComposition,
  PlanningMethodKind,
  PlanningMethodPack,
  PlanningMethodPackInput,
  PlanningMethodPath,
  PlanningMethodScope,
  ResolvedPlanningMethodPack,
} from "@molis-ai/molis-work-contracts/modules/goals";

const BUILTIN_AT = "2026-08-22T00:00:00.000Z";

function dependency(rule_id: string, statement: string, direction_hint: string): PlanningDependencyRule {
  return { rule_id, statement, direction_hint };
}

type PlanningInstructionSource = Pick<
  PlanningMethodPack,
  | "name"
  | "summary"
  | "applies_to"
  | "steps"
  | "required_coverage"
  | "dependency_rules"
  | "evidence_requirements"
  | "completion_checks"
  | "failure_modes"
>;

function instructionList(items: readonly string[], empty: string): string {
  return items.length ? items.map((item, index) => `${index + 1}. ${item}`).join("\n") : `1. ${empty}`;
}

/**
 * Produces a complete Runtime-facing method from the structured compatibility
 * fields. This is also the safe fallback for method packs saved before full
 * instructions were introduced.
 */
export function compilePlanningMethodInstructions(source: PlanningInstructionSource): string {
  const appliesTo = source.applies_to.length ? source.applies_to.join("、") : "需要这类专业规划判断的工作";
  const coverage = source.required_coverage.map((item, index) => `${index + 1}. **${item.label}**：${item.question}`).join("\n");
  const dependencies = source.dependency_rules.map((item, index) => `${index + 1}. ${item.statement}\n   - 方向：${item.direction_hint}`).join("\n");
  return `# ${source.name}

## 作用
${source.summary}

适用于：${appliesTo}。

## Runtime 应该怎么规划
${instructionList(source.steps, "先明确可验收结果，再按产出消费关系拆分工作。")}

规划不是把上面的步骤机械变成一串 Goal。先用这些步骤把问题想完整，再把每个能独立交付、独立验收的结果设为 Goal；同一 Goal 不要混入多个主要结果。

## 有限 Goal 与持续运行
Goal 必须描述一项有限、可验收、最终能完成的改变。首次建立能力、流程或工具可以是 Goal；能力建立后的持续运行属于 recurring operation，不应为了保持循环可见而把能力 Goal 留成永久未完成 Goal，也不应把业务循环写成循环 depends_on。

持续运行用笔记和报告留下可追溯事实。笔记或报告暴露真实问题或改进机会时，用意图创建一条有限的改进 Goal，或通过 Goal Tree 提案调整结构，由用户决定是否采纳；不要自动创建或批准新 Goal。本轮规划沿用现有笔记、报告、意图和树能力表达重复运行中的有限改进，不要为了保持循环可见而新增调度器或 Operation 数据模型。

## 拆分时必须回答
${coverage || "1. 最终结果是什么，谁会消费它，凭什么确认完成？"}

没有答案的关键问题必须进入待确认事项，不能用含糊 Goal 掩盖。遗漏任一与当前任务相关的覆盖项，都视为规划不完整。

## 如何判断 depends_on
depends_on 只表达“结果消费”：如果 B 开始或完成时必须使用 A 的可验收产出，就设置 B depends_on A。方向永远从消费结果的 Goal 指向提供结果的 Goal。

${dependencies || "1. 只有存在真实产出消费关系时才建立依赖。\n   - 方向：consumer depends_on provider"}

上面每条依赖判断规则都必须逐条判定。规则描述真实产出消费时，它就是不能跳过的硬依赖，必须建立对应的 depends_on；规则明确要求保持并行时，不得为了排列顺序添加依赖；规则不适用时，要能说明当前任务里缺少哪一种产出消费关系，不能静默略过。

不要因为讨论顺序、期望执行时间、同属一个父 Goal、修改同一文件或由同一人负责就建立 depends_on。父子归属使用 part_of 表达；没有结果消费关系的工作应保持并行。

建立或修改依赖后，检查整张图：没有循环；每个依赖都能说清上游产出和下游用途；关键交付没有缺失前置；执行顺序应从无未完成依赖的底层 Goal 开始。

## 与其他主题一起规划
不要只围绕当前讨论最显眼的主题拆 Goal。把当前方法与其他已选方法放在一起，列出每个主题产生的关键结果、消费这些结果的主题，以及两者之间是否存在真实前置关系。若某个消费者需要产品定义、用户动线、市场证据、数据集、评测基线、技术契约、权限流程、研究证据或其他专业产出，而当前方法组合没有覆盖提供者，就召回相应主题的方法再完成拆分。

跨主题关系的常见模式包括：市场证据支持产品决定；产品目标和用户动线约束技术方案；技术契约与基础能力被功能实现消费；数据与评测支撑 AI 能力；研究证据支撑内容主张；角色与权限支撑运营流程；已验证的核心循环支撑游戏内容生产。这些只是召回线索，不是固定模板。只有消费者无法在缺少提供者产出的情况下正确开始或完成时，才建立硬依赖；一般相关、可以独立验证或仅需最终对齐的主题保持并行。

## 完成前需要的证据
${instructionList(source.evidence_requirements, "提供与完成标准直接对应的可复核证据。")}

## 收口检查
${instructionList(source.completion_checks, "结果已经被实际使用路径验证，依赖方向也能被解释。")}

## 常见误拆
${instructionList(source.failure_modes, "把讨论顺序当成执行依赖，或把一个复杂阶段写成无法验收的大 Goal。")}

## 用户提出新要求时
先把新要求与现有 Goal、已确认产出和依赖图对照，找出直接受影响的 Goal 及其下游消费者。保留未受影响且仍然成立的 Goal；只新增、修改、失效或重连受影响部分，然后重新检查覆盖项、依赖方向、循环、遗漏和可执行顺序。不要为了让新要求看起来已被处理而重写整棵树，也不要静默改变已确认的目标。

## 提交规划前
逐项说明：为什么这样拆；每条 depends_on 消费什么产出；哪些 Goal 可以并行；当前最底层、可立即执行的 Goal 是什么；哪些问题仍需用户决定。`;
}

function builtin(input: ParsedPlanningMethodSource): PlanningMethodPack {
  const pack = {
    ...input,
    scope: "built_in" as const,
    enabled: true,
    created_at: BUILTIN_AT,
    updated_at: BUILTIN_AT,
  };
  return {
    ...pack,
    instructions: compilePlanningMethodInstructions(pack),
  };
}

const COMMON_DEPENDENCIES = [
  dependency("output-consumption", "只有下游 Goal 明确消费上游 Goal 的可验收结果时才建立 depends_on。", "consumer depends_on provider"),
  dependency("decision-before-commitment", "会改变后续范围或方案的决定必须先于不可逆投入。", "commitment depends_on decision"),
  dependency("proof-before-close", "验证 Goal 消费被验证结果和完成标准，而不是反向依赖实现。", "verification depends_on deliverable"),
  dependency("hierarchy-is-not-dependency", "父子归属、同一阶段或同一负责人不自动构成执行依赖。", "use part_of for hierarchy; keep independent goals parallel"),
];

export const PLANNING_METHOD_CATALOG_DIRECTORY = new URL(
  "../../methods/",
  import.meta.url,
);

export function loadBuiltinPlanningMethodPacks(
  directory: string | URL = PLANNING_METHOD_CATALOG_DIRECTORY,
): PlanningMethodPack[] {
  return loadPlanningMethodSources(directory).map((source) => builtin({
    ...source,
    dependency_rules: [...source.dependency_rules, ...COMMON_DEPENDENCIES],
  }));
}

export const BUILTIN_PLANNING_METHOD_PACKS: readonly PlanningMethodPack[] = loadBuiltinPlanningMethodPacks();

const SCOPE_WEIGHT: Record<PlanningMethodScope, number> = { built_in: 0, personal: 1, project: 2 };
const COMPOSITION_KIND_WEIGHT: Record<PlanningMethodKind, number> = {
  work_type: 0,
  domain: 1,
  industry: 2,
  overlay: 3,
  custom: 4,
  meta: 5,
};

function uniquePlanningStrings(...groups: readonly (readonly string[])[]): string[] {
  const values = new Set<string>();
  for (const group of groups) {
    for (const raw of group) {
      const value = raw.trim();
      if (value) values.add(value);
    }
  }
  return [...values];
}

function legacyInstructionSource(pack: PlanningInstructionSource & { method_id?: string }): PlanningInstructionSource {
  const baseline = pack.method_id
    ? BUILTIN_PLANNING_METHOD_PACKS.find((candidate) => candidate.method_id === pack.method_id)
    : undefined;
  if (!baseline) return pack;
  const coverage = new Map<string, PlanningCoverageRule>();
  for (const item of [...baseline.required_coverage, ...pack.required_coverage]) coverage.set(item.area, { ...item });
  const dependencies = new Map<string, PlanningDependencyRule>();
  for (const item of [...baseline.dependency_rules, ...pack.dependency_rules]) {
    dependencies.set(`${item.statement.trim()}\u0000${item.direction_hint.trim()}`, { ...item });
  }
  return {
    ...pack,
    steps: uniquePlanningStrings(baseline.steps, pack.steps),
    required_coverage: [...coverage.values()],
    dependency_rules: [...dependencies.values()],
    evidence_requirements: uniquePlanningStrings(baseline.evidence_requirements, pack.evidence_requirements),
    completion_checks: uniquePlanningStrings(baseline.completion_checks, pack.completion_checks),
    failure_modes: uniquePlanningStrings(baseline.failure_modes, pack.failure_modes),
  };
}

/** Hydrates JSON rows created before planning packs had a canonical body. */
export function hydratePlanningMethodPack(pack: PlanningMethodPack): PlanningMethodPack {
  const storedInstructions = typeof (pack as { instructions?: unknown }).instructions === "string"
    ? (pack as { instructions: string }).instructions.trim()
    : "";
  const baseline = pack.method_id
    ? BUILTIN_PLANNING_METHOD_PACKS.find((candidate) => candidate.method_id === pack.method_id)
    : undefined;
  return {
    ...pack,
    instructions: storedInstructions || compilePlanningMethodInstructions(legacyInstructionSource(pack)),
    event_types: Array.isArray(pack.event_types) ? pack.event_types : (baseline?.event_types ?? []),
    default_requirements: Array.isArray(pack.default_requirements)
      ? pack.default_requirements
      : (baseline?.default_requirements ?? []),
  };
}

export function validatePlanningMethodPack(input: PlanningMethodPackInput | PlanningMethodPack): string[] {
  const issues: string[] = [];
  if (!input.method_id.trim() || !/^[a-z0-9][a-z0-9._-]*$/i.test(input.method_id)) issues.push("method_id 只能使用字母、数字、点、下划线和短横线");
  if (!Object.hasOwn(COMPOSITION_KIND_WEIGHT, input.kind)) issues.push("方法类型无效");
  if (!input.name.trim()) issues.push("方法名称不能为空");
  if (!input.summary.trim()) issues.push("方法说明不能为空");
  if (!input.steps.length || input.steps.some((item) => !item.trim())) issues.push("至少需要一个有效拆分步骤");
  if (!input.required_coverage.length || input.required_coverage.some((item) => !item.area.trim() || !item.label.trim() || !item.question.trim())) issues.push("至少需要一个完整的必须覆盖项");
  if (!input.dependency_rules.length || input.dependency_rules.some((item) => !item.rule_id.trim() || !item.statement.trim() || !item.direction_hint.trim())) issues.push("至少需要一条完整的依赖规则");
  if (!Number.isFinite(input.confidence) || input.confidence < 0 || input.confidence > 1) issues.push("可信度必须在 0 到 1 之间");
  return issues;
}

export function normalizePlanningMethodPack(
  input: PlanningMethodPackInput,
  scope: Exclude<PlanningMethodScope, "built_in">,
  current: PlanningMethodPack | null,
  at: string,
): PlanningMethodPack {
  const normalizedFields = {
    ...input,
    method_id: input.method_id.trim(),
    name: input.name.trim(),
    summary: input.summary.trim(),
    applies_to: input.applies_to.map((item) => item.trim()).filter(Boolean),
    domain_tags: input.domain_tags.map((item) => item.trim()).filter(Boolean),
    steps: input.steps.map((item) => item.trim()).filter(Boolean),
    required_coverage: input.required_coverage.map((item) => ({ area: item.area.trim(), label: item.label.trim(), question: item.question.trim() })),
    dependency_rules: input.dependency_rules.map((item) => ({ rule_id: item.rule_id.trim(), statement: item.statement.trim(), direction_hint: item.direction_hint.trim() })),
    evidence_requirements: input.evidence_requirements.map((item) => item.trim()).filter(Boolean),
    completion_checks: input.completion_checks.map((item) => item.trim()).filter(Boolean),
    failure_modes: input.failure_modes.map((item) => item.trim()).filter(Boolean),
    source_refs: input.source_refs.map((item) => item.trim()).filter(Boolean),
    scope,
    version: current ? current.version + 1 : Math.max(1, input.version ?? 1),
    created_at: current?.created_at ?? at,
    updated_at: at,
  };
  const normalized: PlanningMethodPack = {
    ...normalizedFields,
    event_types: (input.event_types ?? []).map((type) => ({
      ...type,
      fields: type.fields.map((field) => ({ ...field })),
    })),
    default_requirements: (input.default_requirements ?? []).map((requirement) => ({ ...requirement })),
    instructions: input.instructions?.trim()
      || compilePlanningMethodInstructions(legacyInstructionSource(normalizedFields)),
  };
  const issues = validatePlanningMethodPack(normalized);
  if (issues.length) throw new Error(issues.join("；"));
  return normalized;
}

export function resolvePlanningMethodPacks(
  personal: readonly PlanningMethodPack[] = [],
  project: readonly PlanningMethodPack[] = [],
): ResolvedPlanningMethodPack[] {
  const grouped = new Map<string, PlanningMethodPack[]>();
  for (const rawPack of [...BUILTIN_PLANNING_METHOD_PACKS, ...personal, ...project]) {
    const pack = hydratePlanningMethodPack(rawPack);
    grouped.set(pack.method_id, [...(grouped.get(pack.method_id) ?? []), pack]);
  }
  return [...grouped.values()].map((versions) => {
    const ordered = [...versions].sort((left, right) => SCOPE_WEIGHT[right.scope] - SCOPE_WEIGHT[left.scope] || right.version - left.version);
    const selected = ordered[0]!;
    return { ...selected, overridden_scopes: ordered.slice(1).map((item) => item.scope) };
  }).sort((left, right) => COMPOSITION_KIND_WEIGHT[left.kind] - COMPOSITION_KIND_WEIGHT[right.kind]
    || left.name.localeCompare(right.name)
    || left.method_id.localeCompare(right.method_id));
}

export const TASK_CONTEXT_METHOD_IDS: Record<string, string[]> = {
  game: ["work-build-change", "domain-game-design"],
  app: ["work-build-change", "domain-app-product"],
  ai_data: ["work-build-change", "domain-ai-data-product"],
  content_research: ["work-content-communication", "domain-research-content"],
  operations: ["work-operate-process", "domain-operations-organization"],
  other: ["work-build-change"],
};

export function methodPacksForReview(
  available: readonly PlanningMethodPack[],
  methodPackIds: readonly string[],
  taskContext?: string | null,
): { packs: PlanningMethodPack[]; missing_ids: string[] } {
  const ids = methodPackIds.length ? [...new Set(methodPackIds)] : TASK_CONTEXT_METHOD_IDS[taskContext ?? "other"] ?? TASK_CONTEXT_METHOD_IDS.other;
  const byId = new Map(available.filter((pack) => pack.enabled).map((pack) => [pack.method_id, pack]));
  return {
    packs: ids.map((id) => byId.get(id)).filter((pack): pack is PlanningMethodPack => pack != null),
    missing_ids: ids.filter((id) => !byId.has(id)),
  };
}

export function mergedCoverageRules(packs: readonly PlanningMethodPack[]): PlanningCoverageRule[] {
  const rules = new Map<string, PlanningCoverageRule>();
  for (const pack of packs) for (const item of pack.required_coverage) if (!rules.has(item.area)) rules.set(item.area, item);
  return [...rules.values()];
}

/**
 * Builds the project planning lens consumed by a Runtime. Method paths stay
 * separate because multiple methods are complementary reasoning passes, not a
 * single mechanically serial workflow. Omission and completion rules are
 * merged so the Runtime can check the whole project contract in one pass.
 */
export function composePlanningMethodPacks(
  packs: readonly PlanningMethodPack[],
): PlanningMethodComposition {
  const selected = packs
    .filter((pack) => pack.enabled)
    .sort((left, right) => COMPOSITION_KIND_WEIGHT[left.kind] - COMPOSITION_KIND_WEIGHT[right.kind]
      || left.name.localeCompare(right.name)
      || left.method_id.localeCompare(right.method_id));
  const coverage = new Map<string, PlanningCoverageRule>();
  const dependencies = new Map<string, PlanningDependencyRule>();
  const mergeValues = (read: (pack: PlanningMethodPack) => readonly string[]): string[] => {
    const values = new Set<string>();
    for (const pack of selected) {
      for (const raw of read(pack)) {
        const value = raw.trim();
        if (value) values.add(value);
      }
    }
    return [...values];
  };
  for (const pack of selected) {
    for (const rule of pack.required_coverage) {
      const current = coverage.get(rule.area);
      if (!current) {
        coverage.set(rule.area, { ...rule });
        continue;
      }
      const questions = new Set(current.question.split("；").map((item) => item.trim()).filter(Boolean));
      questions.add(rule.question.trim());
      coverage.set(rule.area, { ...current, question: [...questions].join("；") });
    }
    for (const rule of pack.dependency_rules) {
      const key = `${rule.statement.trim()}\u0000${rule.direction_hint.trim()}`;
      if (!dependencies.has(key)) dependencies.set(key, { ...rule });
    }
  }
  return {
    method_pack_ids: selected.map((pack) => pack.method_id),
    method_names: selected.map((pack) => pack.name),
    method_paths: selected.map((pack) => ({
      method_id: pack.method_id,
      method_name: pack.name,
      kind: pack.kind,
      steps: [...pack.steps],
      instructions: pack.instructions,
    })),
    required_coverage: [...coverage.values()],
    dependency_rules: [...dependencies.values()],
    evidence_requirements: mergeValues((pack) => pack.evidence_requirements),
    completion_checks: mergeValues((pack) => pack.completion_checks),
    failure_modes: mergeValues((pack) => pack.failure_modes),
  };
}
