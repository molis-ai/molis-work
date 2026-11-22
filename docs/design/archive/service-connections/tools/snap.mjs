// Snapshot the component board's real stylesheet, sprite and state rings for a static design prototype.
// 先 pnpm build。在 apps/workbench 目录里跑（工作区包从那里解析）：
//   node ../../docs/design/service-connections/tools/snap.mjs <临时目录> $(git rev-parse --short HEAD)
// 写出完整的 board.css（约 0.9 MB，不入库）和 board.js；再用 prune.mjs 裁出原型用得到的规则。
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const [outDir, commit] = process.argv.slice(2);
const pa = await import(join(process.cwd(), "dist/page-assets.js"));
const ds = await import("@molis-ai/molis-work-design-system");
const ui = await import("@molis-ai/molis-work-plugin-sdk/ui");
const cm = await import(join(process.cwd(), "dist/connector-marks.js"));
mkdirSync(outDir, { recursive: true });
let css = pa.renderMolisWorkSettingsStylesheet();
// No external resources: fonts fall back to the stack's local faces.
css = css.replace(/@font-face\s*\{[^}]*\}/g, "").replace(/url\((?!["']?data:)[^)]*\)/g, "none");
const head = `/* 组件板快照：apps/workbench renderMolisWorkSettingsStylesheet()（/assets/molis-work-settings.css，组件板 /__ui/catalog 用的同一份），\n   取自 ${commit}。只读快照，不手改；产品样式变了就重新生成。@font-face 与外部 url() 已去掉。 */\n`;
writeFileSync(join(outDir, "board.css"), head + css);
const states = ["done", "failed", "running", "waiting", "reauth", "connected", "disconnected", "retrying", "cancelled", "answer", "idle", "blocked", "verify"];
const rings = Object.fromEntries(states.map((s) => [s, ui.renderStateRing({ state: s })]));
const js = `// 组件板快照：design-system renderIconSprite()、plugin-sdk renderStateRing()、apps/workbench connectorMark()，取自 ${commit}。只读，不手改。\nwindow.MWBoard = ${JSON.stringify({ sprite: ds.renderIconSprite(), rings, spinner: ui.renderSpinner(), marks: Object.fromEntries(["github","linear","gmail","notion","feishu","slack","minimax"].map((id) => [id, cm.connectorMark(id)?.svg ?? null])) })};\n`;
writeFileSync(join(outDir, "board.js"), js);
console.log("css", css.length, "js", js.length);
