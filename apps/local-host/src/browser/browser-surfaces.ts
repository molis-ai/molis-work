import fs from "node:fs";
import path from "node:path";
import type { HostSurfaceDriver } from "@molis-ai/molis-work-contracts/services/ui-surfaces";

/**
 * What the Agent Host may attach from the side panel's browser (specs/archive/side-panel P5): one driver per project page,
 * found by the board a round works on, and the person's standing decisions about sites. Registered by the web server
 * that owns the browser; a process without one (MCP, CLI) offers no browser to any round.
 */
export interface SurfaceSiteDecision { readonly scope: string; readonly decision: "allow" | "block"; readonly at: string }

export interface BrowserSurfaceProvider {
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
export class BrowserSiteDecisions {
  private readonly file: string;
  private rows: SurfaceSiteDecision[];
  /** Whether the Assistant may use the side panel browser at all (on unless the person turned it off). */
  private assistant: boolean;

  constructor(homeDirectory: string) {
    this.file = path.join(homeDirectory, "browser", "sites.json");
    const saved = this.read();
    this.rows = saved.sites;
    this.assistant = saved.assistant;
  }

  get assistantEnabled(): boolean { return this.assistant; }

  setAssistantEnabled(enabled: boolean): void { this.assistant = enabled; this.save(); }

  list(): readonly SurfaceSiteDecision[] { return this.rows; }

  blocked(scope: string): boolean { return this.rows.some(row => row.scope === scope && row.decision === "block"); }

  set(scope: string, decision: "allow" | "block" | "forget"): readonly SurfaceSiteDecision[] {
    if (!/^https?:\/\/[^/?#\s]+$/u.test(scope)) throw new Error("网站必须写成 https://example.com 这样的来源，不带路径");
    this.rows = this.rows.filter(row => row.scope !== scope);
    if (decision !== "forget") this.rows.push({ scope, decision, at: new Date().toISOString() });
    this.save();
    return this.rows;
  }

  private save(): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const temp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify({ version: 1, assistant: this.assistant, sites: this.rows }, null, 2), { mode: 0o600 });
    fs.renameSync(temp, this.file);
  }

  private read(): { sites: SurfaceSiteDecision[]; assistant: boolean } {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8")) as { sites?: unknown; assistant?: unknown };
      const sites = Array.isArray(parsed.sites) ? parsed.sites.filter((row): row is SurfaceSiteDecision => !!row && typeof row === "object"
        && typeof (row as SurfaceSiteDecision).scope === "string" && ["allow", "block"].includes((row as SurfaceSiteDecision).decision)) : [];
      return { sites, assistant: parsed.assistant !== false };
    } catch { return { sites: [], assistant: true }; }
  }
}
