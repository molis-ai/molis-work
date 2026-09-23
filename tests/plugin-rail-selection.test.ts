import assert from "node:assert/strict";
import test from "node:test";

import { MICRO_INTERACTION_CLIENT_SCRIPT, segmentThumbOffsets } from "../packages/design-system/src/styles/micro-interactions.ts";

const market = { left: 5.5, top: 931, width: 36, height: 32 };
const track = { left: 0, top: 230 };

test("plugin rail thumb uses content coordinates when the rail is scrolled", () => {
  const scrolled = segmentThumbOffsets(market, track, 0, 0, 0, 187);
  assert.equal(scrolled.y, 888);
  assert.equal(scrolled.x, 5.5);
  assert.equal(scrolled.w, 36);
  assert.equal(scrolled.h, 32);

  const atTop = segmentThumbOffsets(market, track, 0, 0, 0, 0);
  assert.equal(atTop.y, market.top - track.top);
});

test("plugin rail thumb script measures through the same offset function", () => {
  assert.match(MICRO_INTERACTION_CLIENT_SCRIPT, /const segmentThumbOffsets = function segmentThumbOffsets/);
  assert.match(MICRO_INTERACTION_CLIENT_SCRIPT, /segmentThumbOffsets\(slot, box, parseFloat\(style\.borderLeftWidth\) \|\| 0, parseFloat\(style\.borderTopWidth\) \|\| 0, track\.scrollLeft, track\.scrollTop\)/);
});
