import { readFileSync } from "node:fs";
import { COPY_FEEDBACK_CLIENT_SCRIPT, FIELD_FIT_CLIENT_SCRIPT, SCROLL_FOLLOW_CLIENT_SCRIPT, THEME_BOOTSTRAP_SCRIPT } from "@molis-ai/molis-work-design-system";

const IM_BROWSER_SCRIPT = readFileSync(new URL("./im-client.js", import.meta.url), "utf8");

/** Shared page behavior runs before the discussion client on both hosts. */
export const IM_CLIENT_SCRIPT = THEME_BOOTSTRAP_SCRIPT + ";\n" + SCROLL_FOLLOW_CLIENT_SCRIPT + ";\n"
  + COPY_FEEDBACK_CLIENT_SCRIPT + ";\n" + FIELD_FIT_CLIENT_SCRIPT + ";\n" + IM_BROWSER_SCRIPT;
