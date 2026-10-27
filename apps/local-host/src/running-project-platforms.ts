/**
 * Which project platforms of a Home are running now. It is a leaf on purpose: a Home-wide announcement (`connection-change-events.ts`)
 * reaches the projects through it without importing the module that starts them, and so without pulling the whole project host into
 * everything that changes a connection.
 */

/** What an announcement needs of a running platform: to broadcast a host event to its installations. */
export interface AnnouncedPlatform {
  readonly hostEvents: { broadcast(input: { event_type_id: string; type_version: number; payload: unknown }): number };
}

/** A project platform as it is opened: its Home and project, and the state it settles in (no platform: it failed or was refused). */
export interface OpenedProject {
  readonly ports: { readonly homeDirectory?: string | undefined; readonly projectId: string };
  readonly ready: Promise<{ readonly platform: AnnouncedPlatform | null }>;
}

/** Weak, so the registry keeps no platform alive; `opened` is how a Home-wide event finds the projects that run. */
const opened = new Set<WeakRef<OpenedProject>>();

export function noteProjectOpened(project: OpenedProject): void { opened.add(new WeakRef(project)); }

export function noteProjectReleased(project: OpenedProject): void {
  for (const reference of opened) if (reference.deref() === project) opened.delete(reference);
}

/** The platforms of this Home's projects that are running now, with their project ids. Never starts one; one still opening is waited for. */
export async function runningProjectPlatforms(homeDirectory: string): Promise<{ projectId: string; platform: AnnouncedPlatform }[]> {
  const running: { projectId: string; platform: AnnouncedPlatform }[] = [];
  for (const reference of [...opened]) {
    const project = reference.deref();
    if (!project) { opened.delete(reference); continue; }
    if (project.ports.homeDirectory !== homeDirectory) continue;
    const state = await project.ready.catch(() => null);
    if (state?.platform) running.push({ projectId: project.ports.projectId, platform: state.platform });
  }
  return running;
}
