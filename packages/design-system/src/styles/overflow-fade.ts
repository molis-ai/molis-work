import { readFileSync } from "node:fs";
import { OVERFLOW_FADE_SAMPLES, OVERFLOW_FADE_WIDTH } from "../overflow-sides.js";

// One gradient for both sides: a side that has no more gets a zero-wide feather. The direction is a variable so the
// stops are written once for both writing directions.
const alpha = (a: number) => a === 0 ? "#0000" : a === 1 ? "#000" : `rgb(0 0 0/${String(a).replace(/^0/, "")})`;
const share = (p: number, side: string) => p === 1 ? `var(${side})` : `var(${side})*${String(p).replace(/^0/, "")}`;
const fromStart = OVERFLOW_FADE_SAMPLES.map(([p, a]) => `${alpha(a)} ${p === 0 ? "0" : p === 1 ? share(p, "--mw-fs") : `calc(${share(p, "--mw-fs")})`}`);
const fromEnd = [...OVERFLOW_FADE_SAMPLES].reverse().map(([p, a]) => `${alpha(a)} ${p === 0 ? "100%" : `calc(100% - ${share(p, "--mw-fe")})`}`);

export const OVERFLOW_FADE_STYLES = `[data-overflow-fade]{scroll-padding-inline:${OVERFLOW_FADE_WIDTH}px}[data-overflow-fade][data-more]{--mw-fs:0px;--mw-fe:0px;--mw-fd:to right;mask-image:linear-gradient(var(--mw-fd),${[...fromStart, ...fromEnd].join(",")})}[data-overflow-fade][data-more]:dir(rtl){--mw-fd:to left}[data-overflow-fade]:is([data-more=start],[data-more=both]){--mw-fs:${OVERFLOW_FADE_WIDTH}px}[data-overflow-fade]:is([data-more=end],[data-more=both]){--mw-fe:${OVERFLOW_FADE_WIDTH}px}@media (forced-colors:active){[data-overflow-fade][data-more]{mask-image:none;scrollbar-width:thin}}`;

/** The sensor, as the page runs it: the type-checked TypeScript in `src/browser/overflow-fade.ts` (tsconfig.browser.json),
 * bundled by esbuild into `dist/overflow-fade-client.js` when the package builds. This reads it. */
export const OVERFLOW_FADE_CLIENT_SCRIPT = readFileSync(new URL("../overflow-fade-client.js", import.meta.url), "utf8").trim();
