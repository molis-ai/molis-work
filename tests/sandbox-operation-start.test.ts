import assert from "node:assert/strict";
import test from "node:test";
import type { SandboxPluginContract } from "@molis-ai/molis-work-contracts/platform/plugin-sandbox";
import { parsePluginManifest, sandboxOperationActions, sandboxPackageBuildId, sandboxPluginManifest, sandboxStartProblems } from "@molis-ai/molis-work-plugin-sdk";
import { SandboxError, assertContract } from "@molis-ai/molis-work-plugin-sandbox";
import { packageContract } from "./fixtures/sandbox-package.js";

// PEQ-06 (specs/plugin-equal-standing/contract-design.md §2.4, user 2026-11-18 「Add start to operation」): a signed or generated package
// gives the home and its overview a starting point the way a native plugin does, with a blank intake on its own command. The SDK projects
// the operation's `start`; nothing reads an old shape, and a start anywhere but on a command is refused at admission and at projection.

const START = { item_kind: "note", title: "New note", hint: "Write a note", open: { view_id: "app", panel: "editor" } } as const;
const withStart = (id: string, start: unknown): SandboxPluginContract => {
  const contract = packageContract();
  Object.assign(contract.operations.find(operation => operation.id === id)!, { start });
  return contract;
};
const PUBLISHER = "ed25519:sha256:" + "a".repeat(64);
/** The Manifest a signed package of this contract gets, read the way the Host reads every Manifest. */
const manifestOf = (contract: SandboxPluginContract) => parsePluginManifest(sandboxPluginManifest({ pluginId: contract.pluginId, version: "1.0.0", name: "Example notes",
  publisher: { publisher_id: "example", signature: PUBLISHER }, presentation: false, contract }));
const project = (contract: SandboxPluginContract) => sandboxOperationActions({ contract, buildId: sandboxPackageBuildId(contract.pluginId, PUBLISHER), version: 1, title: "Example notes", scope: "project" });

test("PEQ-06 a command's start becomes its blank intake, with the start's words and form, and passes the Manifest's intake rules", () => {
  const actions = project(withStart("notes.add", START));
  const add = actions.find(definition => definition.action.local_id === "notes.add")!;
  assert.deepEqual(add.action.intake, { intake_id: "notes.add", item_kind: "note", title: "New note", verb: "New note", describe: "Write a note", accepts: [], examples: [],
    start: { title: "New note", hint: "Write a note", open: { view_id: "app", panel: "editor" } } });
  assert.equal(actions.find(definition => definition.action.local_id === "notes.list")!.action.intake, undefined, "an operation without a start has no intake");
  const manifest = manifestOf(withStart("notes.add", START));
  assert.deepEqual(manifest.actions?.find(definition => definition.action.local_id === "notes.add")?.action.intake, add.action.intake, "the signed Manifest carries it and passes the intake rules");
  assertContract(withStart("notes.add", START));
});

test("PEQ-06 a start on a query, under an intake id the Manifest refuses, or with fields it does not know is refused at admission and projection", () => {
  const cases: Array<[string, SandboxPluginContract, RegExp]> = [
    ["a query", withStart("notes.list", START), /The start of notes\.list: only a command makes one from nothing/u],
    ["no hint", withStart("notes.add", { item_kind: "note", title: "New note" }), /declare item_kind, title and hint/u],
    ["an unknown field", withStart("notes.add", { ...START, verb: "Add" }), /declare item_kind, title and hint/u],
    ["not a record", withStart("notes.add", "New note"), /declare item_kind, title and hint/u],
  ];
  const upper = withStart("notes.add", START);
  upper.operations.find(operation => operation.id === "notes.add")!.id = "Notes.Add";
  upper.pages[0]!.regions[0]!.operationIds = ["notes.list", "Notes.Add"];
  cases.push(["an operation id that is not an intake id", upper, /the operation id becomes the intake id/u]);
  for (const [what, contract, message] of cases) {
    assert.match(sandboxStartProblems(contract).join("\n"), message, what);
    assert.throws(() => project(contract), message, what);
    assert.throws(() => assertContract(contract), (error: unknown) => error instanceof SandboxError && error.code === "sandbox.invalid_contract" && message.test(error.message), what);
  }
  // The words themselves are the intake's: a title longer than an intake's name passes the shape here and is refused with the Manifest.
  assert.throws(() => manifestOf(withStart("notes.add", { ...START, title: "N".repeat(41) })), /的创建入口声明无效/u);
});
