// RAC-917 (W5-10 batch B, docs/system/HUGE-CLASS-MIGRATION.md): the Assistant's service is split into package-shaped
// collaborators. Each reaches the Host only through its ports and the others only through its `link`: it imports no other
// collaborator's code (types only), holds the store as the few methods it uses (never the whole `AssistantStore`), and the
// look for new material is given the store and how a work is named the same way. Read from the sources, so it holds
// before anything is built; moving the directory into its own package later moves these files as they are.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const DIR = new URL("../apps/local-host/src/assistant/", import.meta.url);
const COLLABORATORS = ["assistant-work-reads", "assistant-dispatch", "assistant-outcomes", "assistant-round-materials", "assistant-memory-bridge", "assistant-budget", "assistant-notices"];
const source = (name: string) => readFileSync(new URL(`${name}.ts`, DIR), "utf8");
/** Every import of `name`'s source: its module and whether it brings code (not `import type`). */
const imports = (name: string) => [...source(name).matchAll(/^import (type )?\{([^}]*)\} from "\.\/([\w-]+)\.js";/gm)]
  .map(([, typeOnly, names, module]) => ({ module: module!, code: !typeOnly && names!.split(",").some(item => item.trim() && !item.trim().startsWith("type ")) }));

test("RAC-917: a collaborator imports no other collaborator's code, nor the service it is part of", () => {
  for (const name of COLLABORATORS) {
    const code = imports(name).filter(item => item.code).map(item => item.module);
    assert.deepEqual(code.filter(module => COLLABORATORS.includes(module) || module === "assistant-service"), [], `${name} reaches the others only through its link`);
  }
});

test("RAC-917: a collaborator holds the store as the methods it uses, and its links as the methods it calls", () => {
  for (const name of COLLABORATORS) {
    const text = source(name);
    assert.doesNotMatch(text, /:\s*AssistantStore\b(?!\[)/, `${name} is not given the whole store`);
    const store = text.match(/private readonly store: Pick<AssistantStore, ([^>]+)>/);
    if (store) assert.ok(store[1]!.split("|").length <= 15, `${name} names the store methods it uses`);
    assert.match(text, /export class \w+ \{\n  constructor\(/, `${name} is one class, wired by the service`);
  }
});

test("RAC-917: the look for new material is given the store's parts and how a work is named, not the store or the relations' code", () => {
  const scan = source("assistant-material-scan");
  assert.match(scan, /store: Pick<AssistantStore, "setting" \| "setSetting" \| "list" \| "raiseNotice" \| "relations">;/);
  assert.match(scan, /identity: \(work: StoredWork\) => WorkIdentity;/);
  assert.deepEqual(imports("assistant-material-scan").filter(item => item.code && item.module === "assistant-relations"), [], "no code from the relations module");
});
