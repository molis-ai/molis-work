/** The mounted root's lifetime (packages/ui-host client-lifecycle): what the page uses of it. */
export interface Lifetime {
  readonly alive: boolean;
  readonly visible: boolean;
  listen(target: EventTarget, name: string, callback: (event: Event) => void): void;
  whenVisible(start: (signal: AbortSignal) => (() => void) | void): () => void;
  assertCurrent(signal?: AbortSignal): void;
}

/** What the workbench hands Diff's client: the page's root and the shared host fields it uses. */
export interface Host {
  readonly root: Element;
  mountPluginClient(root: Element): Lifetime | null;
  /** A path under this plugin's own routes. */
  pluginRoute(path: string): string;
  /** Opens another plugin's page (a link on the page). */
  openPlugin?(plugin: string): void;
}

/** Minimal fields Diff's page reads from `/state`'s comparison payload. */
export interface StateView {
  readonly phase?: string;
  readonly group?: string | null;
  readonly files?: readonly unknown[];
}

/** The plugin's `/state`: the comparison and its drawn HTML. */
export interface StateAnswer { readonly view: StateView | null; readonly html?: string }
