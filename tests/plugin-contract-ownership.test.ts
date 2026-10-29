import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { actionErrorResponse, pollingIntegrationBinding } from "@molis-ai/molis-work-plugin-sdk";
import { codingManifest } from "@molis-ai/molis-work-plugin-coding";
import * as coding from "@molis-ai/molis-work-plugin-coding/contract";
import { imagesManifest } from "@molis-ai/molis-work-plugin-images";
import { shelfManifest } from "@molis-ai/molis-work-plugin-shelf";
import * as shelf from "@molis-ai/molis-work-module-shelf/contract";
import * as images from "@molis-ai/molis-work-plugin-images/contract";
import * as dataset from "@molis-ai/molis-work-plugin-dataset/contract";
import * as form from "@molis-ai/molis-work-plugin-form/contract";
import * as jelly from "@molis-ai/molis-work-plugin-jelly/contract";
import * as lingguang from "@molis-ai/molis-work-plugin-lingguang/contract";
import * as pages from "@molis-ai/molis-work-plugin-pages/contract";
import * as ppt from "@molis-ai/molis-work-plugin-ppt/contract";
import * as todo from "@molis-ai/molis-work-plugin-todo/contract";

test("RAC-620: Images exposes its own public contract", () => {
  assert.deepEqual({ ...images }, {
    IMAGES_PLUGIN_ID: "io.molis.work.images",
    IMAGES_PROJECT_PLUGIN_ID: "images",
  });
});

test("RAC-621: Jelly exposes its own public contract", () => {
  assert.deepEqual({ ...jelly }, {
    JELLY_PLUGIN_ID: "io.molis.work.jelly",
    JELLY_PROJECT_PLUGIN_ID: "jelly",
  });
});

test("RAC-622: the platform no longer exports Images or Jelly contracts", async () => {
  for (const name of ["images", "jelly"]) {
    await assert.rejects(import(`@molis-ai/molis-work-contracts/modules/${name}`), {
      code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
    });
  }
});

test("RAC-820: Form, Lingguang, PPT and Dataset each expose their own public contract (PG-111)", () => {
  assert.deepEqual({ ...form }, {
    FORM_PLUGIN_ID: "io.molis.work.form",
    FORM_PROJECT_PLUGIN_ID: "form",
    FORM_ARTIFACT_TYPE_ID: "io.molis.work.form.questionnaire",
    FORM_ARTIFACT_SCHEMA_VERSION: 1,
  });
  assert.deepEqual({ ...lingguang }, {
    LINGGUANG_PLUGIN_ID: "io.molis.work.lingguang",
    LINGGUANG_PROJECT_PLUGIN_ID: "lingguang",
    LINGGUANG_BODY_LIMIT: 200_000,
  });
  assert.deepEqual({ ...ppt }, {
    PPT_PLUGIN_ID: "io.molis.work.ppt",
    PPT_PROJECT_PLUGIN_ID: "ppt",
    PPT_SUBJECT_KIND: "presentation",
    PPT_ARTIFACT_TYPE_ID: "io.molis.work.ppt.deck",
    PPT_ARTIFACT_SCHEMA_VERSION: 1,
  });
  assert.deepEqual({ ...dataset }, {
    DATASET_PLUGIN_ID: "io.molis.work.dataset",
    DATASET_PROJECT_PLUGIN_ID: "dataset",
    DATASET_ARTIFACT_TYPE_ID: "io.molis.work.dataset.table",
    DATASET_ARTIFACT_SCHEMA_VERSION: 1,
  });
});

test("RAC-821: the platform no longer exports the Form, Lingguang, PPT or Dataset contracts", async () => {
  for (const name of ["form", "lingguang", "ppt", "dataset"]) {
    await assert.rejects(import(`@molis-ai/molis-work-contracts/modules/${name}`), {
      code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
    });
  }
});

test("RAC-823: Todo and Pages each expose their own public contract (PG-111)", () => {
  assert.deepEqual({ ...todo }, {
    TODO_PLUGIN_ID: "io.molis.work.todo",
    TODO_PROJECT_PLUGIN_ID: "todo",
    TODO_ORGANIZE_MATERIAL_CHARS: 60_000,
    TODO_SUBJECT_KIND: "todo_item",
    TODO_STATUSES: ["open", "doing", "waiting", "done", "cancelled"],
    TODO_REMINDER_STALE_HOURS: 48,
  });
  assert.deepEqual({ ...pages }, {
    PAGES_PLUGIN_ID: "io.molis.work.pages",
    PAGES_PROJECT_PLUGIN_ID: "pages",
    PAGES_ARTIFACT_TYPE_ID: "io.molis.work.pages.document",
    PAGES_ARTIFACT_SCHEMA_VERSION: 1,
  });
});

test("RAC-824: the platform no longer exports the Todo or Pages contracts", async () => {
  for (const name of ["todo", "pages"]) {
    await assert.rejects(import(`@molis-ai/molis-work-contracts/modules/${name}`), {
      code: "ERR_PACKAGE_PATH_NOT_EXPORTED",
    });
  }
});

test("RAC-825: the onboarding journey, Inbox and the continuity demo call Todo and Pages by action id and name neither plugin's contract nor package", () => {
  const root = join(import.meta.dirname, "..");
  const files = [
    ...readdirSync(join(root, "apps/local-host/src")).filter(name => name.startsWith("context-onboarding")).map(name => `apps/local-host/src/${name}`),
    ...readdirSync(join(root, "plugins/native/inbox/src")).filter(name => name.endsWith(".ts")).map(name => `plugins/native/inbox/src/${name}`),
    "server/tooling/continuity-demo.mts",
  ];
  assert.ok(files.length > 6, "the scan found the files it is about");
  for (const file of files) {
    const source = readFileSync(join(root, file), "utf8");
    assert.doesNotMatch(source, /molis-work-plugin-(todo|pages)\b|molis-work-contracts\/modules\/(todo|pages)\b/, `${file} imports a Todo or Pages package or contract`);
  }
});

test("RAC-870: Coding exposes its result-document action from its own public contract", () => {
  assert.deepEqual([coding.codingResultDocument.capability_id, coding.codingResultDocument.version, coding.codingResultDocument.operation],
    ["coding.results.document", 1, "query"]);
  assert.ok(codingManifest.actions?.some(row => Object.is(row, coding.codingResultDocument)));
});

test("RAC-871: the Shelf module exposes its contract from its own public entry", () => {
  assert.deepEqual([shelf.SHELF_ADMIT_ACTION.capability_id, shelf.SHELF_ADMIT_ACTION.version, shelf.SHELF_ADMIT_ACTION.operation],
    ["shelf.items.admit", 2, "command"]);
});

test("RAC-872: the platform no longer exports the Coding or Shelf contracts", async () => {
  for (const name of ["coding", "shelf"]) {
    await assert.rejects(import(`@molis-ai/molis-work-contracts/modules/${name}`), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" });
  }
});

test("RAC-873: Shelf and Images ask for the other plugin's action by id and import neither provider", () => {
  assert.deepEqual(shelfManifest.capabilities.consumes, ["coding.results.document"]);
  assert.deepEqual(imagesManifest.capabilities.consumes, ["shelf.items.admit"]);
  const sources = (root: string): string[] => readdirSync(root, { withFileTypes: true }).flatMap(entry =>
    entry.isDirectory() ? sources(join(root, entry.name)) : entry.name.endsWith(".ts") ? [readFileSync(join(root, entry.name), "utf8")] : []);
  const repository = join(dirname(fileURLToPath(import.meta.url)), "..");
  assert.ok(sources(join(repository, "plugins/native/shelf/src")).every(text => !text.includes("molis-work-plugin-coding")), "Shelf does not import Coding");
  assert.ok(sources(join(repository, "plugins/native/images/src")).every(text => !text.includes("molis-work-module-shelf") && !text.includes("molis-work-plugin-shelf")), "Images does not import Shelf");
});

// PG-111 Feed (T-110): Feed's records, Sources, Signals and the Listener's state are Feed's; what the platform's source pull and an integration's
// adapter hand each other stays in the platform's contract.
const FEED_SUBPATHS = ["modules/feed", "modules/signals", "modules/sources", "services/listener-host"] as const;
const REPOSITORY = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcesUnder = (root: string): Array<[string, string]> => readdirSync(root, { withFileTypes: true }).flatMap(entry =>
  entry.isDirectory() ? sourcesUnder(join(root, entry.name)) : /\.m?ts$/u.test(entry.name) ? [[join(root, entry.name), readFileSync(join(root, entry.name), "utf8")] as [string, string]] : []);

test("RAC-1750: Feed exposes its own public contract, and its root and store entries give the same declarations (PG-111)", async () => {
  const contract = await import("@molis-ai/molis-work-plugin-feed/contract");
  const root = await import("@molis-ai/molis-work-plugin-feed");
  const store = await import("@molis-ai/molis-work-plugin-feed/store");
  assert.deepEqual(Object.keys(contract).sort(), ["feedErrors", "isAccountConnectorSyncKind", "sourceDeletedAt"], "the runtime values of Feed's contract, and nothing of the store");
  assert.equal(root.feedErrors, contract.feedErrors, "the Feed root gives the contract's own declaration");
  assert.deepEqual([contract.isAccountConnectorSyncKind("github"), contract.isAccountConnectorSyncKind("connector"), contract.isAccountConnectorSyncKind("public_source")], [true, true, false]);
  assert.equal(contract.sourceDeletedAt({ config: { _molis_work_lifecycle: { deleted_at: "2026-10-29T00:00:00.000Z" } } }), "2026-10-29T00:00:00.000Z");
  assert.equal(contract.sourceDeletedAt({ config: {} }), null);
  // The two declarations whose owner is the store file that raises them, not Feed: same codes and kinds as before the move.
  const codes = (declared: Record<string, (message: string) => ActionError>) => Object.fromEntries(Object.entries(declared).map(([reason, raise]) => {
    const error = raise("m");
    return [reason, [error.code, actionErrorResponse(error).status]];
  }));
  assert.deepEqual(codes(store.sourceErrors), { not_found: ["sources.not_found", 400], invalid_schedule: ["sources.invalid_schedule", 400], invalid_transition: ["sources.invalid_transition", 400] });
  assert.deepEqual(codes(store.listenerErrors), { lease_busy: ["listener.lease_busy", 400], delivery_failed: ["listener.delivery_failed", 400],
    delivery_quarantined: ["listener.delivery_quarantined", 400], connector_failed: ["listener.connector_failed", 400] });
});

test("RAC-1751: the platform no longer exports Feed's, Sources', Signals' or the Listener's contracts", async () => {
  for (const name of FEED_SUBPATHS) {
    await assert.rejects(import(`@molis-ai/molis-work-contracts/${name}`), { code: "ERR_PACKAGE_PATH_NOT_EXPORTED" }, name);
  }
  const moved = /\bexport\s+(?:interface|type|const|function|class)\s+(Feed(?:Item|Material|Attention|Query|Commands|Event|Api|Module)\w*|IngestFeedItemInput|feedErrors|Signal(?:AdapterRef|Draft|Record|Receipt|Query|Commands|Event|Events|sApi)|Source(?:Status|SyncKind|HistoryDecision|Schedule|Record|Query|Commands|Event|Events|sApi)|sourceErrors|sourceDeletedAt|isAccountConnectorSyncKind|Listener(?:Checkpoint|RunRecord|RunReceipt|HostApi)|listenerErrors)\b/u;
  for (const [file, text] of sourcesUnder(join(REPOSITORY, "packages/contracts/src"))) {
    assert.doesNotMatch(text, moved, `${file.slice(REPOSITORY.length)} declares a Feed record`);
  }
});

/** Type errors a small caller gets from the built declarations; the test runner strips types, so they are checked here. */
function typeErrors(source: string): string[] {
  const file = fileURLToPath(new URL("./feed-contract-types.virtual.ts", import.meta.url));
  const options: ts.CompilerOptions = { noEmit: true, strict: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, types: ["node"],
    typeRoots: [fileURLToPath(new URL("../node_modules/@types", import.meta.url))] };
  const host = ts.createCompilerHost(options);
  const read = host.getSourceFile.bind(host);
  host.getSourceFile = (name, ...rest) => name === file ? ts.createSourceFile(file, source, rest[0], true) : read(name, ...rest);
  return ts.getPreEmitDiagnostics(ts.createProgram([file], options, host))
    .filter(diagnostic => !diagnostic.file || diagnostic.file.fileName === file)
    .map(diagnostic => ts.flattenDiagnosticMessageText(diagnostic.messageText, " "));
}

test("RAC-1752: an integration's adapter and the platform's pull receipt are the platform's: the draft is exactly the six fields an adapter fills", () => {
  assert.deepEqual(typeErrors(`
    import type { ConnectorSignalDraft, RawEventAdapter, RssFetchReceipt } from "@molis-ai/molis-work-contracts/platform/plugin-source-pull";
    import type { PluginIntegrationContribution } from "@molis-ai/molis-work-contracts/platform/plugin";
    type Exact<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
    type Draft = { kind: string; occurred_at: string; observed_at: string; payload: Record<string, unknown>; content_refs?: string[]; provenance: Record<string, unknown> };
    type Receipt = { readonly status: number; readonly not_modified: boolean; readonly etag?: string; readonly last_modified?: string; readonly final_url: string; readonly feed_title?: string; readonly home_url?: string };
    export const draft: Exact<ConnectorSignalDraft, Draft> = true;
    export const adapted: Exact<ReturnType<RawEventAdapter["toSignalDraft"]>, Draft> = true;
    export const identity: Exact<RawEventAdapter["adapter"], { plugin_id: string; version: string }> = true;
    export const bound: Exact<ReturnType<PluginIntegrationContribution["bind"]>["signal_adapter"], RawEventAdapter> = true;
    export const receipt: Exact<RssFetchReceipt, Receipt> = true;
  `), []);
  // The SDK's own adapter fills exactly those fields (the receive chain's tests use an adapter written by hand).
  const manifest = { plugin_id: "io.molis.work.integration.fixture", version: "1.0.0" } as Parameters<typeof pollingIntegrationBinding>[0]["manifest"];
  const binding = pollingIntegrationBinding({ manifest, provider: {} as Parameters<typeof pollingIntegrationBinding>[0]["provider"] });
  const draft = binding.signal_adapter.toSignalDraft({ provider_dedupe_id: "e1", occurred_at: "2026-10-29T00:00:00.000Z", observed_at: "2026-10-29T00:00:01.000Z",
    payload: { kind: "mail", title: "t" } } as Parameters<typeof binding.signal_adapter.toSignalDraft>[0], { project_id: "p", source_id: "s" });
  assert.deepEqual(Object.keys(draft).sort(), ["content_refs", "kind", "observed_at", "occurred_at", "payload", "provenance"]);
  assert.deepEqual(binding.signal_adapter.adapter, { plugin_id: "io.molis.work.integration.fixture", version: "1.0.0" });
});

test("RAC-1753: what the RSS and YouTube integrations refuse is refused in their own names, 400, through the real normalizers", async () => {
  const rss = await import("@molis-ai/molis-work-integration-rss");
  const youtube = await import("@molis-ai/molis-work-integration-youtube");
  const refusal = (run: () => unknown) => {
    try { run(); } catch (error) { assert.ok(error instanceof ActionError, "an ActionError"); const { status, body } = actionErrorResponse(error); return [body.code, status]; }
    return assert.fail("expected a refusal");
  };
  assert.deepEqual(refusal(() => rss.normalizeCustomRssFeedUrl("http://127.0.0.1/feed.xml")), ["rss.custom_url_invalid", 400]);
  assert.deepEqual(refusal(() => rss.normalizeCustomRssFeedUrl("https://www.youtube.com/feeds/videos.xml?channel_id=UCabcdefghijklmnopqrstuv")), ["rss.use_youtube_channel", 400]);
  assert.deepEqual(refusal(() => rss.normalizeCustomRssFeedUrl("https://www.reddit.com/r/news/.rss")), ["rss.use_official_reddit", 400]);
  assert.deepEqual(refusal(() => youtube.normalizeYouTubeChannelId("not a channel")), ["youtube.channel_invalid", 400]);
  const declared = (holder: Record<string, unknown>, name: string) => Object.keys(holder[name] as object).sort();
  assert.deepEqual(declared(rss, "rssErrors"), ["custom_url_invalid", "use_official_reddit", "use_youtube_channel"]);
  assert.deepEqual(declared(youtube, "youtubeErrors"), ["channel_invalid"]);
});

test("RAC-1754: the Host, the integrations and the Runtime name no Feed contract, and only files that already named the Feed package do", () => {
  const roots = ["apps/local-host/src", "plugins/official-integrations/rss/src", "plugins/official-integrations/youtube/src", "packages/plugin-runtime/src", "packages/plugin-sdk/src", "packages/contracts/src"];
  const naming: string[] = [];
  for (const root of roots) for (const [file, text] of sourcesUnder(join(REPOSITORY, root))) {
    const where = file.slice(REPOSITORY.length + 1);
    for (const name of FEED_SUBPATHS) assert.ok(!text.includes(`molis-work-contracts/${name}"`) && !text.includes(`../${name}.js"`), `${where} names ${name}`);
    if (text.includes("@molis-ai/molis-work-plugin-feed")) naming.push(where);
  }
  // The Host files that assembled or read Feed before T-110; the integrations and the platform packages name none.
  assert.deepEqual(naming.sort(), ["apps/local-host/src/demo-feed-library.ts", "apps/local-host/src/demo-plugin-seed.ts", "apps/local-host/src/index.ts",
    "apps/local-host/src/native-content-permissions.ts", "apps/local-host/src/plugin-registry.generated.ts", "apps/local-host/src/source-pull-runtime.ts",
    "apps/local-host/src/source-vocabulary.ts", "apps/local-host/src/web-panel.ts", "apps/local-host/src/web-request.ts", "apps/local-host/src/web-view.ts"]);
});
