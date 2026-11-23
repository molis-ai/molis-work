import test from "node:test";
import { auditChineseLayers } from "./fixtures/chinese-layers.js";
import { WIDTHS } from "./fixtures/chinese-walk.js";

test("VUX-40 (Chinese): menus, popovers, and dialogs fit long Chinese names at 390 px", { timeout: 3_600_000 }, (t) => auditChineseLayers(t, WIDTHS[2]!));
