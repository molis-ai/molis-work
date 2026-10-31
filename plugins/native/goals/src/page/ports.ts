import type { PluginIconName } from "@molis-ai/molis-work-plugin-sdk/ui";
import type { GoalInputsCreatableKind } from "./inputs.js";

export type GoalsTranslate = (text: string, values?: Record<string, string | number>) => string;

/** A hint the page writes next to a heading (the design system's `renderHint`). */
export interface GoalsHintOptions {
  id: string;
  label: string;
  text?: string;
  html?: string;
  iconName?: PluginIconName;
}

/** The Goal terminal pane beside the Goal document, as the terminal client's markup takes it. */
export interface GoalsTerminalPaneModel {
  selected?: { goal_id: string; title: string; decomposition_state: string; fulfillment_state: string; statusHtml: string; event_work?: boolean };
  children: readonly { goal_id: string; title: string; statusLabel: string; nextAction: string }[];
  cliAvailability: Record<string, boolean>;
  text(value: string, vars?: Record<string, string | number>): string;
  icon(name: "chevron-right" | "target" | "plus" | "tree" | "play" | "copy" | "refresh" | "terminal"): string;
}

/** Mounts one surface of a registered contribution where the contribution declares it, and returns what it draws. */
export type MountSurface = (contributionId: string, surface: string, model: unknown) => string;

/**
 * What the Goals page takes from the workbench that Goals does not own: the request's words and formats, the way a registered
 * contribution is mounted, and the four things the shell or another plugin draws (an Artifacts reference, the kinds the page's
 * plugins can make new, the terminal pane, the design system's hint). `TView` is the page view the workbench holds; Goals reads
 * the part of it that `GoalsPageView` names and hands the rest back untouched.
 */
export interface GoalsPagePorts<TView> {
  mount: MountSurface;
  L: GoalsTranslate;
  /** The words of Goals itself (its Manifest dictionary), for what Goals draws. */
  goalsL: GoalsTranslate;
  currentLocale(): "zh" | "en";
  listJoin(values: readonly string[]): string;
  formatDate(value: string | null | undefined): string;
  renderList(values: string[], empty: string): string;
  prefixLocalLinks(html: string, routePrefix: string, desktopShell?: boolean): string;
  /** An Artifacts reference, as a chip. */
  renderReference(value: string, label?: string): string;
  /** The kinds a Goal's inputs offer to make new, from the plugins the page shows. */
  creatableKinds(view: TView): readonly GoalInputsCreatableKind[];
  inPluginWords<T>(pluginId: string, run: () => T): T;
  renderTerminalPane(model: GoalsTerminalPaneModel): string;
  renderHint(options: GoalsHintOptions): string;
}
