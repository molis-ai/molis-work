import type {} from "@molis-ai/molis-work-plugin-sdk";
import type { UiRequest } from "@molis-ai/molis-work-contracts/platform/ui";
import type {
  ExternalSessionAttributionInput,
  ExternalSessionAttributionSuggestInput,
  ExternalSessionAttributionSuggestOutput,
  ExternalSessionDiscoveryRunInput,
  ExternalSessionDiscoveryRunOutput,
  ExternalSessionHistoryInput,
  ExternalSessionHistoryOutput,
  ExternalSessionListInput,
  ExternalSessionListOutput,
  ExternalSessionProjectAiRead,
  ExternalSessionProjectAiReadSetInput,
  ExternalSessionRow,
  ExternalSessionScopeSetInput,
  ExternalSessionScopeView,
  ExternalSessionSource,
  ExternalSessionToolSearchInput,
  ExternalSessionToolSearchOutput,
} from "@molis-ai/molis-work-contracts/services/sessions";

export interface SessionToolMeta {
  readonly id: string;
  readonly display_name: string;
  readonly vendor: string;
  readonly surface: "cli" | "ide" | "desktop" | "cloud";
  readonly region: "global" | "cn" | "unspecified";
  readonly group: "connected" | "export_only" | "unsupported";
  readonly unsupported_kind: "not_open" | "pending" | null;
  readonly gap: string | null;
  readonly can_tool_search: boolean;
  readonly export_command: string | null;
}

export interface SessionScopeWithMeta extends ExternalSessionScopeView {
  readonly tool_meta: readonly SessionToolMeta[];
}

export interface PersonSessionListOutput extends Omit<ExternalSessionListOutput, "sessions" | "sources"> {
  readonly sessions: ExternalSessionRow[];
  readonly sources: ExternalSessionSource[];
}

const req = (): UiRequest => molisWorkRequest;

export function currentRoutePrefix(): string {
  return document.body?.dataset.routePrefix || "";
}

export function currentProjectId(): string {
  return document.body?.dataset.projectId || "";
}

function endpoint(path: string, projectOverride?: string): string {
  if (projectOverride) return `/projects/${encodeURIComponent(projectOverride)}${path}`;
  return `${currentRoutePrefix()}${path}`;
}

export const sessionsApi = {
  list(input: ExternalSessionListInput): Promise<PersonSessionListOutput> {
    return req()(endpoint("/api/sessions/list"), { method: "POST", body: input }) as Promise<PersonSessionListOutput>;
  },
  history(input: ExternalSessionHistoryInput): Promise<ExternalSessionHistoryOutput> {
    return req()(endpoint("/api/sessions/history"), { method: "POST", body: input }) as Promise<ExternalSessionHistoryOutput>;
  },
  scopeRead(includeCounts = true): Promise<SessionScopeWithMeta> {
    const suffix = includeCounts ? "" : "?counts=0";
    return req()(endpoint(`/api/sessions/scope${suffix}`), { method: "GET" }) as Promise<SessionScopeWithMeta>;
  },
  scopeSet(input: ExternalSessionScopeSetInput): Promise<SessionScopeWithMeta> {
    return req()(endpoint("/api/sessions/scope"), { method: "POST", body: input }) as Promise<SessionScopeWithMeta>;
  },
  projectAiReadSet(projectId: string, input: ExternalSessionProjectAiReadSetInput): Promise<ExternalSessionProjectAiRead> {
    const target = projectId && projectId !== currentProjectId() ? projectId : undefined;
    return req()(endpoint("/api/sessions/project-ai-read", target), { method: "POST", body: input }) as Promise<ExternalSessionProjectAiRead>;
  },
  discoveryRun(input: ExternalSessionDiscoveryRunInput = {}): Promise<ExternalSessionDiscoveryRunOutput> {
    return req()(endpoint("/api/sessions/discovery"), { method: "POST", body: input }) as Promise<ExternalSessionDiscoveryRunOutput>;
  },
  attributionSet(input: ExternalSessionAttributionInput): Promise<ExternalSessionRow> {
    return req()(endpoint("/api/sessions/attribution"), { method: "POST", body: input }) as Promise<ExternalSessionRow>;
  },
  attributionSuggest(input: ExternalSessionAttributionSuggestInput): Promise<ExternalSessionAttributionSuggestOutput> {
    return req()(endpoint("/api/sessions/suggest"), { method: "POST", body: input }) as Promise<ExternalSessionAttributionSuggestOutput>;
  },
  toolSearch(input: ExternalSessionToolSearchInput): Promise<ExternalSessionToolSearchOutput> {
    return req()(endpoint("/api/sessions/tool-search"), { method: "POST", body: input }) as Promise<ExternalSessionToolSearchOutput>;
  },
};

export async function copyPlainText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

export function formatActivityTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return globalThis.format.date(iso, "datetime");
}
