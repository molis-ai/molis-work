import fs from "node:fs";
import path from "node:path";
import type { HostSurfaceDriver } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import { assertVersionedFileWritable, readVersionedFile, sqliteStoreLabel, type VersionedFile, type VersionedFileStep } from "@molis-ai/molis-work-storage";
import { hostLog } from "../host-log.js";

/**
 * What the Agent Host may attach from the side panel's browser (specs/archive/side-panel P5): one driver per project page,
 * found by the board a round works on, and the person's standing decisions about sites. Registered by the web server
 * that owns the browser; a process without one (MCP, CLI) offers no browser to any round.
 */
interface SurfaceSiteDecision { readonly scope: string; readonly decision: "allow" | "block"; readonly at: string }

interface BrowserSurfaceProvider {
  driverFor(projectId: string): Promise<HostSurfaceDriver | null>;
  siteDecisions(): readonly SurfaceSiteDecision[];
}

const providers = new WeakMap<object, BrowserSurfaceProvider>();

export function registerBrowserSurfaces(owner: object, provider: BrowserSurfaceProvider): () => void {
  providers.set(owner, provider);
  return () => { if (providers.get(owner) === provider) providers.delete(owner); };
}

export function browserSurfacesFor(owner: object): BrowserSurfaceProvider | undefined {
  return providers.get(owner);
}

/** Sites the person allowed without asking, or blocked outright; kept per Home beside the browser's own profile. */
const BROWSER_SITES_VERSION = /* @version format.browser.site-decisions */ 1;
const BROWSER_SITES_UPGRADES: readonly VersionedFileStep[] = [];

function parseBrowserSites(value: unknown): { sites: SurfaceSiteDecision[]; assistant: boolean } {
  const parsed = value as { sites?: unknown; assistant?: unknown };
  const sites = Array.isArray(parsed.sites) ? parsed.sites.filter((row): row is SurfaceSiteDecision => !!row && typeof row === "object"
    && typeof (row as SurfaceSiteDecision).scope === "string" && ["allow", "block"].includes((row as SurfaceSiteDecision).decision)) : [];
  return { sites, assistant: parsed.assistant !== false };
}

export const BROWSER_SITES_FILE: VersionedFile<{ sites: SurfaceSiteDecision[]; assistant: boolean }> =
  { version: BROWSER_SITES_VERSION, field: "version", upgrades: BROWSER_SITES_UPGRADES, parse: parseBrowserSites };

export class BrowserSiteDecisions {
  private readonly homeDirectory: string;
  private readonly file: string;
  private rows: SurfaceSiteDecision[];
  /** Whether the Assistant may use the side panel browser at all (on unless the person turned it off, or fail-closed on unreadable/too-new files). */
  private assistant: boolean;
  /** True when the sites file exists but could not be trusted (`too_new`, `upgrade_pending`, or `unreadable`): fail-closed blocks all sites and disables Assistant browser access. */
  private failClosed: boolean;

  constructor(homeDirectory: string) {
    this.homeDirectory = homeDirectory;
    this.file = path.join(homeDirectory, "browser", "sites.json");
    const saved = this.read();
    this.rows = saved.sites;
    this.assistant = saved.assistant;
    this.failClosed = saved.failClosed;
  }

  get assistantEnabled(): boolean { return this.assistant; }

  setAssistantEnabled(enabled: boolean): void {
    this.save(this.rows, enabled);
    this.assistant = enabled;
  }

  list(): readonly SurfaceSiteDecision[] { return this.rows; }

  blocked(scope: string): boolean {
    if (this.failClosed) return true;
    return this.rows.some(row => row.scope === scope && row.decision === "block");
  }

  set(scope: string, decision: "allow" | "block" | "forget"): readonly SurfaceSiteDecision[] {
    if (!/^https?:\/\/[^/?#\s]+$/u.test(scope)) throw new Error("网站必须写成 https://example.com 这样的来源，不带路径");
    const rows = this.rows.filter(row => row.scope !== scope);
    if (decision !== "forget") rows.push({ scope, decision, at: new Date().toISOString() });
    this.save(rows, this.assistant);
    this.rows = rows;
    return this.rows;
  }

  /** The decisions in memory change only once they are on disk: a refused save (§2.6) leaves the browser deciding as it did before. */
  private save(sites: readonly SurfaceSiteDecision[], assistant: boolean): void {
    assertVersionedFileWritable(BROWSER_SITES_FILE, this.file, this.homeDirectory);
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const temp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify({ version: BROWSER_SITES_VERSION, assistant, sites }, null, 2), { mode: 0o600 });
    fs.renameSync(temp, this.file);
    this.failClosed = false;
  }

  /** Absent file uses the default. Too-new, unupgraded, or unreadable files fail closed (all sites blocked, Assistant disabled) while leaving the file untouched. */
  private read(): { sites: SurfaceSiteDecision[]; assistant: boolean; failClosed: boolean } {
    const seen = readVersionedFile(BROWSER_SITES_FILE, this.file, this.homeDirectory);
    if (seen.status === "current") return { ...seen.value, failClosed: false };
    if (seen.status === "absent") return { sites: [], assistant: true, failClosed: false };
    hostLog.warn("host", "versioned_file_not_used", undefined, { file: sqliteStoreLabel(this.file, this.homeDirectory), status: seen.status });
    return { sites: [], assistant: false, failClosed: true };
  }
}
