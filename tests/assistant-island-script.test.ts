import assert from "node:assert/strict";
import test from "node:test";
import { ASSISTANT_ISLAND_FACTORY_SCRIPT } from "../apps/workbench/src/scripts/client/assistant-island.js";

// The bottom bar's client script is one template string: a single slip (a name declared twice, an unescaped newline)
// stops the whole Assistant, search and plugin switching with it, and only a browser run would show it otherwise.
test("the Assistant's bottom-bar script parses as one function", () => {
  assert.doesNotThrow(() => new Function(`return (${ASSISTANT_ISLAND_FACTORY_SCRIPT});`));
});

// What the person did not write must not reach the Host as something they typed (memory's 「你说过」 rests on it): the Send the bottom bar composes itself
// carries the page's mark, and so does a plugin's hand-over that goes out on a click. A Send added later without the mark fails here.
test("every Send the bottom bar writes itself is marked as the page's; only the composer's own Send can carry the person's words", () => {
  const script = ASSISTANT_ISLAND_FACTORY_SCRIPT;
  // The argument of each api("/send", "POST", …) call: up to the parenthesis that closes it, skipping what is inside quotes.
  const calls = [...script.matchAll(/api\("\/send", "POST", /g)].map(found => {
    const start = found.index! + found[0].length;
    let depth = 1, quote = "", index = start;
    for (; index < script.length && depth > 0; index += 1) {
      const char = script[index]!;
      if (quote) { if (char === "\\") index += 1; else if (char === quote) quote = ""; }
      else if (char === '"' || char === "'") quote = char;
      else if (char === "(") depth += 1;
      else if (char === ")") depth -= 1;
    }
    return script.slice(start, index - 1).trim();
  });
  assert.equal(calls.length, 3, "the bottom bar sends from three places: the browser hand-back, the stale card's redo, and the composer");
  assert.equal(calls.filter(call => call === "body").length, 1, "the composer sends the body it builds");
  for (const call of calls.filter(call => call !== "body")) assert.match(call, /written_by: "page"/, call.slice(0, 100));
  assert.match(script, /const body = \{[^\n]*\.\.\.\(byPage \? \{ written_by: "page" \} : \{\}\)/, "the composer marks a hand-over the person neither wrote nor changed");
  assert.match(script, /pageText = message\.text && input\.value\.trim\(\);/, "a hand-over with words is remembered as the page's until it is sent");
});
