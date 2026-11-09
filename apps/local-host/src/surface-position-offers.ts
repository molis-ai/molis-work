import { AsyncLocalStorage } from "node:async_hooks";
import { randomUUID } from "node:crypto";
import { ActionError, requireSynchronous, type ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import type { SurfaceConsequence } from "@molis-ai/molis-work-contracts/services/surface-composition";
import { isRecord } from "@molis-ai/molis-work-plugin-sdk";
import { surfaceOfferLabel, surfaceOfferOperation, type HeldSurfaceOffer } from "./surface-offer-operation.js";
import type { SurfaceProjectContext } from "./surface-project-read.js";
import { webSurfaceSession } from "./web-sessions.js";

type OfferIntent = { intent: "cancel"; prepared: string } | { intent: "confirm"; prepared: string; choice: string };
export interface PositionOfferSource { current?(): void; beforeWrite?(): void }
export type CaptureOfferSource = (owner: string, subject: ActionSubject) => PositionOfferSource;
export type PositionChoice = { key: string; label: string; consequence: SurfaceConsequence[];
  confirm(context: SurfaceProjectContext, current: () => void, beforeWrite?: () => void): Promise<{ title: string; result: unknown; request_id?: string }> };
type Binding = { choices: readonly PositionChoice[]; source: PositionOfferSource; original(): void };
export const positionSubjectChoices = (offers: readonly HeldSurfaceOffer[]): PositionChoice[] => offers.map(offer => ({
  ...surfaceOfferLabel(offer), confirm: (context, current, beforeWrite) => surfaceOfferOperation(context, current).confirm(offer, beforeWrite),
}));
const expired = () => new ActionError("actions.offer_changed", "原操作已变化，请重新查看");
const opaque = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9-]{36}$/u.test(value);

export function positionOfferIntent(value: unknown): OfferIntent | null {
  if (value === undefined) return null;
  if (isRecord(value) && opaque(value.prepared)) {
    if (value.intent === "cancel" && Object.keys(value).length === 2) return { intent: value.intent, prepared: value.prepared };
    if (value.intent === "confirm" && Object.keys(value).length === 3 && opaque(value.choice)) return { intent: value.intent, prepared: value.prepared, choice: value.choice };
  }
  throw new ActionError("actions.input_invalid", "原操作请求无效");
}

const windows = new WeakMap<AbortSignal, Map<string, OfferWindow>>();
const runOutsideRequest = AsyncLocalStorage.snapshot();
const WINDOW_TTL = 5 * 60 * 1000;
const WINDOWS_PER_SESSION = 4;

export interface OfferWindow {
  readonly scope: string;
  readonly signal: AbortSignal;
  assertCurrent(): void;
  close(): void;
  closeUnlessPrepared(): void;
  prepare(binding: Binding): { prepared: string; choices: Array<Omit<PositionChoice, "confirm">> } | undefined;
  claim(choice: string): (context: SurfaceProjectContext) => Promise<{ title: string; result: unknown }>;
}

export function beginPositionOffer(scope: string): OfferWindow | undefined {
  const session = webSurfaceSession();
  if (!session) return undefined;
  const entries = windows.get(session) ?? new Map<string, OfferWindow>();
  if (entries.size >= WINDOWS_PER_SESSION) return undefined;
  windows.set(session, entries);
  const id = randomUUID(), controller = new AbortController(), expires = Date.now() + WINDOW_TTL;
  const assertCurrent = () => {
    session.throwIfAborted(); controller.signal.throwIfAborted();
    if (Date.now() >= expires) { close(); throw expired(); }
  };
  let binding: Binding | undefined, claimed = false;
  const close = () => {
    entries.delete(id); clearTimeout(timer); session.removeEventListener("abort", close);
    binding = undefined; controller.abort(expired());
  };
  // The expiry timer does not inherit the originating HTTP request's async context.
  const timer = runOutsideRequest(() => setTimeout(close, WINDOW_TTL).unref());
  session.addEventListener("abort", close, { once: true });
  const window: OfferWindow = {
    scope, signal: controller.signal, assertCurrent, close,
    closeUnlessPrepared() { if (!binding || claimed) close(); },
    prepare(value) {
      assertCurrent();
      if (!value.choices.length) return undefined;
      binding = value;
      return { prepared: id, choices: value.choices.map(({ key, label, consequence }) => ({ key, label, consequence })) };
    },
    claim(choice) {
      assertCurrent();
      const original = binding, selected = original?.choices.find(item => item.key === choice);
      if (claimed || !original || !selected) throw expired();
      claimed = true;
      return context => {
        const current = () => {
          assertCurrent(); requireSynchronous(context.transport.assert_authority_current?.());
          original.original(); original.source.current?.();
        };
        current();
        return selected.confirm(context, current, original.source.beforeWrite);
      };
    },
  };
  entries.set(id, window);
  return window;
}

/** Claim synchronously, before opening the project or waiting on a provider; cancel can still abort an executing window. */
export function takePositionOffer(scope: string, intent: OfferIntent) {
  const session = webSurfaceSession(), window = session && windows.get(session)?.get(intent.prepared);
  if (!window || window.scope !== scope) throw expired();
  if (intent.intent === "cancel") { window.close(); return null; }
  return { window, confirm: window.claim(intent.choice) };
}

export async function withPositionOfferWindow<Result>(scope: string, needed: boolean, use: (window: OfferWindow | undefined) => Promise<Result>) {
  const window = needed ? beginPositionOffer(scope) : undefined;
  try { return await use(window); }
  catch (error) { window?.close(); throw error; }
  finally { window?.closeUnlessPrepared(); }
}
