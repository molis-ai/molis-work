import { createHash } from "node:crypto";

// The names a sandboxed package's model settings and image connections live under (BL-491). The package never writes them: the Host derives them from the
// installation id (the one key every piece of a package's data has: its files, its model choice and these), 32 hex digits of its SHA-256 (128 bits), so two installations never share one and a package cannot choose one. A library of an installed plugin may not
// be named with a reserved prefix (`reservedHomeName`, used by the ledger's `holderOf` for both opening a library and listing the ledger), so no package
// can squat a name the platform derives for another.

/** The namespace the person's image connections of this plugin are bound under (`connectors.db`, scope `home`). */
export const IMAGE_CONNECTIONS_PREFIX = "imageconn-";
/** The id the model settings give a consumer's own provider; a sandboxed package may not create or choose it, so it only ever names a refusal. */
export const SANDBOX_PROVIDER_PREFIX = "sbx-";
export const RESERVED_HOME_NAME_PREFIXES: readonly string[] = [IMAGE_CONNECTIONS_PREFIX, SANDBOX_PROVIDER_PREFIX];

const digest = (installId: string): string => createHash("sha256").update(installId).digest("hex").slice(0, 32);

export const sandboxImageNamespace = (installId: string): string => IMAGE_CONNECTIONS_PREFIX + digest(installId);
export const sandboxProviderId = (installId: string): string => SANDBOX_PROVIDER_PREFIX + digest(installId);

/** Whether an id is one the Host derives as a sandboxed package's own provider (refused where a shipped plugin declares its provider). */
export const sandboxProviderName = (id: string): boolean => id.startsWith(SANDBOX_PROVIDER_PREFIX);
/** Whether a store name is one the Host derives as a sandboxed package's image namespace (refused where a shipped plugin declares its image store). */
export const sandboxImageNamespaceName = (name: string): boolean => name.startsWith(IMAGE_CONNECTIONS_PREFIX);

/** Whether a top-level name of the Home is one the platform derives for a sandboxed package (the only function that says so). */
export const reservedHomeName = (name: string): boolean => RESERVED_HOME_NAME_PREFIXES.some(prefix => name.startsWith(prefix));
