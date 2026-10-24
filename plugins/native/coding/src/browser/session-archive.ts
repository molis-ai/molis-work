import type { UiPageDialogs } from "@molis-ai/molis-work-contracts/platform/ui";

/** A page keeps the person's confirmed request until it succeeds; reopening obtains the Host's durable decision. */
export function codingArchive(ports: {
  readonly api: (path: string, method?: string, body?: unknown) => Promise<{ archive_decision?: unknown }>;
  readonly path: (id: string) => string;
  readonly confirm: UiPageDialogs["confirm"];
  readonly current: (id: string) => boolean;
  readonly assertCurrent: () => void;
  readonly question: string;
  readonly archived: (id: string) => Promise<void>;
  readonly failed: (message: string) => void;
}) {
  const requests = new Map<string, { archive: true; archive_decision: unknown }>();
  return async (id: string, button: HTMLButtonElement): Promise<void> => {
    button.disabled = true;
    try {
      let request = requests.get(id);
      if (!request) {
        const preview = await ports.api(ports.path(id) + "/archive-preview");
        if (!ports.current(id) || !await ports.confirm(ports.question)) return;
        ports.assertCurrent();
        request = { archive: true, archive_decision: preview.archive_decision };
        requests.set(id, request);
      }
      await ports.api(ports.path(id), "PATCH", request);
      requests.delete(id);
      await ports.archived(id);
    } catch (error) { ports.failed(error instanceof Error ? error.message : String(error)); }
    finally { button.disabled = false; }
  };
}
