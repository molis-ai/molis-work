import { createHash } from "node:crypto";

// The names a sandboxed package's model settings and image connections live under (BL-491). The package never writes them: the Host derives them from the
// plugin id, 32 hex digits of its SHA-256 (128 bits), so two plugins never share one and a package cannot choose one. A library of an installed plugin may not
// be named with a reserved prefix (`reservedHomeName`, used by the ledger's `holderOf` for both opening a library and listing the ledger), so no package
// can squat a name the platform derives for another.

/** The namespace the person's image connections of this plugin are bound under (`connectors.db`, scope `home`). */
export const IMAGE_CONNECTIONS_PREFIX = "imageconn-";
/** The id the model settings give a consumer's own provider; a sandboxed package may not create or choose it, so it only ever names a refusal. */
export const SANDBOX_PROVIDER_PREFIX = "sbx-";
export const RESERVED_HOME_NAME_PREFIXES: readonly string[] = [IMAGE_CONNECTIONS_PREFIX, SANDBOX_PROVIDER_PREFIX];

const digest = (pluginId: string): string => createHash("sha256").update(pluginId).digest("hex").slice(0, 32);

export const sandboxImageNamespace = (pluginId: string): string => IMAGE_CONNECTIONS_PREFIX + digest(pluginId);
export const sandboxProviderId = (pluginId: string): string => SANDBOX_PROVIDER_PREFIX + digest(pluginId);

/** Whether a top-level name of the Home is one the platform derives for a sandboxed package (the only function that says so). */
export const reservedHomeName = (name: string): boolean => RESERVED_HOME_NAME_PREFIXES.some(prefix => name.startsWith(prefix));
