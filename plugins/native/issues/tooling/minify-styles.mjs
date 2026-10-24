import { transform } from "esbuild";
import { ISSUES_STYLES } from "../dist/styles.js";

// Prints the style sheet, minified, as the JSON string the client bundle is built with (`--define:ISSUES_CSS=…` in the
// package's build script). esbuild is the workspace's existing browser build tool; no runtime dependency is added.
const css = await transform(ISSUES_STYLES, { loader: "css", minify: true, target: "es2022" });
process.stdout.write(JSON.stringify(css.code.trim()));
