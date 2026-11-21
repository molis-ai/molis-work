import type { TextRef } from "./ui-text.js";

/** Bounds for plugin-declared on-demand help (Batch 40, VUX-55). */
export const UI_HELP_LIMITS = {
  maxTopics: 16,
  maxSectionsPerTopic: 12,
  maxItemsPerSection: 12,
  maxIdLength: 64,
} as const;

/** One section inside an on-demand help topic (e.g. "这是什么", "例子", "高级"). */
export interface UiHelpSectionDeclaration {
  readonly id: string;
  readonly heading: TextRef;
  readonly body?: TextRef;
  readonly items?: readonly TextRef[];
  /** Collapsed by default under a disclosure summary (e.g. "高级" / "Advanced"). */
  readonly collapsible?: boolean;
  /** Optional summary text when `collapsible: true`; defaults to `heading`. */
  readonly summary?: TextRef;
}

/** One help topic opened by a page-level "帮助" button or field-level "了解此项" link. */
export interface UiHelpTopicDeclaration {
  readonly id: string;
  readonly title: TextRef;
  /** Optional non-blocking first-visit tip shown once until the user skips it. */
  readonly first_visit_tip?: TextRef;
  readonly sections: readonly UiHelpSectionDeclaration[];
}

/**
 * Plugin-declared on-demand help (Batch 03 Scheme A; Batch 40 VUX-55).
 * Every plugin owns its own help content through its `ui.locales` language files;
 * the workbench renders the same Scheme A card and right-side reading view for all plugins.
 */
export interface UiHelpDeclaration {
  /** Topic id opened by the page-level "帮助" trigger; defaults to "page" or the first topic. */
  readonly default_topic?: string;
  readonly topics: readonly UiHelpTopicDeclaration[];
}
