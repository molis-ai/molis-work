import assert from "node:assert/strict";
import test from "node:test";
import { appImportSites, reviewedServerComposition } from "../scripts/gates/layer-exceptions.mjs";

test("D0272 D0280: every app import point counts, including multiple imports on one listed edge", () => {
  const file = "apps/server/src/probe.ts";
  const measure = (source: string) => appImportSites({ files: [file], read: () => source });
  assert.deepEqual(measure('import { a } from "@molis-ai/molis-work-app-local-host"; export { b } from "@molis-ai/molis-work-app-local-host";'), { [`import-site#${file} -> apps/local-host`]: 2 });
  assert.deepEqual(measure('type X = import("@molis-ai/molis-work-app-desktop").X; const x = import("@molis-ai/molis-work-app-local-host"); const y = require("../../local-host/src/index.js");'), {
    [`import-site#${file} -> apps/desktop`]: 1, [`import-site#${file} -> apps/local-host`]: 2,
  });
  assert.deepEqual(measure('import { x } from "@molis-ai/molis-work-contracts";'), {});
});

test("D0272 D0280: approved composition transition allows exactly one root import, only after both old edges go", () => {
  const ref = { "app-import#apps/server -> apps/desktop": 1, "app-import#apps/server -> apps/local-host": 1 };
  const head = { "app-import#. -> apps/server": 1, "import-site#apps/desktop/launchers/cli/main.ts -> apps/server": 1 };
  assert.deepEqual(reviewedServerComposition(head, ref), { ...ref, ...head });
  assert.deepEqual(reviewedServerComposition({ ...head, "app-import#apps/server -> apps/local-host": 1 }, ref), ref);
  assert.deepEqual(reviewedServerComposition({ ...head, "import-site#apps/desktop/launchers/cli/main.ts -> apps/server": 2 }, ref), ref);
  assert.deepEqual(reviewedServerComposition(head, {}), {});
});
