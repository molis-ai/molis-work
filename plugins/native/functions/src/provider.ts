import type { ChoiceCriterion } from "@molis-ai/molis-work-contracts/modules/functions";
import { FunctionsError } from "./keys.js";

export const TYPESAFE_SYSTEMONE_URL = "https://api.typesafe.ai/v1/systemone";
const PREVIEW_TIMEOUT_MS = 30_000;

export interface TypeSafeEvaluateInput {
  readonly model: string;
  readonly state: string;
  readonly question_key: string;
  readonly instructions: string;
  readonly criteria: readonly ChoiceCriterion[];
}

export interface TypeSafeEvaluateResult {
  readonly choice: string | null;
  readonly probabilities: Readonly<Record<string, number>>;
  readonly confidence: number | null;
  readonly model: string;
}

export interface TypeSafeProvider {
  evaluate(apiKey: string, input: TypeSafeEvaluateInput, signal?: AbortSignal): Promise<TypeSafeEvaluateResult>;
}

export function createHttpTypeSafeProvider(fetchImpl: typeof fetch = fetch): TypeSafeProvider {
  return {
    async evaluate(apiKey, input, signal) {
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
            model: input.model,
            state: input.state,
            questions: {
              [input.question_key]: {
                type: "choice",
                instructions: input.instructions,
                criteria: Object.fromEntries(input.criteria.map((item) => [item.key, item.description])),
              },
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
      return readChoiceAnswer(body, input.question_key);
    },
  };
}

export function readChoiceAnswer(body: unknown, questionKey: string): TypeSafeEvaluateResult {
  const record = isRecord(body) ? body : {};
  const answers = isRecord(record.answers) ? record.answers[questionKey] : undefined;
  const answer = isRecord(answers) ? answers : {};
  const choice = typeof answer.choice === "string" && answer.choice ? answer.choice : null;
  const probabilities = isRecord(answer.probabilities)
    ? Object.fromEntries(Object.entries(answer.probabilities).filter((entry): entry is [string, number] => typeof entry[1] === "number"))
    : {};
  return {
    choice,
    probabilities,
    confidence: typeof answer.confidence === "number" ? answer.confidence : null,
    model: typeof record.model === "string" ? record.model : "",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAbortError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "name" in error && (error as { name: string }).name === "TimeoutError"
    || (error instanceof Error && error.name === "AbortError");
}
