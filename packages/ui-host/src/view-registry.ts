import type {
  UiCommandDeclaration,
  UiViewCreateEntry,
  UiViewDeclaration,
  UiViewGroup,
  UiViewRail,
  UiViewSlot,
  UiViewStartEntry,
  UiWorkspaceCommand,
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
  /** A navigator view's place in the rail apart from its group (`core` backbone, `extend`), and whether the Dock keeps it by default. */
  rail?: UiViewRail;
  pinned_default?: true;
  creates?: UiViewCreateEntry;
  start?: UiViewStartEntry;
}

/** What the registry reads of a Manifest: who it is and where its views and commands are placed. */
export interface UiViewRegistryManifest {
  readonly plugin_id: string;
  readonly name: string;
  readonly ui: { readonly views?: readonly UiViewDeclaration[]; readonly commands?: readonly UiCommandDeclaration[] };
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
  readonly #commands: Array<{ plugin_id: string; plugin_title: string; declaration: UiCommandDeclaration }>;

  constructor(entries: readonly UiViewRegistryInput[]) {
    const views: UiPlacedView[] = [];
    const commands: Array<{
      plugin_id: string;
      plugin_title: string;
      declaration: UiCommandDeclaration;
    }> = [];
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
          ...(view.rail ? { rail: view.rail } : {}),
          ...(view.pinned_default === true ? { pinned_default: true as const } : {}),
          ...(view.creates ? { creates: { ...view.creates } } : {}),
          ...(view.start ? { start: { ...view.start } } : {}),
        });
      }
      for (const declaration of manifest.ui.commands ?? []) {
        commands.push({
          plugin_id: manifest.plugin_id,
          plugin_title: manifest.name,
          declaration,
        });
      }
    }
    this.#views = views.sort((left, right) =>
      left.order - right.order
      || left.plugin_id.localeCompare(right.plugin_id)
      || left.view_id.localeCompare(right.view_id));
    this.#commands = commands;
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

  /**
   * Commands with availability resolved by the owning Plugin. An unavailable
   * command still appears, with the reason, instead of silently vanishing.
   */
  commands(
    availability: (pluginId: string, commandId: string) => UiWorkspaceCommand["availability"],
  ): UiWorkspaceCommand[] {
    return this.#commands.map((entry) => ({
      plugin_id: entry.plugin_id,
      plugin_title: entry.plugin_title,
      declaration: entry.declaration,
      availability: availability(entry.plugin_id, entry.declaration.command_id),
    }));
  }

  /** Commands that accept one input kind, for a content action menu. */
  commandsFor(
    inputKind: UiCommandDeclaration["input_kinds"][number],
    availability: (pluginId: string, commandId: string) => UiWorkspaceCommand["availability"],
  ): UiWorkspaceCommand[] {
    return this.commands(availability)
      .filter((command) => command.declaration.input_kinds.includes(inputKind));
  }
}
