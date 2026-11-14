// The package's public entries. Host assembly and the observation tests use these; the read-back functions are package-internal
// until batch 29 turns them into actions with their own audience rules (contract-design §1).
export { OBSERVATION_HOME_STORE } from "./schema.js";
export { withObservationSource, currentObservationSource, type ObservationScopeClass } from "./source-scope.js";
export { observationKeys, OBSERVATION_EVIDENCE_KEY_REF, OBSERVATION_DIGEST_KEY_REF } from "./keys.js";
export { type ObservationEnvironment } from "./records.js";
export { type ExitAction, type ExitObservation } from "./exit.js";
export { clearObservationProjectFile, purgeObservationPluginFile, type PluginPurge } from "./lifecycle.js";
export { ObservationLayer } from "./service.js";
export { readRecords, readCoverage, readCoverageGaps } from "./queries.js";
export { snapshotText } from "./evidence.js";
export { OBSERVATION_COVERAGE_PLAN } from "./coverage-plan.js";
