import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import type {
  ArtifactReference,
  ArtifactVersionRecord,
} from "@molis-ai/molis-work-contracts/modules/artifacts";
import type {
  PluginAppContribution,
  PluginDefinition,
  PluginEventRecord,
  PluginManifest,
  PluginUpstreamReadyInputs,
} from "@molis-ai/molis-work-contracts/platform/plugin";
import type { UiContribution } from "@molis-ai/molis-work-contracts/platform/ui";
import {
  PluginEventBus,
  PluginInputGraph,
  PluginRuntime,
  PluginSupervisor,
  SqlitePluginEventsRepository,
  SqlitePluginWiringRepository,
} from "@molis-ai/molis-work-plugin-runtime";

const BOARD = "board-durable";
const PROJECTS = "io.molis.work.projects";
const CODING = "io.molis.work.coding";
const PROJECT_TYPE = "projects.project";
const CHANGED = `${CODING}.file-changed`;

function view(pluginId: string): UiContribution {
  return {
    descriptor: {
      contribution_id: `${pluginId}.main`,
      plugin_id: pluginId,
      kind: "primary-page",
      label: "main",
      slots: [],
    },
    render: () => "<section></section>",
  };
}

function baseManifest(pluginId: string): PluginManifest {
  return {
    schema_version: 2,
    host_api_version: 2,
    plugin_id: pluginId,
    version: "1.0.0",
    name: pluginId,
    kind: "app",
    publisher: { publisher_id: "molis", signature: `${pluginId}-binding` },
    entrypoints: [{ deployment: "local", entrypoint: "./entry.mjs" }],
    permissions: [],
    capabilities: { provides: [], consumes: [] },
    artifacts: { produces: [], consumes: [] },
    ui: {
      contributions: [`${pluginId}.main`],
      views: [{ view_id: "main", slot: "stage", title: "Main" }],
    },
  };
}

function artifactRecord(reference: ArtifactReference): ArtifactVersionRecord {
  return {
    ...reference,
    board_id: BOARD,
    artifact_type_id: PROJECT_TYPE,
    schema_version: 1,
    producer_plugin_id: PROJECTS,
    producer_plugin_version: "1.0.0",
    producer_binding_signature: "sig",
    owner_actor_id: "actor",
    content_kind: "inline",
    payload: null,
    content_ref: null,
    content_digest: "digest",
    size_bytes: 1,
    metadata: {},
    scope: "personal",
    availability: "available",
    unavailable_reason: null,
    lifecycle_state: "active",
    supersedes_version: null,
    created_by: "actor",
    created_at: "2026-09-19T00:00:00.000Z",
    archived_at: null,
    archived_by: null,
  };
}

/** Build a host process over the same database file, as a restart would. */
function process(file: string, options: {
  codingStarts: boolean;
  onEvent?: (event: PluginEventRecord) => void;
  onReady?: (inputs: PluginUpstreamReadyInputs) => void;
}) {
  const db = new Database(file);
  const runtime = new PluginRuntime();
  const supervisor = new PluginSupervisor(runtime);
  const bus = new PluginEventBus({
    boardId: BOARD,
    lifecycle: supervisor,
    repository: new SqlitePluginEventsRepository(db),
  });
  const graph = new PluginInputGraph({
    boardId: BOARD,
    lifecycle: supervisor,
    repository: new SqlitePluginWiringRepository(db),
    artifacts: { read: (reference) => artifactRecord(reference) },
  });

  const projects: PluginDefinition = {
    manifest: {
      ...baseManifest(PROJECTS),
      ports: {
        inputs: [],
        outputs: [{ port: "project", artifact_type_id: PROJECT_TYPE, schema_version: 1 }],
      },
      events: {
        publishes: [{ event_type_id: `${PROJECTS}.switched`, type_version: 1 }],
        subscribes: [],
      },
    },
    event_types: [{
      event_type_id: `${PROJECTS}.switched`,
      type_version: 1,
      validate: (payload) => payload,
    }],
    async start() {
      return { kind: "app", views: [view(PROJECTS)] } satisfies PluginAppContribution;
    },
    async stop() {},
  };

  const coding: PluginDefinition = {
    manifest: {
      ...baseManifest(CODING),
      ports: {
        inputs: [{ port: "project", artifact_type_id: PROJECT_TYPE, schema_version: 1 }],
        outputs: [],
      },
      events: {
        publishes: [{ event_type_id: CHANGED, type_version: 1 }],
        subscribes: [{
          event_type_id: `${PROJECTS}.switched`,
          type_version: 1,
          from_plugin_ids: [PROJECTS],
        }],
      },
    },
    event_types: [{ event_type_id: CHANGED, type_version: 1, validate: (payload) => payload }],
    async start() {
      if (!options.codingStarts) throw new Error("Coding 启动失败");
      return {
        kind: "app",
        views: [view(CODING)],
        onEvent: (event) => options.onEvent?.(event),
        onUpstreamReady: (inputs) => options.onReady?.(inputs),
        onUpstreamUnavailable: () => {},
      } satisfies PluginAppContribution;
    },
    async stop() {},
  };

  return {
    db,
    supervisor,
    bus,
    graph,
    start: () => supervisor.start([{ definition: projects }, { definition: coding }]),
    publishEvent: (payload: unknown) => {
      const installId = supervisor.state(PROJECTS)?.install_id;
      assert.ok(installId);
      return bus.publish(
        { board_id: BOARD, plugin_id: PROJECTS, install_id: installId },
        { event_type_id: `${PROJECTS}.switched`, type_version: 1, payload },
      );
    },
  };
}

test("events and wiring survive a host restart on the same database", async () => {
  const directory = mkdtempSync(join(tmpdir(), "molis-work-plugin-durable-"));
  const file = join(directory, "coordination.db");
  try {
    // First process: Coding cannot start, so nothing reaches it.
    const received: unknown[] = [];
    const first = process(file, { codingStarts: false, onEvent: (event) => received.push(event.payload) });
    await first.start();
    first.graph.bind({
      board_id: BOARD,
      target_plugin_id: CODING,
      target_port: "project",
      source_plugin_id: PROJECTS,
      source_port: "project",
      origin: "user",
      actor_id: "actor",
    });
    first.graph.publish({
      plugin_id: PROJECTS,
      port: "project",
      reference: { artifact_id: "artifact-project", version: 3 },
      scope_key: "workspace-a",
    });
    first.publishEvent({ project: "alpha" });
    first.graph.evaluate(CODING);
    await first.bus.drain();
    await first.graph.drain();
    assert.deepEqual(received, []);
    assert.equal(first.bus.log(BOARD).length, 1);
    assert.equal(first.bus.cursors(BOARD, CODING)[0]?.delivered_sequence, 0);
    first.db.close();

    // Second process over the same file: the binding is restored from storage and
    // the unacknowledged event is replayed exactly once.
    const replayed: unknown[] = [];
    const delivered: PluginUpstreamReadyInputs[] = [];
    const second = process(file, {
      codingStarts: true,
      onEvent: (event) => replayed.push(event.payload),
      onReady: (inputs) => delivered.push(inputs),
    });
    await second.start();

    assert.equal(
      second.graph.status(CODING).status,
      "ready",
      "重启后应从库里恢复连线和端口当前版本",
    );
    second.graph.evaluateAll();
    await second.graph.drain();
    assert.equal(delivered.length, 1);
    assert.equal(delivered[0]?.project?.version, 3);

    await second.bus.resume(BOARD);
    await second.bus.drain();
    assert.deepEqual(replayed, [{ project: "alpha" }]);
    assert.equal(second.bus.cursors(BOARD, CODING)[0]?.delivered_sequence, 1);

    await second.bus.resume(BOARD);
    await second.bus.drain();
    assert.equal(replayed.length, 1, "再次 resume 不应重复投递");
    second.db.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
