import { writeFileSync } from "node:fs";
import { transformSync } from "esbuild";
import { IM_CLIENT_SCRIPT } from "../dist/client.js";
// D0077/D0333: ship the complete translated program through the same asset, with no runtime bundler dependency.
const { code } = transformSync(IM_CLIENT_SCRIPT, { minify: true, charset: "utf8", target: "es2022", legalComments: "none" });
new Function(code); // Check syntax without running any browser or network operation.
writeFileSync(new URL("../dist/client.js", import.meta.url), `export const IM_CLIENT_SCRIPT = ${JSON.stringify(code)};\n`);
