import type { ImSendInput, ImCreateThreadInput } from '@molis-ai/molis-work-contracts/services/im';
import type { ActionSubject } from '@molis-ai/molis-work-contracts/platform/actions';
export interface ImObjectBridge {
  send<T>(path: string, body: unknown): Promise<T>;
  search(room: string, query: string, signal: AbortSignal): Promise<{ items: Array<ActionSubject & { label: string; owner?: string }> }>;
  update(room: string, stream: HTMLElement, shown: boolean): void;
  clear(): void;
}
declare global { interface Window { molisDiscussionObjects?: ImObjectBridge } }
export type StreamKind = 'group' | 'thread';
export interface ScrollAnchor {
  id?: string;
  offset: number;
  bottom: boolean;
}
export interface MessageDraft extends ImSendInput {
  quote_body?: string;
  quote_author?: string;
}
export type TopicDraft = ImCreateThreadInput & {
  body: string;
};
export interface BrowserStorage {
  read<T>(key: string, fallback: T): T;
  write(key: string, value: unknown): void;
}
export interface ApiError extends Error {
  status?: number;
  code?: string;
  uncertain?: boolean;
  word?: string;
}
export type Api = <T>(path: string, body?: unknown) => Promise<T>;
