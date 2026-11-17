/** Trusted shell composition only. The existing task panel remains the sole owner of its floating container. */
export interface TaskFloatContent {
  suspend?(): void;
  resume?(): void;
  destroy(): void;
}
export interface TaskFloatNavigation { back(): void; close(): void }
export interface TaskFloatOpening { prepare?(signal: AbortSignal): Promise<void | { discard: true }>; beforeShow?(signal: AbortSignal): Promise<void>; onClose?(): void }
export type TaskFloatMount<T extends TaskFloatContent = TaskFloatContent> = (root: HTMLElement, navigation: TaskFloatNavigation) => T | Promise<T>;
interface TaskFloatHost {
  open(owner: object, mount: TaskFloatMount, opening?: TaskFloatOpening): Promise<TaskFloatContent>;
  forget(owner: object): void;
  close(owner: object): void;
}
type TaskFloatRequest = { operation: "open"; owner: object; mount: TaskFloatMount; opening?: TaskFloatOpening; resolve(value: TaskFloatContent): void; reject(error: unknown): void }
  | { operation: "close" | "forget"; owner: object };
/** Both programs are independently bundled. The registered event carries trusted shell lifecycle callbacks, never plugin-page authority or task facts. */
export function installTaskFloatContentHost(host: TaskFloatHost): void {
  const receive = (event: Event) => {
    const request = (event as CustomEvent<TaskFloatRequest>).detail;
    event.preventDefault();
    if (request.operation === "open") void host.open(request.owner, request.mount, request.opening).then(request.resolve, request.reject);
    else if (request.operation === "close") host.close(request.owner);
    else host.forget(request.owner);
  };
  document.addEventListener("molis-work:task-float", receive);
  window.addEventListener("pagehide", () => document.removeEventListener("molis-work:task-float", receive), { once: true });
}
export function openTaskFloatContent<T extends TaskFloatContent>(owner: object, mount: TaskFloatMount<T>, opening?: TaskFloatOpening): Promise<T> {
  return new Promise<TaskFloatContent>((resolve, reject) => {
    const event = new CustomEvent<TaskFloatRequest>("molis-work:task-float", { cancelable: true, detail: { operation: "open", owner, mount, opening, resolve, reject } });
    if (document.dispatchEvent(event)) reject(new Error("Task panel unavailable"));
  }) as Promise<T>;
}
export function forgetTaskFloatContent(owner: object): void { document.dispatchEvent(new CustomEvent<TaskFloatRequest>("molis-work:task-float", { cancelable: true, detail: { operation: "forget", owner } })); }
export function closeTaskFloatContent(owner: object): void { document.dispatchEvent(new CustomEvent<TaskFloatRequest>("molis-work:task-float", { cancelable: true, detail: { operation: "close", owner } })); }
