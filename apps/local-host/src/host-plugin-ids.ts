import { ARTIFACTS_PROVIDER_ID } from "@molis-ai/molis-work-module-artifacts";
import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";
import { bundledPackagesDirectory, releasePackageIds } from "./bundled-packages.js";
import { HOST_SURFACE_REGISTRATIONS } from "./host-surfaces.js";

/**
 * The `plugin_id` of every plugin this build ships (S-75, ac-trust T6). A Runtime is given this set so that an install of any other
 * trust level cannot take one of these ids or nest under one, whichever project or Home the plugin is installed in.
 */
export const HOST_PLUGIN_IDS: ReadonlySet<string> = new Set([...PLATFORM_PLUGIN_REGISTRATIONS.map(entry => entry.manifest.plugin_id), ...HOST_SURFACE_REGISTRATIONS.map(entry => entry.manifest.plugin_id), ARTIFACTS_PROVIDER_ID,
  // Files retired in batch 06 (its content is the platform materials service now). Homes it ran in still hold its install rows, event
  // cursors and history under this id until their deletion step, so no other package may take the id or nest under it.
  "io.molis.work.files"]);

/**
 * The release's own bundled packages under the Host's prefix (the official Skill packs, signed by this Home until the release has a
 * publisher key of its own): the only ids under `io.molis.work.` that an install without the build's trust may take (S-reserved-host-prefix).
 * The install preview lets such an id in only from the bundled folder itself, so an import from elsewhere cannot take one.
 */
export const RELEASE_PACKAGE_IDS: ReadonlySet<string> = releasePackageIds(bundledPackagesDirectory());
