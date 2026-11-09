// `node --import` this in a process forked during a golden generation (scripts/golden/determinism.mjs): it shares the generation's clock. The statement process takes its
// deadlines from the Host and enforces them on its own clock (apps/local-host/src/project-statement-process.ts), so on a real clock every deadline is months past.
import { GENERATION_START, freezeDate } from "./generation-clock.mjs";

freezeDate(GENERATION_START);
