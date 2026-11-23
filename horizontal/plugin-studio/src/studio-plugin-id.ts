/**
 * The id a plugin made in the studio carries from its first draft on (V16): `studio.<build id>`. It stays the same once the plugin
 * is published and installed elsewhere, because installations, data and sync are keyed by it; who made and signed it is said by
 * the signature, never by the name. The Host's own prefix `io.molis.work.` is not open to it (S-reserved-host-prefix).
 */
export const STUDIO_PLUGIN_ID_PREFIX = 'studio.';

export const studioPluginId = (buildId: string): string => STUDIO_PLUGIN_ID_PREFIX + buildId;
