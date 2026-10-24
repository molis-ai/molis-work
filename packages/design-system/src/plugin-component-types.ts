/// <reference lib="dom" />
/// <reference lib="dom.iterable" />
import type { SandboxSchema } from '@molis-ai/molis-work-contracts/platform/plugin-sandbox';
import type { PluginComponentNode } from './plugin-components.js';
import type { createPluginPresentationClient } from './plugin-presentation-client.js';
import type { PluginComponentClientOptions, PluginComponentView } from './plugin-component-client.js';
import type { pcKit } from './plugin-component-kit.js';
import type { pcRelations, pcRecords } from './plugin-component-records.js';
import type { pcDetail, pcControls } from './plugin-component-controls.js';
import type { pcOutput, pcQuery } from './plugin-component-output.js';
import type { pcSubmit, pcPart } from './plugin-component-part.js';

export type { SandboxSchema };
export interface Part { node: PluginComponentNode; root: HTMLElement; output: HTMLElement; feedback: HTMLElement; form?: HTMLFormElement; dialog?: HTMLDialogElement; opener?: HTMLButtonElement; confirm?: HTMLDialogElement; filter?: HTMLElement; tools?: HTMLElement; waiting?: ReturnType<typeof setTimeout>; feedbackTimer?: ReturnType<typeof setTimeout>; busy: boolean; query: number; draft: number; signature: string; prefilled: Map<string, number>; rows?: unknown[]; seen?: Set<string> }
export type Column = { field: string; label: string; values?: Record<string, string> };
export interface DetailView { layout: HTMLElement; pane: HTMLElement; back: HTMLButtonElement; content?: string; scroll?: Array<[Element, number]> }

/**
 * One client's state. The renderer is built in layers, each one a function of this object plus what the earlier layers
 * added to it; the mutable scalars live here so every layer reads the current value.
 */
export interface State {
  options: PluginComponentClientOptions; root: HTMLElement; composition: ReturnType<typeof createPluginPresentationClient>; tabs: HTMLElement; tabList: HTMLElement;
  view: PluginComponentView | undefined; currentPage: string; selection: Record<string, unknown>; disposed: boolean; epoch: number; fresh: boolean;
  selectionVersions: Map<string, number>; parts: Map<string, Part>; pages: Map<string, HTMLElement>; regions: Map<string, HTMLElement>; details: Map<string, DetailView>;
  /** Replaced by the query layer; the layers built before it call it only when something happens. */
  refresh: () => Promise<unknown>;
}
export type Kit = ReturnType<typeof pcKit>;
export type Rel = ReturnType<typeof pcRelations>;
export type Rec = ReturnType<typeof pcRecords>;
export type Det = ReturnType<typeof pcDetail>;
export type Ctl = ReturnType<typeof pcControls>;
export type Out = ReturnType<typeof pcOutput>;
export type Qry = ReturnType<typeof pcQuery>;
export type Sub = ReturnType<typeof pcSubmit>;
export type Prt = ReturnType<typeof pcPart>;
