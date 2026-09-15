import assert from "node:assert/strict";
import test from "node:test";

import Database from "better-sqlite3";
import {
  artifactContentDigest,
  ArtifactsError,
  ArtifactsModule,
  canonicalArtifactJson,
  createArtifactsSchema,
  migrateArtifactsSchema,
  type ArtifactEventInput,
  type ArtifactsSqliteDatabase,
} from "@molis-ai/molis-work-module-artifacts";
import type {
  ArtifactJsonValue,
  RegisterArtifactVersionInput,
} from "@molis-ai/molis-work-contracts/modules/artifacts";

function createHarness() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE boards (
      board_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      active_goal_id TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT NOT NULL UNIQUE,
      board_id TEXT NOT NULL REFERENCES boards(board_id) ON DELETE CASCADE,
      actor_id TEXT NOT NULL,
      type TEXT NOT NULL,
      object_type TEXT NOT NULL,
      object_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      at TEXT NOT NULL
    );
  `);
  db.prepare(`
    INSERT INTO boards (board_id, title, active_goal_id, created_at, updated_at)
    VALUES ('board-artifacts', 'Artifacts', NULL, '2026-09-02T00:00:00.000Z', '2026-09-02T00:00:00.000Z')
  `).run();
  createArtifactsSchema(db as unknown as ArtifactsSqliteDatabase);
  let tick = 0;
  const module = new ArtifactsModule({
    db: db as unknown as ArtifactsSqliteDatabase,
    now: () => `2026-09-02T00:00:${String(tick++).padStart(2, "0")}.000Z`,
    appendEvent: (event: ArtifactEventInput) => Number(db.prepare(`
      INSERT INTO events (
        event_id, board_id, actor_id, type, object_type, object_id, reason, payload_json, at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      event.eventId,
      event.boardId,
      event.actorId,
      event.type,
      event.objectType,
      event.objectId,
      event.reason,
      JSON.stringify(event.payload),
      event.at,
    ).lastInsertRowid),
  });
  return { db, module };
}

function registration(
  overrides: Partial<RegisterArtifactVersionInput> = {},
): RegisterArtifactVersionInput {
  return {
    board_id: "board-artifacts",
    artifact_id: "artifact-report",
    version: 1,
    actor_id: "user-a",
    artifact_type_id: "io.example.report",
    schema_version: 1,
    producer: {
      plugin_id: "io.example.writer",
      plugin_version: "1.0.0",
      binding_signature: "publisher-signature-a",
    },
    content: {
      kind: "inline",
      payload: {
        title: "Sprint report",
        custom: { score: 7, sections: ["summary", "risks"] },
      },
    },
    metadata: { source: "plugin-private-shape" },
    ...overrides,
  };
}

function expectCode(operation: () => unknown, code: string): void {
  assert.throws(operation, (error: unknown) =>
    error instanceof ArtifactsError && error.code === code);
}

test("Artifacts Module owns exact id + version, opaque content, scope and producer binding", () => {
  const { db, module } = createHarness();
  try {
    const payload = (registration().content as { kind: "inline"; payload: ArtifactJsonValue }).payload;
    const expectedDigest = artifactContentDigest(canonicalArtifactJson(payload));
    const firstInput = registration({ expected_digest: expectedDigest });
    const first = module.commands.registerVersion(firstInput);
    assert.equal(first.replayed, false);
    assert.equal(first.artifact.scope, "personal");
    assert.equal(first.artifact.content_digest, expectedDigest);
    assert.deepEqual(first.artifact.payload, payload);
    assert.deepEqual(first.artifact.metadata, { source: "plugin-private-shape" });

    const replayed = module.commands.registerVersion(firstInput);
    assert.equal(replayed.replayed, true);
    assert.equal(replayed.artifact.created_at, first.artifact.created_at);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM artifact_versions").get().count, 1);

    expectCode(
      () => module.commands.registerVersion(registration({
        content: { kind: "inline", payload: { title: "conflicting overwrite" } },
      })),
      "artifact.version_conflict",
    );
    expectCode(
      () => module.commands.registerVersion(registration({
        artifact_id: "artifact-bad-hash",
        expected_digest: `sha256:${"0".repeat(64)}`,
      })),
      "artifact.hash_mismatch",
    );

    expectCode(
      () => module.commands.registerVersion(registration({
        version: 3,
        scope: "team_project",
        supersedes_version: 1,
      })),
      "artifact.team_share_not_authorized",
    );
    const thirdInput = registration({
      version: 3,
      producer: {
        plugin_id: "io.example.writer",
        plugin_version: "2.0.0",
        binding_signature: "publisher-signature-a",
      },
      content: { kind: "inline", payload: { result: { score: 9 }, extension: [1, 2, 3] } },
      scope: "team_project",
      team_share_authorized: true,
      supersedes_version: 1,
    });
    const third = module.commands.registerVersion(thirdInput);
    assert.equal(third.artifact.version, 3);
    assert.equal(third.artifact.producer_plugin_version, "2.0.0");
    assert.equal(third.artifact.scope, "team_project");
    assert.equal(third.artifact.supersedes_version, 1);
    assert.deepEqual(module.query.listArtifactVersions("board-artifacts", "artifact-report")
      .map((item) => item.version), [1, 3]);

    expectCode(
      () => module.commands.registerVersion(registration({ version: 2 })),
      "artifact.version_not_increasing",
    );
    expectCode(
      () => module.commands.registerVersion(registration({
        version: 4,
        actor_id: "user-b",
      })),
      "artifact.not_owner",
    );
    expectCode(
      () => module.commands.registerVersion(registration({
        version: 4,
        producer: {
          plugin_id: "io.example.writer",
          plugin_version: "3.0.0",
          binding_signature: "different-binding-signature",
        },
      })),
      "artifact.producer_mismatch",
    );

    assert.deepEqual(
      module.query.consumptionCompatibility("board-artifacts", { artifact_id: "artifact-report", version: 3 }, []),
      {
        artifact: { artifact_id: "artifact-report", version: 3 },
        consumable: false,
        reason: "consumer_missing",
      },
    );
    assert.equal(module.query.consumptionCompatibility(
      "board-artifacts",
      { artifact_id: "artifact-report", version: 3 },
      [{ artifact_type_id: "io.example.report", schema_version: 1 }],
    ).consumable, true);

    expectCode(
      () => module.commands.markUnavailable({
        board_id: "board-artifacts",
        artifact_id: "artifact-report",
        version: 3,
        actor_id: "user-b",
        reason: "blob missing",
      }),
      "artifact.not_owner",
    );
    const unavailable = module.commands.markUnavailable({
      board_id: "board-artifacts",
      artifact_id: "artifact-report",
      version: 3,
      actor_id: "user-a",
      reason: "Blob adapter confirmed the object is missing",
    });
    assert.equal(unavailable.artifact.availability, "unavailable");
    assert.equal(module.query.consumptionCompatibility(
      "board-artifacts",
      { artifact_id: "artifact-report", version: 3 },
      [{ artifact_type_id: "io.example.report", schema_version: 1 }],
    ).reason, "artifact_unavailable");
    const replayAfterAvailabilityChange = module.commands.registerVersion(thirdInput);
    assert.equal(replayAfterAvailabilityChange.replayed, true);
    assert.equal(replayAfterAvailabilityChange.artifact.availability, "unavailable");

    const archived = module.commands.archiveVersion({
      board_id: "board-artifacts",
      artifact_id: "artifact-report",
      version: 1,
      actor_id: "user-a",
    });
    assert.equal(archived.artifact.lifecycle_state, "archived");
    assert.equal(module.query.consumptionCompatibility(
      "board-artifacts",
      { artifact_id: "artifact-report", version: 1 },
      [{ artifact_type_id: "io.example.report", schema_version: 1 }],
    ).reason, "artifact_archived");
  } finally {
    db.close();
  }
});

test("Artifact reference digest mismatch and schema migration are rollback-safe and idempotent", () => {
  const { db, module } = createHarness();
  try {
    expectCode(
      () => module.commands.registerVersion(registration({
        artifact_id: "artifact-blob",
        content: {
          kind: "reference",
          content_ref: "blob://sha256/report",
          digest: `sha256:${"1".repeat(64)}`,
          observed_digest: `sha256:${"2".repeat(64)}`,
          size_bytes: 4096,
        },
      })),
      "artifact.hash_mismatch",
    );
    assert.equal(module.query.listArtifactVersions("board-artifacts", "artifact-blob").length, 0);
  } finally {
    db.close();
  }

  const migrationDb = new Database(":memory:");
  try {
    migrationDb.exec(`
      CREATE TABLE schema_migrations (migration_id INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE boards (
        board_id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        active_goal_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    migrateArtifactsSchema(migrationDb as unknown as ArtifactsSqliteDatabase);
    migrateArtifactsSchema(migrationDb as unknown as ArtifactsSqliteDatabase);
    const tables = migrationDb.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name IN ('artifacts', 'artifact_versions')
      ORDER BY name
    `).all().map((row) => row.name);
    assert.deepEqual(tables, ["artifact_versions", "artifacts"]);
    assert.equal(
      migrationDb.prepare("SELECT COUNT(*) AS count FROM schema_migrations WHERE migration_id = 31").get().count,
      1,
    );
  } finally {
    migrationDb.close();
  }
});
