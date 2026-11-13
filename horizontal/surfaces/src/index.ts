export {
  createSurfaceCorrections, type SurfaceCorrection,
  type SurfaceCorrections, type SurfaceCorrectionsDatabase, type SurfaceCorrectionsSnapshot,
} from "./corrections.js";
export { SURFACE_CORRECTIONS_SCHEMA_SQL } from "./schema.js";
export { SurfaceCompositionService } from "./composition.js";
export type { SurfaceActionDirectory, SurfaceComposePorts, SurfaceCorrectPorts, SurfaceHomePlugin, SurfaceHomePorts, SurfacePlugin, SurfaceRelation } from "./ports.js";

export { readSurfaceValues, startDeadline as startSurfaceRead } from "./values.js";
export { isSurfaceFallbackReader, readSurfaceSubject, type SurfaceFallbackProof, type SurfaceSubjectSummary } from "./fallback.js";
