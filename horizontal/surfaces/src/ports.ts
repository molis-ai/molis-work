import type { AttentionSurfaceEntry } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type { ContextRelationType } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { requireSynchronous, type ActionCallContext, type ActionSubject, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PresentationDeclaration, PresentationValues, PresentationValuesInput } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { UiSlotDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import type { PlacedObject } from "@molis-ai/molis-work-contracts/services/placement";
import type { SurfaceCorrections } from "./corrections.js";

export interface SurfacePlugin {
  plugin_id: string;
  install_id: string;
  scope: "project" | "home";
  revision: string;
  enabled: boolean;
  presentation?: PresentationDeclaration;
  slots: readonly UiSlotDescriptor[];
}

export interface SurfaceRelation {
  derived: ActionSubject;
  origin: ActionSubject;
  type: ContextRelationType;
  revision: number;
}

interface SurfaceCallPorts {
  catalog(): readonly SurfacePlugin[] | Promise<readonly SurfacePlugin[]>;
  readonly corrections: SurfaceCorrections;
  current(): void;
  beforeEffect(): Promise<void>;
}

export interface SurfaceComposePorts extends SurfaceCallPorts {
  readonly caller: Pick<ActionCallContext, "actor_id" | "project_id" | "audience" | "plugin_install_id" | "calling_plugin_id">;
  readonly signal?: AbortSignal;
  discover(): readonly ActionView[] | Promise<readonly ActionView[]>;
  retain(actions: readonly ActionView[]): () => void;
  values(action: ActionView, input: PresentationValuesInput, signal: AbortSignal): Promise<PresentationValues>;
  attention(): readonly AttentionSurfaceEntry[];
  relations(candidates: readonly PlacedObject[]): readonly SurfaceRelation[];
  diagnostic?(event: "values_unavailable" | "action_missing", details: { plugin_id?: string; provider_id?: string; ref?: string }): void;
}

export interface SurfaceCorrectPorts extends SurfaceCallPorts {
  now(): string;
}

export const subjectKey = (subject: ActionSubject) => JSON.stringify([subject.kind, subject.id]);
export const viewRef = (view: ActionView) => `${view.capability_id}@${view.version}`;
export const viewKey = (view: ActionView) => JSON.stringify([viewRef(view), view.provider.provider_id]);

export function checkCurrent(ports: Pick<SurfaceComposePorts, "signal" | "current">): void {
  ports.signal?.throwIfAborted();
  requireSynchronous(ports.current());
}
