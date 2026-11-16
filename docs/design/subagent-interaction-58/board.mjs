// Standalone views of the same specimens mounted in /__ui/catalog#subtask-conversation.
import { readFile, writeFile } from "node:fs/promises";
import { installTextForTest } from "../../../packages/plugin-sdk/dist/ui/text.js";
import { renderSubtaskConversationSection, SUBTASK_SPECIMEN_STYLES } from "../../../apps/workbench/dist/subtask-conversation-specimen.js";
import { SUBTASK_CONVERSATION_STYLES } from "../../../apps/workbench/dist/subtask-conversation-styles.js";
import { COMPOSER_STYLES } from "../../../packages/design-system/dist/index.js";

const packs = await Promise.all(["zh", "en"].map(async lang => JSON.parse(await readFile(new URL(`../../../apps/workbench/resources/locales/${lang}.json`, import.meta.url), "utf8"))));
for (const lang of ["zh", "en"]) {
  const release = installTextForTest({ packs, locale: lang });
  const section = renderSubtaskConversationSection();
  release();
  await writeFile(new URL(`dist/board-${lang}.html`, import.meta.url), `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>58 · Subtask component board</title>
<link rel="stylesheet" href="../../kit/kit.css"><link rel="stylesheet" href="../../kit/settings.css">
<style>${COMPOSER_STYLES}${SUBTASK_CONVERSATION_STYLES}${SUBTASK_SPECIMEN_STYLES}
*{box-sizing:border-box}body{margin:0;padding:24px;color:var(--ink);background:var(--desk)}
.mw-catalog__specimens{display:grid;gap:24px}.mw-catalog__specimen{margin:0;min-width:0}
.mw-catalog__specimen>figcaption{margin:12px 0;color:var(--muted)}h2{font-size:24px}
</style><script src="../../kit/kit.js"></script></head><body><div id="icons" hidden></div>${section}
<script>
document.getElementById('icons').innerHTML=window.mwKitSprite;
const s=document.createElement('script');s.textContent=window.mwKitClient;document.body.append(s);
const theme=new URLSearchParams(location.search).get('theme')||'light';
document.documentElement.dataset.theme=theme;document.documentElement.dataset.resolvedTheme=theme;
</script></body></html>`);
}
