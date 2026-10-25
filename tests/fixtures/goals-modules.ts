/**
 * Goals' two fact modules as the tests reach them (PG-094 S9-3). They are code inside the Goals plugin's package now (`src/module/`,
 * `src/governance/`), so a test that exercises a module on its own imports it from here, not from the package by name: when the
 * plugin's code moves again, one file changes, and no test file adds itself to the plugin package's outside mentions.
 */
export * from "@molis-ai/molis-work-plugin-goals/module";
export * from "@molis-ai/molis-work-plugin-goals/governance";
export * as goalsModuleExports from "@molis-ai/molis-work-plugin-goals/module";
export * as governanceModuleExports from "@molis-ai/molis-work-plugin-goals/governance";
