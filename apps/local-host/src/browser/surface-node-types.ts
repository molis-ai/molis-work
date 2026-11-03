/** The serialized outline shared by the Node owner and its DOM program, without either environment's APIs. */
export const ELEMENT_LIMIT = 300;
export const TEXT_BUDGET = 6_000;
export interface SurfaceElementOutline {
  role: string; name: string; value: string; states: string[]; x: number; y: number; href: string;
}
export interface SurfaceOutline {
  path: string; title: string; vw: number; vh: number; sy: number; max: number;
  elements: SurfaceElementOutline[]; text: string[];
}
