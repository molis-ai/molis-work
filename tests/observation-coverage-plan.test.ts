import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";
import { OBSERVATION_SERVICE_PREFIXES } from "@molis-ai/molis-work-contracts/services/observation";
import { OBSERVATION_COVERAGE_PLAN, type CoveragePlanEntry } from "@molis-ai/molis-work-service-observation";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "@molis-ai/molis-work-app-local-host";

// OCL-09, OCL-16 (specs/observation-collection/spec.md; contract-design §8): the coverage plan says what this build records, and it is checked
// against the code that records: every kind of fact said to be complete is written somewhere by its owner, under its owner's prefix, and
// every service sink the Host wires has its facts in the plan. A kind of fact the plan leaves out is not recorded by this build.

const root = new URL("..", import.meta.url).pathname;
const EXCLUDED_DECLARATIONS = new Set(["horizontal/observation/src/coverage-plan.ts"]);
const isExcludedWriteSource = (rel: string): boolean =>
  EXCLUDED_DECLARATIONS.has(rel)
  || rel.startsWith("horizontal/evaluation/src/")
  || /^plugins\/native\/[^/]+\/src\/registration\.ts$/u.test(rel);

function sources(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === "dist" || name === "node_modules" ? [] : sources(path);
    return path.endsWith(".ts") && !path.endsWith(".d.ts") ? [path] : [];
  });
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\/|(?<![:\\])\/\/[^\n]*/gu, "");
}

const writeSourceFiles = [join(root, "apps/local-host/src"), ...readdirSync(join(root, "horizontal")).map(name => join(root, "horizontal", name, "src")),
  ...readdirSync(join(root, "plugins/native")).map(name => join(root, "plugins/native", name, "src")), join(root, "apps/workbench/src")]
  .filter(path => { try { return statSync(path).isDirectory(); } catch { return false; } })
  .flatMap(sources)
  .map(path => ({ rel: relative(root, path).replaceAll("\\", "/"), path }))
  .filter(({ rel }) => !isExcludedWriteSource(rel))
  .map(({ rel, path }) => ({ rel, text: stripComments(readFileSync(path, "utf8")) }));

const code = writeSourceFiles.map(file => file.text).join("\n");
const pluginDirs = new Map<string, string>(
  PLATFORM_PLUGIN_REGISTRATIONS.map(registration => [`plugin:${registration.manifest.plugin_id}`, `plugins/native/${registration.project_plugin_id}/src/`]),
);

function ownerWriteFiles(owner: string): ReadonlyArray<{ rel: string; text: string }> {
  if (owner === "shell") return writeSourceFiles.filter(file => file.rel.startsWith("apps/workbench/src/"));
  if (owner === "service:gateway") return writeSourceFiles.filter(file => file.rel.startsWith("horizontal/observation/src/"));
  if (owner === "service:agent") return writeSourceFiles.filter(file => file.rel.startsWith("horizontal/agent-host/src/") || file.rel.startsWith("apps/local-host/src/"));
  if (owner.startsWith("plugin:")) {
    const dir = pluginDirs.get(owner);
    return dir ? writeSourceFiles.filter(file => file.rel.startsWith(dir)) : [];
  }
  const service = owner.slice("service:".length);
  return writeSourceFiles.filter(file => file.rel.startsWith("apps/local-host/src/") || file.rel.startsWith(`horizontal/${service}/src/`));
}

function writesFact(text: string, fact: string): boolean {
  const escaped = fact.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?:\\bfact\\s*:\\s*|\\brecord\\s*\\(\\s*)["']${escaped}["']`, "u").test(text);
}

// A plugin's prefix is its own `plugin_id`; a service's is the one the contract gives it.
const prefixOf = (owner: string) => owner === "observation" ? "observation" : owner === "shell" ? OBSERVATION_SERVICE_PREFIXES.shell : owner.startsWith("plugin:") ? owner.slice("plugin:".length)
  : OBSERVATION_SERVICE_PREFIXES[owner.slice("service:".length) as keyof typeof OBSERVATION_SERVICE_PREFIXES];

const ALL_COVERAGE_ENTRIES: readonly CoveragePlanEntry[] = [
  ...OBSERVATION_COVERAGE_PLAN,
  ...PLATFORM_PLUGIN_REGISTRATIONS.flatMap(registration => (registration.observation?.coverage ?? []).map(entry => ({
    owner: `plugin:${registration.manifest.plugin_id}`,
    fact: entry.fact,
    entries: entry.entries,
    state: entry.state,
    ...(entry.reason ? { reason: entry.reason } : {}),
  }))),
];

test("OCL-09 OCL-16: each kind of fact in the plan is its owner's, named once, with a reason exactly when it is not complete", () => {
  const seen = new Set<string>();
  assert.equal(OBSERVATION_COVERAGE_PLAN.some(entry => entry.owner.startsWith("plugin:")), false, "platform coverage plan names no plugin");
  for (const entry of ALL_COVERAGE_ENTRIES) {
    assert.ok(prefixOf(entry.owner), `${entry.owner} is a known owner`);
    assert.ok(entry.fact.startsWith(`${prefixOf(entry.owner)}.`), `${entry.fact} is under ${entry.owner}'s prefix`);
    assert.ok(!seen.has(entry.fact), `${entry.fact} is named once`);
    seen.add(entry.fact);
    assert.ok(entry.entries.length > 0, entry.fact);
    if (entry.state === "complete") assert.equal(entry.reason, undefined, entry.fact);
    else assert.match(entry.reason ?? "", /^[a-z][a-z_]*$/u, `${entry.fact} says why, as a text key`);
  }
});

test("OCL-09 OCL-16: every fact said to be complete is written by the code, and every sink the Host wires has its facts in the plan", () => {
  // F-TEST-05: declaration sources and read-side consumers must never satisfy write-site checks by self-matching.
  assert.equal(writeSourceFiles.some(file => isExcludedWriteSource(file.rel)), false, "excluded declaration and read-side files are absent from writeSources");
  assert.equal(writeSourceFiles.some(file => file.rel === "horizontal/observation/src/coverage-plan.ts"), false);
  assert.equal(writeSourceFiles.some(file => file.rel.startsWith("horizontal/evaluation/src/")), false);
  assert.equal(writeSourceFiles.some(file => /^plugins\/native\/[^/]+\/src\/registration\.ts$/u.test(file.rel)), false);

  for (const entry of ALL_COVERAGE_ENTRIES.filter(item => item.state === "complete")) {
    const owned = ownerWriteFiles(entry.owner);
    assert.ok(owned.length > 0, `${entry.owner} has scanned write-source files`);
    assert.ok(owned.some(file => writesFact(file.text, entry.fact)), `${entry.fact} is recorded by its owner (${entry.owner})`);
  }
  const wired = new Set([...code.matchAll(/\bsink\("([a-z]+)"\)/gu)].map(match => match[1]!));
  assert.ok(wired.size >= 5, [...wired].join(" "));
  for (const service of wired) {
    assert.ok(OBSERVATION_COVERAGE_PLAN.some(entry => entry.owner === `service:${service}` && entry.state === "complete"), `the ${service} sink the Host wires has its facts in the plan`);
  }
});
