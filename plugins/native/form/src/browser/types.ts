export type Translate = (text: string, values?: Record<string, string | number>) => string;

/** The shared question card's client, as the workbench binds it (packages/design-system interaction-client). */
export interface FormInteraction {
  /** Every field's current value, sent back as the answer. */
  read(): Record<string, unknown>;
  showErrors(errors: Record<string, string>, options?: { focus?: boolean }): void;
  focusField(fieldId: string): void;
  destroy(): void;
}

/** What the workbench hands a plugin page's client: its translator, the project, its route prefix and the shared card. */
export interface FormClientHost {
  readonly translate: Translate;
  readonly projectId?: string | (() => string);
  readonly route: (path: string) => string;
  readonly interaction?: (card: Element, options: { onSubmit: () => void }) => FormInteraction;
}

/** One request to the Forms routes; `path` follows `/forms`. A failure is an Error with the Host's `code` and `details`. */
export type FormRequest = <T>(method: "GET" | "POST", path: string, body?: Record<string, unknown>) => Promise<T>;

export type FormFailure = Error & { code?: string; details?: unknown };
