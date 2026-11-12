import { readFileSync } from "node:fs";
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
} from "../../contract/goals.js";

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
} from "../../contract/goals.js";

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
  return planningInstructionTemplates.zh({ name: source.name, summary: source.summary, applies_to: appliesTo,
    steps: instructionList(source.steps, "先明确可验收结果，再按产出消费关系拆分工作。"),
    coverage: coverage || "1. 最终结果是什么，谁会消费它，凭什么确认完成？",
    dependencies: dependencies || "1. 只有存在真实产出消费关系时才建立依赖。\n   - 方向：consumer depends_on provider",
    evidence: instructionList(source.evidence_requirements, "提供与完成标准直接对应的可复核证据。"),
    checks: instructionList(source.completion_checks, "结果已经被实际使用路径验证，依赖方向也能被解释。"),
    mistakes: instructionList(source.failure_modes, "把讨论顺序当成执行依赖，或把一个复杂阶段写成无法验收的大 Goal。") });
}

function instructionTemplate(language: "zh" | "en") {
  const body = readFileSync(new URL(`../../../methods/runtime.${language}.md`, import.meta.url), "utf8").trimEnd();
  return (words: Readonly<Record<string, string>>): string => body.replace(/\{\{([a-z_]+)\}\}/gu, (slot, key: string) => words[key] ?? slot);
}
const planningInstructionTemplates = { zh: instructionTemplate("zh"), en: instructionTemplate("en") };

function englishInstructions(source: PlanningInstructionSource): string {
  return planningInstructionTemplates.en({ name: source.name, summary: source.summary, applies_to: source.applies_to.join(", "),
    steps: instructionList(source.steps, ""), coverage: source.required_coverage.map(({ label, question }, index) => `${index + 1}. **${label}**: ${question}`).join("\n"),
    dependencies: source.dependency_rules.map(({ statement, direction_hint }, index) => `${index + 1}. ${statement}\n   - Direction: ${direction_hint}`).join("\n"),
    evidence: instructionList(source.evidence_requirements, ""), checks: instructionList(source.completion_checks, ""), mistakes: instructionList(source.failure_modes, "") });
}

function builtin(input: ParsedPlanningMethodSource, render: (source: PlanningInstructionSource) => string): PlanningMethodPack {
  const pack = {
    ...input,
    scope: "built_in" as const,
    enabled: true,
    created_at: BUILTIN_AT,
    updated_at: BUILTIN_AT,
  };
  return {
    ...pack,
    instructions: render(pack),
  };
}

const COMMON_DEPENDENCIES = [
  dependency("output-consumption", "只有下游 Goal 明确消费上游 Goal 的可验收结果时才建立 depends_on。", "consumer depends_on provider"),
  dependency("decision-before-commitment", "会改变后续范围或方案的决定必须先于不可逆投入。", "commitment depends_on decision"),
  dependency("proof-before-close", "验证 Goal 消费被验证结果和完成标准，而不是反向依赖实现。", "verification depends_on deliverable"),
  dependency("hierarchy-is-not-dependency", "父子归属、同一阶段或同一负责人不自动构成执行依赖。", "use part_of for hierarchy; keep independent goals parallel"),
];

const ENGLISH_DEPENDENCIES = COMMON_DEPENDENCIES.map((rule, index) => ({ ...rule, statement: [
  "Add depends_on only if the downstream Goal explicitly consumes a verifiable upstream output.",
  "Decisions that change subsequent scope or approach must precede irreversible commitment.",
  "Verification consumes the output and its completion criteria, not the other way around.",
  "Parenthood, phase and shared responsibility do not create an execution dependency.",
][index]! }));

export const PLANNING_METHOD_CATALOG_DIRECTORY = new URL(
  "../../../methods/",
  import.meta.url,
);

export function loadBuiltinPlanningMethodPacks(
  directory: string | URL = PLANNING_METHOD_CATALOG_DIRECTORY, language?: "en",
): PlanningMethodPack[] {
  const dependencies = language ? ENGLISH_DEPENDENCIES : COMMON_DEPENDENCIES;
  return loadPlanningMethodSources(directory, language).map(source => builtin({
    ...source, dependency_rules: [...source.dependency_rules, ...dependencies],
  }, language ? englishInstructions : compilePlanningMethodInstructions));
}

export const BUILTIN_PLANNING_METHOD_PACKS: readonly PlanningMethodPack[] = loadBuiltinPlanningMethodPacks();
const LOCALIZED_BUILTIN_PACKS: Readonly<Record<string, readonly PlanningMethodPack[]>> = { en: loadBuiltinPlanningMethodPacks(PLANNING_METHOD_CATALOG_DIRECTORY, "en") };

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

/** A project pack that refines a built-in method compiles its instructions from both. */
function baselineInstructionSource(pack: PlanningInstructionSource & { method_id?: string }): PlanningInstructionSource {
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
      || compilePlanningMethodInstructions(baselineInstructionSource(normalizedFields)),
  };
  const issues = validatePlanningMethodPack(normalized);
  if (issues.length) throw new Error(issues.join("；"));
  return normalized;
}

export function resolvePlanningMethodPacks(
  personal: readonly PlanningMethodPack[] = [],
  project: readonly PlanningMethodPack[] = [],
  locale?: string,
): ResolvedPlanningMethodPack[] {
  const builtins = locale && Object.hasOwn(LOCALIZED_BUILTIN_PACKS, locale) ? LOCALIZED_BUILTIN_PACKS[locale]! : BUILTIN_PLANNING_METHOD_PACKS;
  const grouped = new Map<string, PlanningMethodPack[]>();
  for (const rawPack of [...builtins, ...personal, ...project]) {
    const pack = rawPack;
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
