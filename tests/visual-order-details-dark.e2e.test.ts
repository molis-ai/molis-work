import test from "node:test";
import { auditVisualOrderDetails } from "./fixtures/visual-order-details.js";

test("VUX-46 to VUX-50: detail views and settings screens stay in order in dark mode", { timeout: 3_600_000 }, (t) => auditVisualOrderDetails(t, "dark"));
