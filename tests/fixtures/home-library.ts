import type { HomePluginDatabaseDeclaration, PluginDefinition } from "@molis-ai/molis-work-contracts/platform/plugin";

/**
 * A definition whose Manifest declares `library` as its library in the Home (`databases.home`), or none: the declaration is the
 * plugin's own, so a test that gives a fixture a library changes the fixture's Manifest, not the Host's start entry.
 */
export function withLibrary(definition: PluginDefinition, library: HomePluginDatabaseDeclaration | undefined): PluginDefinition {
  return { ...definition, manifest: { ...definition.manifest, databases: { ...definition.manifest.databases, home: library } } };
}
