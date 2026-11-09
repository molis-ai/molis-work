import type { AttentionSurfaceEntry } from "@molis-ai/molis-work-contracts/modules/attention-resumption";
import type { ContextRelationType } from "@molis-ai/molis-work-contracts/modules/context-ledger";
import { requireSynchronous, type ActionCallContext, type ActionSubject, type ActionView, type ExactActionReference } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PluginLifecycleState } from "@molis-ai/molis-work-contracts/platform/plugin";
import type { PresentationDeclaration, PresentationOverview, PresentationStartForm, PresentationValues, PresentationValuesInput } from "@molis-ai/molis-work-contracts/platform/presentation";
import type { OwnedTextRef, UiSlotDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import type { PlacedObject } from "@molis-ai/molis-work-contracts/services/placement";
import type { SurfaceInstallationRef } from "@molis-ai/molis-work-contracts/services/surface-composition";
import type { SurfaceCorrections } from "./corrections.js";

export interface SurfacePlugin {
  plugin_id: string;
  install_id: string;
  scope: "project" | "home";
  revision: string;
  state: PluginLifecycleState;
  presentation?: PresentationDeclaration;
  slots: readonly UiSlotDescriptor[];
  /** Only for an installation visible on this project's home. The Host supplies these facts from the same catalog read. */
  home?: SurfaceHomePlugin;
}

export interface SurfaceHomePlugin extends Omit<SurfaceInstallationRef, "scope" | "install_id"> {
  readonly order: number;
  /** The installation should be available here but has no current activation (not a deliberate switch-off). */
  readonly unavailable?: true;
  /** Only the actual stage selected by the Host, including for a dual-instance plugin. */
  readonly stage_view_id?: string;
  /** Only real input forms whose contribution binds this exact action in this installation. */
  readonly forms?: ReadonlyArray<PresentationStartForm & { readonly action: ExactActionReference }>;
  readonly enable?:
    | { readonly kind: "project_membership"; readonly action: ExactActionReference; readonly expected_revision: string }
    | { readonly kind: "project_installation"; readonly action: ExactActionReference }
    | { readonly kind: "home_plugin_settings" };
}

export interface SurfaceHomePorts {
  overview(action: ActionView, signal: AbortSignal, assertCurrent: () => void): Promise<PresentationOverview>;
  acceptsEmptyInput(action: ActionView): boolean;
  /** Synchronous recheck of the original visible directory, release identities, routes and member revision. */
  retainCatalog(plugins: readonly SurfacePlugin[]): () => void;
  hiddenAboveLabel(count: number): OwnedTextRef;
}

export interface SurfaceActionDirectory {
  readonly views: readonly ActionView[];
  /** Only these exact rows, proved against their original registrations during discovery. */
  retain(views: readonly ActionView[]): () => void;
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
  readonly home?: SurfaceHomePorts;
  discover(): SurfaceActionDirectory | Promise<SurfaceActionDirectory>;
  values(action: ActionView, input: PresentationValuesInput, signal: AbortSignal, assertCurrent: () => void): Promise<PresentationValues>;
  attention(): readonly AttentionSurfaceEntry[];
  relations(candidates: readonly PlacedObject[]): readonly SurfaceRelation[];
  diagnostic?(event: "values_unavailable" | "overview_unavailable" | "action_missing", details: { plugin_id?: string; provider_id?: string; ref?: string }): void;
}

export interface SurfaceCorrectPorts extends SurfaceCallPorts {
  now(): string;
}

export const subjectKey = (subject: ActionSubject) => JSON.stringify([subject.kind, subject.id]);
export const viewRef = (view: ActionView) => `${view.capability_id}@${view.version}`;
export const viewKey = (view: ActionView) => JSON.stringify([viewRef(view), view.provider.provider_id]);
export const viewRevision = (view: ActionView) => [viewKey(view), view.provider.kind, view.provider.plugin_install_id, view.provider.project_id, view.action.scope,
  view.availability.available ? true : [view.availability.code, view.availability.kind]];

export function checkCurrent(ports: Pick<SurfaceComposePorts, "signal" | "current">): void {
  ports.signal?.throwIfAborted();
  requireSynchronous(ports.current());
}
