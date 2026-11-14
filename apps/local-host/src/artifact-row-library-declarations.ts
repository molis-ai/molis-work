import { PLATFORM_PLUGIN_REGISTRATIONS } from "./plugin-registry.js";

/** The built-in Home libraries that pin artifacts on project rows. Apart from the storage policy, which the statement worker loads. */
export function artifactRowLibraryDeclarations() {
  return PLATFORM_PLUGIN_REGISTRATIONS.flatMap(({ manifest }) => {
    const library = manifest.databases?.home;
    return library?.project_rows?.artifact_join ? [{ manifest, library }] : [];
  });
}
