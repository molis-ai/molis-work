import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";
import { goalsManifest } from "@molis-ai/molis-work-plugin-goals";
import { parsePluginManifest } from "@molis-ai/molis-work-plugin-sdk";
import { artifactLinkKinds, artifactProducerSources, linkKindProblems } from "@molis-ai/molis-work-app-local-host";

// ac-artifacts A3, PG-077 (slices/ac-artifacts.md §3.5): the kinds of link from a Goal to a 成果 version are Goals' Manifest
// (`artifacts.links`), and the 成果库 reads them by kind. RAC-419 no literal in the library, RAC-420 the kinds come from the Manifest,
// RAC-421 a kind has one owner.

const sources = () => artifactProducerSources();

test("RAC-419: the 成果库 module and plugin source name no Goal link kind and no Goals module", () => {
  const code = (directory: string) => readdirSync(new URL(`../${directory}/`, import.meta.url)).filter(file => file.endsWith(".ts"))
    .map(file => [`${directory}/${file}`, readFileSync(new URL(`../${directory}/${file}`, import.meta.url), "utf8")] as const);
  const lines = [...code("modules/artifacts/src"), ...code("plugins/native/artifacts/src")].flatMap(([file, text]) =>
    text.split("\n").map((line, index) => [file, index + 1, line] as const).filter(([, , line]) => !/^\s*(?:\/\/|\*|\/\*)/u.test(line)));
  const offenders = lines.filter(([, , line]) => /["'`]goal\.(?:input|output)|module\s*===\s*["']goals["']|GOAL_ROLES/u.test(line)).map(([file, number]) => `${file}:${number}`);
  assert.deepEqual(offenders, []);
});

test("RAC-420: the link kinds are the ones Goals' Manifest declares, each as the module Goals writes its edges as", () => {
  const kinds = artifactLinkKinds(sources());
  // The declaring Plugin rides along, so 「被谁引用」 lists each edge under the Plugin that owns its kind (BL-646).
  const goals = goalsManifest.plugin_id;
  assert.deepEqual([...kinds].map(([kind, value]) => [kind, value.role, value.proposal, value.module, value.plugin_id, value.plugin_title]).sort(), [
    ["goal.input", "input", false, "goals", goals, "Goals"], ["goal.input.proposal", "input", true, "goals", goals, "Goals"],
    ["goal.output", "output", false, "goals", goals, "Goals"], ["goal.output.proposal", "output", true, "goals", goals, "Goals"],
  ]);
  assert.deepEqual(goalsManifest.artifacts.links?.map(link => link.kind).sort(), [...kinds.keys()].sort());
  assert.equal(artifactLinkKinds(sources().filter(source => source.plugin_id !== goalsManifest.plugin_id)).size, 0, "Goals absent: no kinds");
});

test("RAC-421: a second Plugin declaring a kind Goals owns is named as a problem; the same Plugin repeating itself is refused by the Manifest check", () => {
  const goals = sources().find(source => source.plugin_id === goalsManifest.plugin_id)!;
  const other = { plugin_id: "example.other", name: "Other", surface: "other", actions: [], artifacts: { produces: [], consumes: [], links: [{ kind: "goal.input", role: "input" as const }] } };
  assert.deepEqual(linkKindProblems([goals]), []);
  assert.deepEqual(linkKindProblems([goals, other]), ["链接种类 goal.input 已由 io.molis.work.goals 声明，example.other 不能再声明"]);
  assert.equal(artifactLinkKinds([goals, other]).get("goal.input")?.module, "goals", "the first owner keeps the kind");
  const twice = structuredClone(goalsManifest);
  twice.artifacts.links = [...twice.artifacts.links!, { kind: "goal.input", role: "input" }];
  assert.throws(() => parsePluginManifest(twice), /声明了不止一次/);
  const bad = structuredClone(goalsManifest);
  bad.artifacts.links = [{ kind: "Goal Input", role: "input" }, { kind: "x.y", role: "sideways" as "input" }];
  assert.throws(() => parsePluginManifest(bad));
});
