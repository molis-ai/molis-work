// W2-10-E: no test process may load a package both from its source and from its build.
// The graph and chain reporting are unchanged. Old baseline entries cannot authorize a split;
// the local quick check no longer stores this measurement, and --update refuses any split too.
// Child fixtures that no test imports remain separate process entries. Dynamic imports without
// a literal target and a fixture that a test both imports and spawns remain graph limitations.
import { createGraph, isProcessFile, splitCounts } from "../test-imports/graph.mjs";
import { wantsText } from "../test-imports/snapshot.mjs";
import { countMetric } from "./count-metric.mjs";

/** Text this gate reads besides source files and test files (the entry reads it from the merge-base too). */
export const splitsWantText = wantsText;

const short = (name) => name.replace("@molis-ai/molis-work-", "");

/** `kit`: { perFile }, shared by the entry. */
export function testImportSplits(kit) {
  const graphs = new WeakMap();
  const metric = countMetric(kit, {
    id: "testImportSplits",
    baselineKey: "testImportSplits",
    totalKey: "testImportSplitsTotal",
    measure(snapshot) {
      if (!snapshot.files.some(isProcessFile)) return {};
      const graph = createGraph(snapshot);
      const counts = splitCounts(graph.analyze());
      graphs.set(counts, graph);
      return counts;
    },
    grewWhat: "packages one test process loads from both source (../P/src) and build (package name, ../P/dist)",
    grewHint: "read each package from one place in the files this process reads (a tests/ file no test imports, such as a spawned fixture, is a process of its own): public names from the package entry, the rest from ../P/dist (node scripts/test-imports.mjs --report plans it, --check --chains shows the paths; CI has no way to accept more, and neither does --update)",
    title: "Packages test processes load from both source and build (per test file or spawned fixture)",
    summary: (counts) => `${Object.keys(counts).length} split test processes`,
  });
  return {
    ...metric,
    toBaseline: () => ({}),
    fromBaseline: () => ({}),
    absolute(counts) {
      const graph = graphs.get(counts);
      return Object.entries(counts).filter(([, count]) => count > 0).map(([file, count]) => {
        const chains = graph?.chains(file).map(entry => `${short(entry.pkg)}: source via ${entry.src.join(" → ")}; build via ${entry.dist.join(" → ")}`) ?? [];
        return `test import absolute zero: ${file} loads ${count} packages from both source and build. ${chains.join(" | ")}`;
      });
    },
    // Retain merge-base diagnostics in addition to the absolute refusal; baseline data grants no exception.
    grew(head, ref, env) {
      const graph = graphs.get(head);
      return metric.grew(head, ref, env).map((message) => {
        const file = Object.keys(head).find((candidate) => message.includes(` in ${candidate} `));
        if (!graph || !file) return message;
        const detail = graph.chains(file).map((entry) => `${short(entry.pkg)}: source via ${entry.src.at(-1)}; build via ${entry.dist.join(" → ")}`);
        return `${message}. Now split: ${detail.join(" | ")}`;
      });
    },
  };
}
