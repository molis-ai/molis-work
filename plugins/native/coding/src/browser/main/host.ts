import type { InteractionClient, InteractionClientHost } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import type { UiPageDrafts, UiPageReturns } from "@molis-ai/molis-work-contracts/platform/ui";
import type { ReceiptActions } from "../input-receipts.js";
import type { Lifetime, ReceiptLinks, ShowReviews } from "../types.js";

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
  /** An action this page declared, as the person (the files face reads folders and opens files through the platform). */
  invokeAction<Output = unknown>(reference: import("@molis-ai/molis-work-contracts/platform/actions").ActionReference, input: unknown): Promise<Output>;
  addWorkspace(path: string): Promise<{ readonly workspace_id: string }>;
  /** Turns on reading the output's instruction files after the Host's own dialog (`UiPageWorkspaces.readInstructions`); refused when declined. */
  readInstructions(): Promise<void>;
  confirm(question: string): Promise<boolean>;
  /** The platform's drafts and the way to the settings and back (specs/draft-and-return §2.4); main/returns.ts uses them. */
  readonly drafts: UiPageDrafts;
  readonly returns: UiPageReturns;
  /** The directory column's face was chosen; the embedded Git shows its changes under the files face. */
  onDirectoryFace?(face: string): void;
}
