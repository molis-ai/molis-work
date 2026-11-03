import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { browserErrors } from "./errors.js";
import type { BrowserPage } from "./browser-host.js";
import type { SurfaceElementOutline as ElementOutline, SurfaceOutline } from "./surface-node-types.js";
export { ELEMENT_LIMIT } from "./surface-node-types.js";

type PageSession = Awaited<ReturnType<BrowserPage["session"]>>;
interface Outline extends Omit<SurfaceOutline, "elements"> {
  elements: Array<ElementOutline & { node: string }>;
}
interface Retained {
  session: PageSession; group: string; objectId: string; url: string; takeovers: number; popupDepth: number; nodes: Map<string, number>;
}
interface RemoteValue<T> { result?: { objectId?: string; value?: T }; exceptionDetails?: unknown }

// Built from the type-checked DOM program, following the same bundle/read pattern as the workbench's clients.
const OUTLINE_SCRIPT = readFileSync(new URL("./surface-capture.js", import.meta.url), "utf8").trim();
const READ_OUTLINE = readFileSync(new URL("./surface-read.js", import.meta.url), "utf8").trim();
const RESOLVE_NODE = readFileSync(new URL("./surface-resolve.js", import.meta.url), "utf8").trim();

const unavailable = () => browserErrors.load_failed("先前观察的页面目标已不可用，请重新观察页面后再操作。");

/** One bounded observation owned by this browser driver, shared by approval description and pointer injection. */
export class BrowserSurfaceNodes {
  private retained: Retained | null = null;
  private generation = 0;

  constructor(private readonly page: BrowserPage) {}

  async clear(): Promise<number> {
    const generation = ++this.generation;
    const retained = this.retained;
    this.retained = null;
    if (retained) await retained.session.send("Runtime.releaseObjectGroup", { objectGroup: retained.group }).catch(() => undefined);
    return generation;
  }

  private current(retained: Retained, session: PageSession): boolean {
    const state = this.page.snapshot();
    return retained.session.targetId === session.targetId && retained.url === state.url && retained.takeovers === this.page.takeoverCount && retained.popupDepth === state.popup_depth && !state.loading;
  }

  /** Called after the driver invalidates the preceding observation, including any non-tree look. */
  async observe(generation: number): Promise<Outline> {
    if (generation !== this.generation) throw unavailable();
    const session = await this.page.session();
    const retained: Retained = { session, group: `molis-browser-nodes-${randomUUID()}`, objectId: "", url: this.page.snapshot().url, takeovers: this.page.takeoverCount, popupDepth: this.page.snapshot().popup_depth, nodes: new Map() };
    try {
      const captured = await session.send("Runtime.evaluate", { expression: OUTLINE_SCRIPT, objectGroup: retained.group, returnByValue: false }) as RemoteValue<never>;
      if (captured.exceptionDetails || !captured.result?.objectId) throw unavailable();
      retained.objectId = captured.result.objectId;
      const read = await session.send("Runtime.callFunctionOn", { objectId: retained.objectId, functionDeclaration: READ_OUTLINE, returnByValue: true }) as RemoteValue<Omit<Outline, "elements"> & { elements: ElementOutline[] }>;
      const current = await this.page.session();
      if (read.exceptionDetails || !read.result?.value || generation !== this.generation || !this.current(retained, current)) throw unavailable();
      const outline = read.result.value;
      const elements = outline.elements.map((element, index) => {
        const node = `node_${randomUUID().replaceAll("-", "")}`;
        retained.nodes.set(node, index);
        return { ...element, node };
      });
      this.retained = retained;
      return { ...outline, elements };
    } catch (error) {
      await session.send("Runtime.releaseObjectGroup", { objectGroup: retained.group }).catch(() => undefined);
      throw error;
    }
  }

  async resolve(node: string): Promise<{ x: number; y: number; label: string; session: PageSession; assertCurrent(): void; release(): Promise<void> }> {
    const retained = this.retained, index = retained?.nodes.get(node), generation = this.generation;
    if (!retained || index === undefined) throw unavailable();
    let documentId: string | undefined;
    try {
      const session = await this.page.session();
      if (retained !== this.retained || !this.current(retained, session)) throw unavailable();
      const document = await session.send("Runtime.evaluate", { expression: "document", objectGroup: retained.group, returnByValue: false }) as RemoteValue<never>;
      if (document.exceptionDetails || !document.result?.objectId) throw unavailable();
      documentId = document.result.objectId;
      const assertCurrent = () => {
        if (retained !== this.retained || generation !== this.generation || !this.current(retained, session)) throw unavailable();
      };
      assertCurrent();
      // This is the final awaited check before the caller dispatches input. The temporary document handle is released
      // after that input, so neither cleanup nor another asynchronous identity read can stale the checked point.
      const resolved = await session.send("Runtime.callFunctionOn", { objectId: retained.objectId, functionDeclaration: RESOLVE_NODE,
        arguments: [{ value: index }, { objectId: documentId }], returnByValue: true }) as RemoteValue<{ x: number; y: number; label: string } | null>;
      assertCurrent();
      if (resolved.exceptionDetails || !resolved.result?.value) throw unavailable();
      return { ...resolved.result.value, session: retained.session, assertCurrent,
        async release() { await session.send("Runtime.releaseObject", { objectId: documentId }).catch(() => undefined); } };
    } catch {
      if (documentId) await retained.session.send("Runtime.releaseObject", { objectId: documentId }).catch(() => undefined);
      throw unavailable();
    }
  }
}
