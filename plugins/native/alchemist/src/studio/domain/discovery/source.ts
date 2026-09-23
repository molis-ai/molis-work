export const pulseSourceIds = ["toolify", "watcha", "github"] as const;

export type PulseSourceId = (typeof pulseSourceIds)[number];

export interface NativeMetric {
  name: string;
  label: string;
  value: number;
  unit: "count" | "percent" | "visits" | "score";
  observedAt: string;
  definition: string;
}

export interface SupplySignal {
  id: string;
  sourceId: PulseSourceId;
  title: string;
  url: string;
  summary: string;
  observedAt: string;
  publishedAt?: string;
  categories: readonly string[];
  nativeMetrics: readonly NativeMetric[];
  supports: readonly string[];
  cannotProve: readonly string[];
}

interface SourceCollectionBase {
  sourceId: PulseSourceId;
  requestUrl: string;
  fetchedAt: string;
  signals: readonly SupplySignal[];
  httpStatus?: number;
  contentHash?: string;
  rateLimitRemaining?: number;
  rateLimitReset?: string;
}

export type SourceCollectionResult =
  | (SourceCollectionBase & { status: "completed"; errorCode?: never })
  | (SourceCollectionBase & { status: "error"; errorCode: string });

export interface SourceQuery {
  since: string;
  limit: number;
}

export interface SourcePort {
  readonly sourceId: PulseSourceId;
  collect(input: SourceQuery, signal?: AbortSignal): Promise<SourceCollectionResult>;
}

export interface SourceSetting {
  sourceId: PulseSourceId;
  label: string;
  enabled: boolean;
  homepageUrl: string;
  capability: string;
  limitation: string;
  updatedAt: string;
}
