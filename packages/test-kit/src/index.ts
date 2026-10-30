export {
  APP_IMPORT_ALLOWLIST,
  PLUGIN_MODULE_IMPORT_ALLOWLIST,
  PRIVATE_UI_EXEMPT_PLUGINS,
  evaluateImportBoundary,
  extractImportSpecifiers,
  findDependencyCycles,
  unusedLayerExceptions,
} from "./boundaries.js";
export type {
  BoundaryPackage,
  BoundaryPackageKind,
  BoundaryViolation,
  BoundaryViolationCode,
  ImportObservation,
} from "./boundaries.js";

/** F2 created the package boundary; F3 adds the first real, business-neutral capability; the `./browser` subpath adds the Chrome driver and `./local-host-http` the Host HTTP client. */
