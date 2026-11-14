import { randomUUID } from "node:crypto";
import { ActionError, type ActionSubject } from "@molis-ai/molis-work-contracts/platform/actions";
import type { UiSlotDescriptor } from "@molis-ai/molis-work-contracts/platform/ui";
import type { SurfaceInstallationRef } from "@molis-ai/molis-work-contracts/services/surface-composition";
import type { RenderedSurfaceSlot } from "./surface-slot-http.js";

export interface SurfaceSlotSource {
  readonly contribution_id: string;
  readonly surface: string;
  readonly target_slot_id: string;
  readonly producer: string;
  readonly slots: readonly UiSlotDescriptor[];
  readonly installation: SurfaceInstallationRef;
}

export interface SurfaceSlotRecord {
  readonly id: string;
  readonly pluginId: string;
  readonly source: SurfaceSlotSource;
  readonly slot: UiSlotDescriptor;
  readonly subjects: readonly ActionSubject[];
  readonly signal: AbortSignal;
  assertCurrent(): void;
  read?: AbortController;
  render?: RenderedSurfaceSlot;
}

const denied = () => new ActionError("actions.forbidden", "这个页面没有当前呈现位置");

export function pageSurfaceSlotState() {
  let lastMount = 0;
  const slots = new Map<string, { slot: SurfaceSlotRecord; lifetime: AbortController }>();
  const close = (id: string) => {
    const entry = slots.get(id);
    if (!entry) return;
    slots.delete(id);
    entry.lifetime.abort(denied());
    entry.slot.read?.abort(denied());
    entry.slot.render = undefined;
  };
  return {
    reserve(mount: number, pluginId: string, source: SurfaceSlotSource, slotId: string, subjects: readonly ActionSubject[], current: () => void) {
      current();
      const declared = source.slots.filter(slot => slot.slot_id === slotId && slot.accepts_forms?.length);
      if (mount <= lastMount || slots.size >= 4 || declared.length !== 1) throw denied();
      lastMount = mount;
      const id = randomUUID(), lifetime = new AbortController();
      const slot: SurfaceSlotRecord = { id, pluginId, source, slot: declared[0]!, subjects, signal: lifetime.signal,
        assertCurrent() {
          current(); lifetime.signal.throwIfAborted();
          if (slots.get(id)?.slot !== slot) throw denied();
        } };
      slots.set(id, { slot, lifetime });
      return slot;
    },
    require(id: string) {
      const slot = slots.get(id)?.slot;
      if (!slot) throw denied();
      slot.assertCurrent();
      return slot;
    },
    close,
    dispose() { for (const id of slots.keys()) close(id); },
  };
}
