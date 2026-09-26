import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";

/** Host authenticates the channel; Native Goals interprets only the selected product operation. */
export interface GoalsHttpContext {
  method: string | undefined;
  pathname: string;
  search: URLSearchParams;
  readBody(): Promise<Record<string, unknown>>;
  respond(status: number, body: unknown): void;
  options: { boardId: string; routePrefix: string; projectRoot?: string };
  idempotencyHeader: string | string[] | undefined;
  changed(): void;
  actions: BoundActionClient;
}
