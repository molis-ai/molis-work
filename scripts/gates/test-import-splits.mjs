// Test processes that load one package twice (specs/repository-anti-corruption W2-10, interim form).
//
// A test process (one tests/*.test.{ts,mts,mjs} file, with the tests/ helpers it reads) that loads a package from its source
// (../P/src, run by tsx) and from its build (the package name, ../P/dist) holds two copies of it: instanceof across the copies,
// module-level caches and AsyncLocalStorage then disagree. scripts/test-imports/graph.mjs says which processes do (its header has
// the rule). This counts, per test file, the packages its process loads both ways. Like every per-file number it may only fall
// against the merge-base and a test file with no record starts at 0, so a new test cannot start split and an old one cannot split
// a second package. It is the interim form: when the last split is rewritten (scripts/test-imports.mjs does it), an absolute rule
// ("no process loads a package both ways") replaces it and this metric goes. `node scripts/test-imports.mjs --check --chains` lists
// every split with a path for each side.
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
    grewHint: "read each package from one place in the files this test reads: public names from the package entry, the rest from ../P/dist (node scripts/test-imports.mjs --report plans it, --check --chains shows the paths; CI has no way to accept more, and neither does --update)",
    title: "Packages test processes load from both source and build (per test file)",
    summary: (counts) => `${Object.keys(counts).length} split test processes`,
  });
  return {
    ...metric,
    // The message names the packages and how each side is reached, for the files that grew.
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
