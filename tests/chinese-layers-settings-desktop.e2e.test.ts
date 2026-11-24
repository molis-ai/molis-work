import test from "node:test";
import { auditChineseSettings } from "./fixtures/chinese-layers.js";
import { WIDTHS } from "./fixtures/chinese-walk.js";

test("VUX-40 (Chinese): Settings, Project Settings, and Goal views fit long Chinese names at 1440 px", { timeout: 1_800_000 }, (t) => auditChineseSettings(t, WIDTHS[0]!));
