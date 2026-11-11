// @vitest-environment node

import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openDatabase } from "../../src/studio/server/db/open-database.js";
import { openStudioDatabase } from "../../src/studio/server/sync/open.js";

const directories: string[] = [];
const directory = () => { const path = mkdtempSync(join(tmpdir(), "alchemist-open-")); directories.push(path); return path; };
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); });

describe.each([["openDatabase", openDatabase], ["openStudioDatabase", openStudioDatabase]] as const)("SQLD-08 %s", (_name, open) => {
  it.each(["project.db", "catalog.db", "search.sqlite", "studio.sqlite.bak", "xstudio.sqlite", "STUDIO.SQLITE"])("refuses %s and creates nothing", name => {
    const path = join(directory(), name);
    expect(() => open(path)).toThrow(expect.objectContaining({ code: "alchemist.sync_scope" }));
    expect(existsSync(path)).toBe(false);
  });
  it("refuses an in-memory library, which is no file of Alchemist's either", () => {
    expect(() => open(":memory:")).toThrow(expect.objectContaining({ code: "alchemist.sync_scope" }));
  });
  it("opens its own file", () => {
    const db = open(join(directory(), "studio.sqlite"));
    expect(db.prepare("SELECT 1 AS one").get()).toEqual({ one: 1 });
    db.close();
  });
});
