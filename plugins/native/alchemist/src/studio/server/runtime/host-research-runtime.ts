import { createHash } from "node:crypto";
import { z } from "zod";
import type { Claim, Evidence, LensReport } from "../../domain/research/report.js";
import type { ResearchExecutionRuntimePort, RuntimeInput } from "./fixture-research-runtime.js";
import { generateWithHost, type AlchemistAiPort } from "./host-port.js";

const marketLabels = ["需求强度", "付出意愿", "竞争压力", "切入缝隙", "触达与时机"] as const;
const buildLabels = [
  "MVP 边界",
  "前后端工作",
  "模型与数据",
  "集成与部署",
  "持续成本",
  "运维与合规",
  "最便宜验证",
] as const;

interface HostResearchRuntimeOptions {
  ai: AlchemistAiPort;
  resolvePlaybookMethods(ids: readonly string[]): readonly string[];
}

export class HostResearchRuntimeAdapter implements ResearchExecutionRuntimePort {
  constructor(private readonly options: HostResearchRuntimeOptions) {}

  async collect(input: RuntimeInput): Promise<Evidence[]> {
    input.signal?.throwIfAborted();
    const idea = input.ideaVersion.content;
    // A search query describes one existing problem or technical capability,
    // not the invented product name or the complete product brief.
    const subject = (input.plan.key.lens === "market_space" ? idea.coreProblem : idea.mvp.inScope[0] ?? idea.coreMechanism)
      .split(/[，。；,;!?！？\n]|\.(?:\s|$)/u)[0]!.trim().replace(/\s+/gu, " ");
    const shortSubject = Array.from(subject).slice(0, 64).join("");
    const chinese = /\p{Script=Han}/u.test(shortSubject);
    const purpose = input.plan.key.lens === "market_space"
      ? (chinese ? "工具 软件 用户评价" : "software tools user reviews")
      : (chinese ? "官方文档 实现" : "implementation official documentation");
    const sources = await this.options.ai.search({ query: `${shortSubject} ${purpose}`, lens: input.plan.key.lens, signal: input.signal });
    input.signal?.throwIfAborted();
    const evidence: Evidence[] = [];
    const seen = new Set<string>();
    for (const source of sources) {
      let url: URL;
      try { url = new URL(source.url); } catch { continue; }
      if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || seen.has(url.href)) continue;
      const excerpt = source.excerpt.trim().slice(0, 800);
      if (!excerpt || !source.title.trim() || /^(?:extract_failed\b|Unable to extract content from the URL\.)/iu.test(excerpt)) continue;
      seen.add(url.href);
      evidence.push({ id: input.idFactory.next("evidence"), sourceId: sourceId(url.href),
        sourceType: sourceType(url.href), title: source.title.trim(), url: url.href, excerpt,
        capturedAt: input.now, contentHash: `sha256:${createHash("sha256").update(`${url.href}\n${excerpt}`).digest("hex")}` });
      if (evidence.length === 16) break;
    }
    if (!evidence.length) throw new Error("RESEARCH_NO_SOURCES");
    return evidence;
  }

  async crossCheck(input: RuntimeInput & { evidence: readonly Evidence[] }): Promise<Claim[]> {
    const labels = input.plan.key.lens === "market_space" ? marketLabels : buildLabels;
    const labelSchema = input.plan.key.lens === "market_space" ? z.enum(marketLabels) : z.enum(buildLabels);
    const evidenceMax = Math.max(0, input.evidence.length - 1);
    const judgmentSchema = z
      .object({
        label: labelSchema,
        status: z.enum(["supported", "tentative", "disputed", "unknown"]),
        conclusion: z.string().trim().min(1),
        rationale: z.string().trim().min(1),
        supportingEvidenceIndexes: z.array(z.number().int().min(0).max(evidenceMax)),
        counterEvidenceIndexes: z.array(z.number().int().min(0).max(evidenceMax)),
        unknowns: z.array(z.string().trim().min(1)),
        changeConditions: z.array(z.string().trim().min(1)),
      })
      .strict();
    const resultSchema = z
      .object({ judgments: z.array(judgmentSchema).length(labels.length) })
      .strict()
      .superRefine((value, context) => {
        if (new Set(value.judgments.map((item) => item.label)).size !== labels.length) {
          context.addIssue({
            code: "custom",
            path: ["judgments"],
            message: "每个判断维度必须且只能出现一次",
          });
        }
      });
    const playbookMethods =
      input.plan.key.lens === "market_space"
        ? this.options.resolvePlaybookMethods(input.plan.appliedPlaybookRuleIds)
        : [];
    const generated = await generateWithHost(this.options.ai, {
      operationId: `${input.plan.id}:cross_checking`,
      purpose: "交叉验证研究证据并形成可校准的核心判断",
      systemPrompt: crossCheckInstructions(input.plan.key.lens),
      userPrompt: JSON.stringify({
        idea: input.ideaVersion.content,
        evidence: input.evidence.map((item, index) => ({
          index,
          title: item.title,
          excerpt: item.excerpt,
          url: item.url,
          sourceType: item.sourceType,
        })),
        confirmedResearchPlaybook: playbookMethods,
      }),
      jsonSchema: z.toJSONSchema(resultSchema) as Record<string, unknown>,
      parse: (value) => resultSchema.parse(value),
      signal: input.signal,
    }, input.plan.modelId);
    return generated.value.judgments.map((item) => ({
      id: input.idFactory.next("claim"),
      label: item.label,
      status: item.status,
      conclusion: item.conclusion,
      rationale: item.rationale,
      supportingEvidenceIds: indexesToEvidenceIds(item.supportingEvidenceIndexes, input.evidence),
      counterEvidenceIds: indexesToEvidenceIds(item.counterEvidenceIndexes, input.evidence),
      unknowns: item.unknowns,
      changeConditions: item.changeConditions,
    }));
  }

  async synthesize(
    input: RuntimeInput & { evidence: readonly Evidence[]; claims: readonly Claim[]; runId: string },
  ): Promise<LensReport> {
    const resultSchema = z.object({ summary: z.string().trim().min(1).max(1_200) }).strict();
    const generated = await generateWithHost(this.options.ai, {
      operationId: `${input.plan.id}:synthesizing`,
      purpose: "综合研究证据与反证，输出简洁而有条件的 Lens 结论",
      systemPrompt:
        "面向创始人写一段可直接用于决策的中文摘要。区分已支持、暂定、有争议与未知；不得把缺少证据写成需求不存在，也不得编造分数。",
      userPrompt: JSON.stringify({ idea: input.ideaVersion.content, judgments: input.claims }),
      jsonSchema: z.toJSONSchema(resultSchema) as Record<string, unknown>,
      parse: (value) => resultSchema.parse(value),
      signal: input.signal,
    }, input.plan.modelId);
    return {
      id: input.idFactory.next("lens_report"),
      runId: input.runId,
      revision: 1,
      key: input.plan.key,
      status: "completed",
      runtimeLabel: generated.runtimeLabel,
      summary: generated.value.summary,
      judgments: [...input.claims],
      createdAt: input.now,
    };
  }

}

function crossCheckInstructions(lens: "market_space" | "build_cost"): string {
  const dimensions = lens === "market_space" ? marketLabels.join("、") : buildLabels.join("、");
  return `逐项判断${dimensions}。先核对每条材料与当前问题和目标用户是否相关；无关新闻、不同使用场景或提取失败不能作为支持或反证。证据数量不是强度；转载同一来源只能算一条。缺少相关证据的维度必须为 unknown，引用数组为空，不得从无关材料推测竞争压力或机会。每个有证据的结论必须引用给定 Evidence 索引，主动保留反证、未知和改变判断的条件。不得编造市场规模、价格或工程工期。`;
}

function sourceId(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "open-web";
  }
}

function sourceType(url: string): Evidence["sourceType"] {
  const host = sourceId(url);
  if (host === "github.com" || host === "gitlab.com") return "repository";
  if (/reddit\.com$|g2\.com$|capterra\.com$/.test(host)) return "user_signal";
  if (/^(docs\.|developer\.|developers\.|support\.)/.test(host)) return "official";
  return "independent_analysis";
}

function indexesToEvidenceIds(indexes: readonly number[], evidence: readonly Evidence[]): string[] {
  return [...new Set(indexes.map((index) => evidence[index]?.id).filter((id): id is string => Boolean(id)))];
}
