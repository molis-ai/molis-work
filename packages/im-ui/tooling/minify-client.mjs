import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { buildSync, transformSync } from "esbuild";
import { COPY_FEEDBACK_CLIENT_SCRIPT, FIELD_FIT_CLIENT_SCRIPT, SCROLL_FOLLOW_CLIENT_SCRIPT, THEME_BOOTSTRAP_SCRIPT } from "@molis-ai/molis-work-design-system";

// Keep the same shared scroll, copy and intrinsic field mechanisms in the discussion's one served asset.
const options = { charset: "utf8", target: "es2022", minify: true, legalComments: "none" };
const shared = transformSync([THEME_BOOTSTRAP_SCRIPT, SCROLL_FOLLOW_CLIENT_SCRIPT, COPY_FEEDBACK_CLIENT_SCRIPT, FIELD_FIT_CLIENT_SCRIPT].join(";\n"), options).code;
const source = fileURLToPath(new URL("../src/browser/entry.ts", import.meta.url));
const bundled = buildSync({ ...options, entryPoints: [source], platform: "browser", format: "iife", bundle: true, write: false }).outputFiles[0].text;
const code = shared + ";\n" + bundled;
new Function(code); // Check syntax without running browser or network operations.
writeFileSync(new URL("../dist/im-client.js", import.meta.url), code);
