import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { checkPrivateWorkContextOwnership } from "../scripts/check-package-boundaries.mjs";

const repository = fileURLToPath(new URL("../", import.meta.url));
const entry = "modules/private-work-context/src/index.ts";
const catalog = "apps/local-host/src/project-catalog.ts";
function fixture(t) {
  const root = mkdtempSync(path.join(tmpdir(), "molis-context-boundary-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const file of ["modules/private-work-context/src", "packages/contracts/src/modules/private-work-context.ts",
    "tests/runtime-binding-ledger.test.ts", catalog]) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    cpSync(path.join(repository, file), path.join(root, file), { recursive: true });
  }
  return { root, check: () => checkPrivateWorkContextOwnership(root).errors,
    append: (file, source) => writeFileSync(path.join(root, file), readFileSync(path.join(root, file), "utf8") + source) };
}

test("W5-08-CTX-04 boundary accepts owner composition and rejects a public Repository or Host construction", t => {
  const f = fixture(t);
  assert.deepEqual(f.check(), []);
  f.append(entry, '\nexport { RuntimeContextBindingRepository } from "./context-bindings.js";\n');
  assert.ok(f.check().some(error => error.startsWith(entry) && error.includes("must remain private")));
  f.append(catalog, "\nnew RuntimeContextBindingRepository(db, ports);\n");
  assert.ok(f.check().some(error => error.startsWith(catalog) && error.includes("must remain private")));
});

test("W5-08-CTX-04 boundary keeps direct binding SQL and owner size restrictions", t => {
  const f = fixture(t);
  f.append(catalog, '\ndb.prepare("DELETE FROM runtime_context_bindings");\n');
  assert.ok(f.check().some(error => error.includes("direct runtime_context_bindings SQL")));
  f.append("modules/private-work-context/src/runtime-context-module.ts", "\n".repeat(501));
  assert.ok(f.check().some(error => error.includes("runtime-context-module.ts") && error.includes("owner limit")));
});

test("W5-08-CTX-04 boundary requires the owner composition entry and Host use", t => {
  const f = fixture(t);
  for (const file of [entry, catalog]) {
    const target = path.join(f.root, file);
    writeFileSync(target, readFileSync(target, "utf8").replaceAll("createRuntimeContextModule", "removedFactory"));
  }
  assert.ok(f.check().some(error => error.startsWith(entry) && error.includes("missing createRuntimeContextModule")));
  assert.ok(f.check().some(error => error.startsWith(catalog) && error.includes("public entrypoint")));
});
