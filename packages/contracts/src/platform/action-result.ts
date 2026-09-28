/** Provider-owned presentation of a successful return, separate from the business output contract. */
export interface ActionResultView {
  readonly summary: string;
  /** JSON Pointers into the original output. Only scalar values become visible text. */
  readonly title_pointer?: string;
  readonly text_pointer?: string;
  /** A same-origin product destination. Placeholders are {project_id} or {/output/pointer}. */
  readonly link?: { readonly label: string; readonly href_template: string };
}

/** A bounded snapshot saved with the original execution, never regenerated from a newer provider. */
export interface ActionResultPresentation {
  readonly summary: string;
  readonly title?: string;
  readonly text?: string;
  readonly text_truncated?: true;
  readonly link?: { readonly label: string; readonly href: string };
}

const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const shortText = (value: unknown, limit: number): value is string => typeof value === "string" && !!value.trim() && value.length <= limit;
const pointer = (value: unknown): value is string => typeof value === "string" && value.length <= 500 && (value === "" || value.startsWith("/")) && !/~(?![01])/u.test(value);
const internal = (value: string): boolean => /^\/(?!\/)/u.test(value) && !/[\\\u0000-\u0020\u007f]/u.test(value);

export function validActionResultView(value: unknown): value is ActionResultView {
  if (!object(value) || !shortText(value.summary, 240)
    || (value.title_pointer !== undefined && !pointer(value.title_pointer))
    || (value.text_pointer !== undefined && !pointer(value.text_pointer))) return false;
  if (value.link === undefined) return true;
  if (!object(value.link) || !shortText(value.link.label, 80) || !shortText(value.link.href_template, 2000) || !internal(value.link.href_template)) return false;
  const tokens = [...value.link.href_template.matchAll(/\{([^{}]+)\}/gu)];
  return tokens.every(([, token]) => token === "project_id" || pointer(token))
    && !/[{}]/u.test(value.link.href_template.replace(/\{([^{}]+)\}/gu, "value"));
}

function scalarAt(result: unknown, path: string): string | undefined {
  let value = result;
  for (const part of path === "" ? [] : path.slice(1).split("/")) {
    const key = part.replace(/~1/gu, "/").replace(/~0/gu, "~");
    if (value === null || typeof value !== "object" || !Object.hasOwn(value, key)) return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return typeof value === "string" || typeof value === "boolean" || (typeof value === "number" && Number.isFinite(value)) ? String(value) : undefined;
}

/** Rendering cannot fail an already completed business call or expose unselected output fields. */
export function presentActionResult(view: ActionResultView | undefined, result: unknown, projectId?: string): ActionResultPresentation | undefined {
  if (!view) return undefined;
  const title = view.title_pointer === undefined ? undefined : scalarAt(result, view.title_pointer);
  const text = view.text_pointer === undefined ? undefined : scalarAt(result, view.text_pointer);
  let link: ActionResultPresentation["link"];
  if (view.link) {
    let complete = true;
    const href = view.link.href_template.replace(/\{([^{}]+)\}/gu, (_match, token: string) => {
      const value = token === "project_id" ? projectId : scalarAt(result, token);
      if (!value || value === "." || value === "..") { complete = false; return ""; }
      // A malformed surrogate in provider text must not invalidate its successful operation.
      try { return encodeURIComponent(value); } catch { complete = false; return ""; }
    });
    if (complete && href.length <= 4000 && internal(href)) link = { label: view.link.label, href };
  }
  return { summary: view.summary, ...(title ? { title: title.slice(0, 300) } : {}),
    ...(text ? { text: text.slice(0, 4000), ...(text.length > 4000 ? { text_truncated: true as const } : {}) } : {}), ...(link ? { link } : {}) };
}
