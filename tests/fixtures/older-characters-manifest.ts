import type { PluginManifest } from "@molis-ai/molis-work-contracts/platform/plugin";
import { charactersManifest } from "@molis-ai/molis-work-plugin-characters";

/**
 * The Manifest of an install of Characters that was made before the current build, for journeys that start from an older
 * install and check that the Host moves it forward. The Runtime keeps the install record, never the Manifest, so what such a
 * journey needs of this one is the record it leaves: identity, version, grants, install time.
 *
 * A real 1.0.0 had neither import routes, declared actions nor an upgrade range of its own. It named its 角色 type bare (no
 * display name, no preview action), which Manifest parsing refuses now (W3-05-2: a produced 成果 type is named and has a preview
 * query of its own plugin), and a Manifest with no actions cannot give it one. So this older install produces no type and only
 * reads it; the Runtime accepts the Manifest like any other (`tests/builtin-manifests-contract.test.ts` holds that).
 */
export function olderCharactersManifest(): PluginManifest {
  const { upgrade_compatibility: _range, actions: _actions, artifacts, ...current } = structuredClone(charactersManifest);
  return { ...current, version: "1.0.0", artifacts: { produces: [], consumes: artifacts?.consumes ?? [] },
    routes: charactersManifest.routes.filter(route => !route.route_id.startsWith("characters.import") && route.route_id !== "characters.discover") };
}
