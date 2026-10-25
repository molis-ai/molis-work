import type {
  UiViewCreateEntry,
  UiViewDeclaration,
  UiViewGroup,
  UiViewSlot,
  UiViewStartEntry,
} from "@molis-ai/molis-work-contracts/platform/ui";

/**
 * Where the shell should place one Plugin view. The Host owns the regions and
 * their order; a Plugin only states which region it belongs to.
 */
export interface UiPlacedView {
  plugin_id: string;
  plugin_title: string;
  view_id: string;
  slot: UiViewSlot;
  title: string;
  contribution_id: string;
  icon: string | null;
  accepts_objects: boolean;
  context_binding?: "focused-object";
  order: number;
  /** The rail group a navigator or island view is listed in; null is 更多. */
  group: UiViewGroup | null;
  creates?: UiViewCreateEntry;
  start?: UiViewStartEntry;
}

/** What the registry reads of a Manifest: who it is and where its views are placed. */
export interface UiViewRegistryManifest {
  readonly plugin_id: string;
  readonly name: string;
  readonly ui: { readonly views?: readonly UiViewDeclaration[] };
}

export interface UiViewRegistryInput {
  manifest: UiViewRegistryManifest;
  /** Only enabled Plugins are placed. A disabled Plugin leaves no gap behind. */
  enabled: boolean;
}

function defaultContributionId(manifest: UiViewRegistryManifest, viewId: string): string {
  return `${manifest.plugin_id}.${viewId}`;
}

/**
 * Derives the shell's navigation and work surfaces from Manifests.
 *
 * This replaces hand-written per-plugin branches: adding a Plugin means adding
 * a Manifest, not editing the shell.
 */
export class UiViewRegistry {
  readonly #views: UiPlacedView[];

  constructor(entries: readonly UiViewRegistryInput[]) {
    const views: UiPlacedView[] = [];
    for (const entry of entries) {
      if (!entry.enabled) continue;
      const manifest = entry.manifest;
      for (const view of manifest.ui.views ?? []) {
        views.push({
          plugin_id: manifest.plugin_id,
          plugin_title: manifest.name,
          view_id: view.view_id,
          slot: view.slot,
          title: view.title,
          contribution_id: view.contribution_id ?? defaultContributionId(manifest, view.view_id),
          icon: view.icon ?? null,
          accepts_objects: view.accepts_objects === true,
          ...(view.context_binding ? { context_binding: view.context_binding } : {}),
          order: view.order ?? 100,
          group: view.group ?? null,
          ...(view.creates ? { creates: { ...view.creates } } : {}),
          ...(view.start ? { start: { ...view.start } } : {}),
        });
      }
    }
    this.#views = views.sort((left, right) =>
      left.order - right.order
      || left.plugin_id.localeCompare(right.plugin_id)
      || left.view_id.localeCompare(right.view_id));
  }

  /** Views for one region, already in the order the shell should render them. */
  slot(slot: UiViewSlot): UiPlacedView[] {
    return this.#views.filter((view) => view.slot === slot).map((view) => ({ ...view }));
  }

  views(): UiPlacedView[] {
    return this.#views.map((view) => ({ ...view }));
  }

  view(pluginId: string, viewId: string): UiPlacedView | null {
    const found = this.#views.find((item) => item.plugin_id === pluginId && item.view_id === viewId);
    return found ? { ...found } : null;
  }
}
