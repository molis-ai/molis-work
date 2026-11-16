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

const post = <T>(path: string, body: unknown, proj?: string): Promise<T> =>
  req()(endpoint(path, proj), { method: "POST", body }) as Promise<T>;

export const sessionsApi = {
  list: (input: ExternalSessionListInput) => post<PersonSessionListOutput>("/api/sessions/list", input),
  history: (input: ExternalSessionHistoryInput) => post<ExternalSessionHistoryOutput>("/api/sessions/history", input),
  scopeRead: (includeCounts = true) =>
    req()(endpoint(`/api/sessions/scope${includeCounts ? "" : "?counts=0"}`), { method: "GET" }) as Promise<SessionScopeWithMeta>,
  scopeSet: (input: ExternalSessionScopeSetInput) => post<SessionScopeWithMeta>("/api/sessions/scope", input),
  projectAiReadSet: (projectId: string, input: ExternalSessionProjectAiReadSetInput) =>
    post<ExternalSessionProjectAiRead>("/api/sessions/project-ai-read", input, projectId && projectId !== currentProjectId() ? projectId : undefined),
  discoveryRun: (input: ExternalSessionDiscoveryRunInput = {}) => post<ExternalSessionDiscoveryRunOutput>("/api/sessions/discovery", input),
  attributionSet: (input: ExternalSessionAttributionInput) => post<ExternalSessionRow>("/api/sessions/attribution", input),
  attributionSuggest: (input: ExternalSessionAttributionSuggestInput) => post<ExternalSessionAttributionSuggestOutput>("/api/sessions/suggest", input),
  toolSearch: (input: ExternalSessionToolSearchInput) => post<ExternalSessionToolSearchOutput>("/api/sessions/tool-search", input),
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
