import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { OBSERVATION_SERVICE_PREFIXES } from "@molis-ai/molis-work-contracts/services/observation";
import { OBSERVATION_COVERAGE_PLAN } from "@molis-ai/molis-work-service-observation";

// OCL-09, OCL-16 (specs/observation-collection/spec.md; contract-design §8): the coverage plan says what this build records, and it is checked
// against the code that records: every kind of fact said to be complete is written somewhere by its owner, under its owner's prefix, and
// every service sink the Host wires has its facts in the plan. A kind of fact the plan leaves out is not recorded by this build.

const root = new URL("..", import.meta.url).pathname;
function sources(directory: string): string[] {
  return readdirSync(directory).flatMap(name => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return name === "dist" || name === "node_modules" ? [] : sources(path);
    return path.endsWith(".ts") && !path.endsWith(".d.ts") ? [path] : [];
  });
}
const code = [join(root, "apps/local-host/src"), ...readdirSync(join(root, "horizontal")).map(name => join(root, "horizontal", name, "src")),
  ...readdirSync(join(root, "plugins/native")).map(name => join(root, "plugins/native", name, "src")), join(root, "apps/workbench/src")]
  .filter(path => { try { return statSync(path).isDirectory(); } catch { return false; } }).flatMap(sources).map(path => readFileSync(path, "utf8")).join("\n");

// A plugin's prefix is its own `plugin_id`; a service's is the one the contract gives it.
const prefixOf = (owner: string) => owner === "observation" ? "observation" : owner === "shell" ? OBSERVATION_SERVICE_PREFIXES.shell : owner.startsWith("plugin:") ? owner.slice("plugin:".length)
  : OBSERVATION_SERVICE_PREFIXES[owner.slice("service:".length) as keyof typeof OBSERVATION_SERVICE_PREFIXES];

test("OCL-09 OCL-16: each kind of fact in the plan is its owner's, named once, with a reason exactly when it is not complete", () => {
  const seen = new Set<string>();
  for (const entry of OBSERVATION_COVERAGE_PLAN) {
    assert.ok(prefixOf(entry.owner), `${entry.owner} is a known owner`);
    assert.ok(entry.fact.startsWith(`${prefixOf(entry.owner)}.`), `${entry.fact} is under ${entry.owner}'s prefix`);
    assert.ok(!seen.has(entry.fact), `${entry.fact} is named once`); seen.add(entry.fact);
    assert.ok(entry.entries.length > 0, entry.fact);
    if (entry.state === "complete") assert.equal(entry.reason, undefined, entry.fact);
    else assert.match(entry.reason ?? "", /^[a-z][a-z_]*$/u, `${entry.fact} says why, as a text key`);
  }
});

test("OCL-09 OCL-16: every fact said to be complete is written by the code, and every sink the Host wires has its facts in the plan", () => {
  for (const entry of OBSERVATION_COVERAGE_PLAN.filter(item => item.state === "complete")) {
    const name = entry.fact.slice(entry.fact.indexOf(".") + 1);
    // An Agent round's facts are written as `agent.<name>` by the run projection; every other fact's name is a literal where it is recorded.
    // The shell's facts are named in its page script, in either quote.
    assert.ok(code.includes(`"${entry.fact}"`) || code.includes(`'${entry.fact}'`) || (entry.owner === "service:agent" && code.includes(`"agent.${name}"`)), `${entry.fact} is recorded somewhere`);
  }
  const wired = new Set([...code.matchAll(/\bsink\("([a-z]+)"\)/gu)].map(match => match[1]!));
  assert.ok(wired.size >= 5, [...wired].join(" "));
  for (const service of wired) {
    assert.ok(OBSERVATION_COVERAGE_PLAN.some(entry => entry.owner === `service:${service}` && entry.state === "complete"), `the ${service} sink the Host wires has its facts in the plan`);
  }
});
