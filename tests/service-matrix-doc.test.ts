import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { homeConnectorDirectory } from "@molis-ai/molis-work-app-local-host";
import { openTestHome } from "./fixtures/test-home.js";

/**
 * The service matrix (specs/assistant-service-connections/service-matrix.md, batch 61 item 1) is a projection of the service directory:
 * every service the directory lists has its row, and the row's uses and skill categories are the ones its declarations give. A service
 * added or a declaration changed without the matrix makes this fail.
 */
const USE_COLUMNS = ["feed_source", "document_import", "assistant_read", "web_search"] as const;

test("ASC-38 ASC-54 BL-917: the service matrix lists every directory service with its declared uses and categories", { timeout: 60_000 }, async t => {
  const fixture = await openTestHome(t);
  const directory = await homeConnectorDirectory(fixture.home);
  const doc = await readFile(new URL("../specs/assistant-service-connections/service-matrix.md", import.meta.url), "utf8");
  const rows = new Map<string, string[]>();
  for (const line of doc.split("\n")) {
    const cells = line.split("|").slice(1, -1).map(cell => cell.trim());
    const id = /^`([a-z0-9-]+)`$/u.exec(cells[1] ?? "")?.[1];
    if (id && cells.length === 11) rows.set(id, cells);
  }
  assert.deepEqual([...rows.keys()].sort(), directory.map(entry => entry.connector_id).sort(), "one row per directory service, none extra");
  for (const entry of directory) {
    const cells = rows.get(entry.connector_id)!;
    const uses = new Set(entry.uses ?? []);
    assert.deepEqual(cells.slice(4, 8), USE_COLUMNS.map(use => uses.has(use) ? "✓" : ""), `${entry.connector_id}: uses`);
    const categories = [...cells[8]!.matchAll(/`([a-z-]+)`/gu)].map(match => match[1]);
    assert.deepEqual(categories, [...(entry.categories ?? [])], `${entry.connector_id}: categories`);
  }
});
