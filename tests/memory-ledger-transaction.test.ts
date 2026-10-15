import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { homeSqlitePath, openMemoryLedger } from "@molis-ai/molis-work-storage";

test("W1-18-MEMORY-TX-01: a failed BEGIN leaves the ledger able to roll back and commit", () => {
  const homeDirectory = mkdtempSync(join(tmpdir(), "molis-memory-transaction-"));
  const ledger = openMemoryLedger({ homeDirectory });
  const other = new DatabaseSync(homeSqlitePath(homeDirectory, "memory"));
  let ledgerClosed = false;
  try {
    other.exec("BEGIN IMMEDIATE");
    let workStarted = false;
    try {
      assert.throws(() => ledger.transaction(() => { workStarted = true; }), /database is locked/);
      assert.equal(workStarted, false);
    } finally {
      other.exec("ROLLBACK");
    }

    other.exec(`CREATE TRIGGER reject_second_marker BEFORE INSERT ON memory_markers
      WHEN NEW.key = 'second' BEGIN SELECT RAISE(ABORT, 'second write failed'); END;`);
    assert.throws(() => ledger.transaction(() => {
      ledger.setMarker("actor", "first", { value: "one" }, "2026-10-12T00:00:00Z");
      ledger.setMarker("actor", "second", { value: "two" }, "2026-10-12T00:00:01Z");
    }), /second write failed/);
    assert.equal(ledger.marker("actor", "first"), null);
    assert.equal(ledger.marker("actor", "second"), null);
    assert.equal(other.prepare("SELECT COUNT(*) AS count FROM memory_markers").get()?.count, 0);

    other.exec("DROP TRIGGER reject_second_marker");
    assert.equal(ledger.transaction(() => {
      ledger.setMarker("actor", "first", { value: "one" }, "2026-10-12T00:00:00Z");
      return ledger.transaction(() => {
        ledger.setMarker("actor", "second", { value: "two" }, "2026-10-12T00:00:01Z");
        return "committed";
      });
    }), "committed");
    ledger.close();
    ledgerClosed = true;

    const reopened = openMemoryLedger({ homeDirectory });
    try {
      assert.deepEqual(reopened.marker("actor", "first"), { at: "2026-10-12T00:00:00Z", body: { value: "one" } });
      assert.deepEqual(reopened.marker("actor", "second"), { at: "2026-10-12T00:00:01Z", body: { value: "two" } });
    } finally {
      reopened.close();
    }
  } finally {
    if (!ledgerClosed) ledger.close();
    other.close();
    rmSync(homeDirectory, { recursive: true, force: true });
  }
});
