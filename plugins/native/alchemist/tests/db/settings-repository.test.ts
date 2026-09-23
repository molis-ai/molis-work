// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";
import { migrate } from "../../src/studio/server/db/migrate.js";
import { openDatabase, type SqliteDatabase } from "../../src/studio/server/db/open-database.js";
import { SqliteSettingsRepository } from "../../src/studio/server/db/settings-repository.js";
import { seedResearchIdea } from "./helpers/seed-research-idea.js";
import { createTempDatabase, type TempDatabase } from "./helpers/temp-database.js";

let database: SqliteDatabase | undefined;
let temporary: TempDatabase | undefined;

afterEach(() => {
  database?.close();
  temporary?.cleanup();
  database = undefined;
  temporary = undefined;
});

describe("SQLite runtime settings", () => {
  it("stores host model selection and budgets without provider credentials", () => {
    temporary = createTempDatabase();
    database = openDatabase(temporary.path);
    migrate(database);
    seedResearchIdea(database);
    const repository = new SqliteSettingsRepository(database);
    const defaults = repository.ensureDefaults("workspace-local", "2026-07-31T10:00:00.000Z");
    expect(defaults).toMatchObject({
      provider: "none",
      modelId: "",
      defaultBudgets: {
        marketSpace: { kind: "calls", limit: 6 },
        buildCost: { kind: "calls", limit: 4 },
      },
    });

    const updated = repository.update({
      ...defaults,
      provider: "prologue",
      modelId: "configured-model",
      modelPolicy: "fixed",
      updatedAt: "2026-07-31T10:01:00.000Z",
    });
    expect(updated).toMatchObject({ provider: "prologue", modelId: "configured-model" });
    const columns = database
      .prepare("PRAGMA table_info(runtime_settings)")
      .all()
      .map((row) => (row as { name: string }).name);
    expect(columns).not.toContain("api_key");
    expect(columns).not.toContain("secret");
    expect(columns).not.toContain("secret_alias");
    expect(columns).not.toContain("base_url");
    expect(repository.get("workspace-local")).toMatchObject({ provider: "prologue", modelId: "configured-model", modelPolicy: "fixed" });
  });
});
