import type {
  ChoiceCriterion,
  FunctionRecord,
  FunctionsPrimitive,
  NoulCriteria,
  TypeSafeEvaluateResult,
  TypeSafeProvider,
} from "@molis-ai/molis-work-contracts/modules/functions";
import { FunctionsError } from "./keys.js";

export const TYPESAFE_SYSTEMONE_URL = "https://api.typesafe.ai/v1/systemone";
const PREVIEW_TIMEOUT_MS = 30_000;

export function createHttpTypeSafeProvider(fetchImpl: typeof fetch = fetch): TypeSafeProvider {
  return {
    async evaluate(apiKey, record, state, signal) {
      const timeout = AbortSignal.timeout(PREVIEW_TIMEOUT_MS);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      let response: Response;
      try {
        response = await fetchImpl(TYPESAFE_SYSTEMONE_URL, {
          method: "POST",
          headers: {
            authorization: `Bearer ${apiKey}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: record.model,
            state,
            questions: {
              [record.function_key]: questionBody(record),
            },
          }),
          signal: combined,
        });
      } catch (error) {
        if (isAbortError(error)) {
          throw new FunctionsError("functions.provider_timeout", "TypeSafe 超时，没有自动重试");
        }
        throw new FunctionsError("functions.provider_failed", "TypeSafe 请求失败");
      }
      if (response.status === 401 || response.status === 403) {
        throw new FunctionsError("functions.provider_unauthorized", "TypeSafe Key 无效");
      }
      if (!response.ok) {
        throw new FunctionsError("functions.provider_failed", `TypeSafe 返回 ${response.status}`);
      }
      const body = await response.json().catch(() => null);
      return readAnswer(body, record);
    },
  };
}

export function readChoiceAnswer(body: unknown, questionKey: string): TypeSafeEvaluateResult {
  return readAnswer(body, {
    primitive: "choice",
    function_key: questionKey,
    criteria: [],
  });
}

export function readAnswer(
  body: unknown,
  record: { primitive: FunctionsPrimitive; function_key: string; criteria: FunctionRecord["criteria"] },
): TypeSafeEvaluateResult {
  const payload = isRecord(body) ? body : {};
  const answers = isRecord(payload.answers) ? payload.answers[record.function_key] : undefined;
  const answer = isRecord(answers) ? answers : {};
  const model = typeof payload.model === "string" ? payload.model : "";
  const probabilities = isRecord(answer.probabilities)
    ? Object.fromEntries(Object.entries(answer.probabilities).filter((entry): entry is [string, number] => typeof entry[1] === "number"))
    : {};
  if (record.primitive === "noul") {
    if (typeof answer.noul !== "number" || !Number.isFinite(answer.noul)) {
      throw new FunctionsError("functions.provider_failed", "TypeSafe 没有返回成立概率");
    }
    return {
      primitive: "noul",
      choice: null,
      noul: answer.noul,
      score: null,
      legend: null,
      probabilities: {},
      confidence: null,
      model,
    };
  }
  if (record.primitive === "score") {
    if (typeof answer.score !== "number" || !Number.isFinite(answer.score)) {
      throw new FunctionsError("functions.provider_failed", "TypeSafe 没有返回评分");
    }
    const levels = Array.isArray(record.criteria) && record.criteria.every((item) => typeof item === "string")
      ? record.criteria as readonly string[]
      : [];
    return {
      primitive: "score",
      choice: null,
      noul: null,
      score: answer.score,
      legend: levels,
      probabilities,
      confidence: typeof answer.confidence === "number" ? answer.confidence : null,
      model,
    };
  }
  const choice = typeof answer.choice === "string" && answer.choice ? answer.choice : null;
  return {
    primitive: "choice",
    choice,
    noul: null,
    score: null,
    legend: null,
    probabilities,
    confidence: typeof answer.confidence === "number" ? answer.confidence : null,
    model,
  };
}

function questionBody(record: FunctionRecord): Record<string, unknown> {
  if (record.primitive === "noul") {
    const criteria = record.criteria as NoulCriteria;
    const mapped: Record<string, string> = {};
    if (criteria.true_description) mapped.true = criteria.true_description;
    if (criteria.false_description) mapped.false = criteria.false_description;
    return {
      type: "noul",
      instructions: record.instructions,
      ...(Object.keys(mapped).length > 0 ? { criteria: mapped } : {}),
    };
  }
  if (record.primitive === "score") {
    return {
      type: "score",
      instructions: record.instructions,
      criteria: [...record.criteria],
    };
  }
  return {
    type: "choice",
    instructions: record.instructions,
    criteria: Object.fromEntries((record.criteria as readonly ChoiceCriterion[]).map((item) => [item.key, item.description])),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && (error as { name: string }).name === "TimeoutError"
    || (error instanceof Error && error.name === "AbortError");
}
