import { ActionError, isSubjectReader, type ActionSubjectContext, type ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import type { PlacedObject, PlacementObjectState } from "@molis-ai/molis-work-contracts/services/placement";
import type { PlacementPorts, PlacementScope } from "./index.js";

export interface PlacementRead { state: PlacementObjectState; reason: string | null; context: ActionSubjectContext | null; plugin: { plugin_id: string; title: string } | null }

/** Adapt the subject owner's answer; only the owner may say the object is missing. */
export async function readPlacementIn(ports: PlacementPorts, object: PlacedObject, projectId: string | null, t: (key: string) => string): Promise<PlacementRead> {
    let scope: PlacementScope;
    try { scope = await ports.scope(projectId); }
    catch (error) {
      if (error instanceof ActionError && error.code === "placement.project_missing") return { state: "missing", reason: t("workbench.subject-reader.containing-project-was-deleted"), context: null, plugin: null };
      return { state: "unavailable", reason: error instanceof Error ? error.message : t("workbench.subject-reader.can-t-open-its-location-right-now"), context: null, plugin: null };
    }
    let views: readonly ActionView[];
    try { views = await scope.client.discover(scope.caller); }
    catch (error) { return { state: "unavailable", reason: error instanceof Error ? error.message : t("workbench.subject-reader.cannot-be-read-now"), context: null, plugin: null }; }
    const readers = views.filter(view => isSubjectReader(view.action) && view.action.subject_kinds.includes(object.kind));
    const reader = readers.find(view => view.availability.available);
    const plugin = readers[0] ? { plugin_id: readers[0].provider.plugin_id ?? readers[0].provider.provider_id, title: readers[0].provider.title } : null;
    if (!reader) {
      const state = readers[0]?.availability;
      return { state: "unavailable", reason: state && !state.available ? state.reason : t("workbench.subject-reader.this-plugin-isn-t-enabled-or-doesn"), context: null, plugin };
    }
    try {
      const context = await scope.client.invoke(scope.caller, { capability_id: reader.capability_id, version: reader.version, provider_id: reader.provider.provider_id }, { subject_id: object.id }) as ActionSubjectContext;
      if (context.title && !ports.surfaceSource) { await ports.beforeEffect?.(); ports.titles.set(object.kind, object.id, context.title); }
      return { state: "ok", reason: null, context, plugin };
    } catch (error) {
      const code = error instanceof ActionError ? error.code : "";
      if (code.endsWith(".not_found")) return { state: "missing", reason: t("workbench.subject-reader.the-original-was-deleted"), context: null, plugin };
      return { state: "unavailable", reason: error instanceof Error ? error.message : t("workbench.subject-reader.cannot-be-read-now"), context: null, plugin };
    }
  }

