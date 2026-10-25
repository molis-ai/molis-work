import type { InteractionClient, InteractionClientHost } from "@molis-ai/molis-work-design-system";
import type { ReceiptActions } from "../input-receipts.js";
import type { Lifetime, ReceiptLinks, ShowReviews, Translate } from "../types.js";

/** What the workbench's shared receipt draws (`host.receipts`, the same as the Assistant's). */
export interface HostReceipts extends ReceiptLinks {
  line(owner: Element, turn: unknown, round?: unknown, act?: ReceiptActions): HTMLElement | null;
  tray(owner: Element, queued: readonly unknown[] | undefined, round?: unknown, act?: Pick<ReceiptActions, "withdraw">): HTMLElement | null;
  /** The words for a plan step's state, the same everywhere a step is shown. */
  step(state: string): string;
}

/** A card made interactive by the Host (the shared question card): what it holds, and how to close it. */
export type HostInteraction = InteractionClient;

/** What the workbench gives Coding's page (`host`): navigation, the shared receipts and reviews, and the page's own requests. */
export interface CodingHost {
  readonly translate: Translate;
  /** Makes the page's lifetime from its root; none when the root is gone or already mounted. */
  mountPluginClient(root: Element): Lifetime | null;
  /** The Manifest identity this page runs under; presentation only. */
  readonly pluginId: string;
  /** A relative path under this plugin's Manifest identity and current project. */
  pluginRoute(path: string): string;
  /** The page's user-facing words for a refused request, when the Host has them. */
  readRefusal?(status: number, code: unknown): string | undefined;
  showReviews?: ShowReviews;
  openItem(kind: string, id: string, title?: string): void;
  openBeside?(kind: string, id?: string, title?: string): void;
  revealTask?(): void;
  receipts: HostReceipts;
  interaction(card: HTMLElement, options: InteractionClientHost): HostInteraction;
  selectWorkspace(id: string): Promise<void>;
  addWorkspace(path: string): Promise<{ readonly workspace_id: string }>;
  confirm(question: string): Promise<boolean>;
  /** The directory column's face was chosen; true when the Host handled it. */
  onDirectoryFace?(face: string): boolean;
}
