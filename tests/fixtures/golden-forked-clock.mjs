// A process under the golden determinism forks itself, and each says what time it thinks it is: tests/golden-home.test.ts holds that they agree.
import * as named from "node:child_process";
import { fileURLToPath } from "node:url";
import { installDeterminism } from "../../scripts/golden/determinism.mjs";

if (process.send) {
  process.send(Date.now());
} else {
  installDeterminism("forked-clock");
  // Through the named export, the way the product imports it: it has to see the replacement too.
  const child = named.fork(fileURLToPath(import.meta.url), [], { execArgv: ["--max-old-space-size=64"] });
  child.once("message", time => { process.stdout.write(JSON.stringify({ parent: Date.now(), child: time })); child.disconnect(); });
}
