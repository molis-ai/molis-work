// The package's public entries. Host assembly uses `ObservationLayer` and its nine registered actions; the low-level read-back
// functions remain available for direct storage tests (contract-design §1, §16).
export { OBSERVATION_HOME_STORE } from "./schema.js";
export { observationErrors } from "./errors.js";
export { withObservationSource, currentObservationSource, type ObservationScopeClass } from "./source-scope.js";
export { observationKeys, OBSERVATION_EVIDENCE_KEY_REF, OBSERVATION_DIGEST_KEY_REF } from "./keys.js";
export { type ObservationEnvironment } from "./records.js";
export { type ExitAction, type ExitObservation } from "./exit.js";
export { clearObservationProjectFile, purgeObservationPluginFile, type PluginPurge } from "./lifecycle.js";
export { ObservationLayer } from "./service.js";
export { classifyRecordKind, classifyCoverageKind, classifyScopeGroup, type ClassificationShape } from "./classification.js";
export { readRecords, readCoverage, readCoverageGaps } from "./queries.js";
export { snapshotText } from "./evidence.js";
export { OBSERVATION_COVERAGE_PLAN } from "./coverage-plan.js";
