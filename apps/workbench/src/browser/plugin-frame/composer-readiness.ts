import type { ComposerHandle } from "@molis-ai/molis-work-plugin-sdk/page-globals";
import type { ComposerDown, ComposerUp } from "./composer-bridge.js";

type Request = Extract<ComposerUp, { type: "composer-ready" }>;
type Answer = Extract<ComposerDown, { type: "composer-ready" }>;

/** A query belongs to one frame mount; selecting another receiver rejects it before a late reply can arrive. */
export function childComposerReadiness(send: (message: Request) => void, id: number, active: () => boolean) {
  let sequence = 0;
  let pending: { call: number; promise: Promise<void>; resolve(): void; reject(error: Error): void } | undefined;
  return {
    request() {
      if (!active()) return Promise.reject(new Error("Input is inactive"));
      if (!pending) {
        let resolve!: () => void, reject!: (error: Error) => void;
        const promise = new Promise<void>((yes, no) => { resolve = yes; reject = no; });
        pending = { call: ++sequence, promise, resolve, reject };
        send({ type: "composer-ready", id, call: pending.call });
      }
      return pending.promise;
    },
    answer(message: Answer) {
      if (pending?.call !== message.call) return;
      const asked = pending; pending = undefined;
      if (message.ready && active()) asked.resolve(); else asked.reject(new Error("Input is not ready"));
    },
    discard() { pending?.reject(new Error("Input is inactive")); pending = undefined; },
  };
}

interface Binding { id: number; handle: ComposerHandle | null; visible: boolean; alive: boolean }
/** The bar answers only for the handle it was asked about. Unbind/drop rejects outstanding queries immediately. */
export function parentComposerReadiness(post: (message: Answer) => void, current: () => Binding) {
  const pending = new Map<number, Binding>();
  return {
    request(message: Request) {
      if (!Number.isSafeInteger(message.call) || message.call <= 0) return;
      const asked = current();
      if (!asked.handle || !asked.visible) { post({ ...message, ready: false }); return; }
      pending.set(message.call, asked);
      const reply = (ready: boolean) => {
        if (pending.get(message.call) !== asked) return;
        pending.delete(message.call);
        const now = current();
        if (now.alive) post({ ...message, ready: ready && now.handle === asked.handle && now.id === asked.id && now.visible });
      };
      void asked.handle.ready().then(() => reply(true), () => reply(false));
    },
    discard() {
      for (const [call, asked] of pending) post({ type: "composer-ready", id: asked.id, call, ready: false });
      pending.clear();
    },
  };
}
