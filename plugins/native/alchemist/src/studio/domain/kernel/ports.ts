export interface StructuredGenerationRequest<Result> {
  operationId: string;
  purpose: string;
  systemPrompt: string;
  userPrompt: string;
  jsonSchema: Record<string, unknown>;
  parse(value: unknown): Result;
  signal?: AbortSignal;
  /** Repeatable revocation check; Host must compose it at the final model dispatch boundary. */
  beforeModelDispatch?: () => Promise<void>;
}

export interface GenerationResult<Result> {
  operationId: string;
  runtimeLabel: string;
  value: Result;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface RuntimeModel {
  id: string;
  label: string;
  runtimeLabel: string;
  costVisibility: "priced" | "unobservable";
}

export interface AiRuntimePort {
  listModels(): Promise<readonly RuntimeModel[]>;
  generateStructured<Result>(input: StructuredGenerationRequest<Result>): Promise<GenerationResult<Result>>;
}
