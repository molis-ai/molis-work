import fs from "node:fs";
import path from "node:path";

/**
 * The person's settings for the Assistant's use of this Mac (specs/computer-use goal §3–4), kept per Home:
 *
 * - `enabled`: the master switch, **off by default** — it needs system permissions and affects the whole computer,
 *   unlike the side panel's browser.
 * - `forbidden`: apps the person added to the forbidden tier. Built-in forbidden apps are not stored here and cannot be
 *   taken away; this list only ever makes more apps forbidden.
 */
export interface ComputerForbiddenApp { readonly bundle_id: string; readonly name: string; readonly at: string }

interface Saved { readonly enabled: boolean; readonly forbidden: readonly ComputerForbiddenApp[] }

export class ComputerSettings {
  private readonly file: string;
  private saved: Saved;

  constructor(homeDirectory: string) {
    this.file = path.join(homeDirectory, "computer", "settings.json");
    this.saved = this.read();
  }

  get enabled(): boolean { return this.saved.enabled; }

  forbidden(): readonly ComputerForbiddenApp[] { return this.saved.forbidden; }

  forbiddenIds(): readonly string[] { return this.saved.forbidden.map(app => app.bundle_id); }

  setEnabled(enabled: boolean): void { this.write({ ...this.saved, enabled }); }

  forbid(app: { readonly bundle_id: string; readonly name: string }): readonly ComputerForbiddenApp[] {
    if (!/^[A-Za-z0-9][A-Za-z0-9.-]{0,199}$/u.test(app.bundle_id)) throw new Error("应用标识不对");
    const rest = this.saved.forbidden.filter(one => one.bundle_id !== app.bundle_id);
    this.write({ ...this.saved, forbidden: [...rest, { bundle_id: app.bundle_id, name: app.name.slice(0, 120), at: new Date().toISOString() }] });
    return this.saved.forbidden;
  }

  /** Takes back an app the person added; built-in forbidden apps are never in this list, so they stay forbidden. */
  allow(bundleId: string): readonly ComputerForbiddenApp[] {
    this.write({ ...this.saved, forbidden: this.saved.forbidden.filter(one => one.bundle_id !== bundleId) });
    return this.saved.forbidden;
  }

  private write(next: Saved): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
    const temp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify({ version: 1, ...next }, null, 2), { mode: 0o600 });
    fs.renameSync(temp, this.file);
    this.saved = next;
  }

  private read(): Saved {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.file, "utf8")) as { enabled?: unknown; forbidden?: unknown };
      const forbidden = Array.isArray(parsed.forbidden) ? parsed.forbidden.filter((row): row is ComputerForbiddenApp => !!row && typeof row === "object"
        && typeof (row as ComputerForbiddenApp).bundle_id === "string" && typeof (row as ComputerForbiddenApp).name === "string") : [];
      // Only an explicit true turns it on: a missing or damaged file leaves the Assistant off the computer.
      return { enabled: parsed.enabled === true, forbidden };
    } catch { return { enabled: false, forbidden: [] }; }
  }
}
