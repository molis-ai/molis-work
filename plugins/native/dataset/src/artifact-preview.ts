import { bindArtifactPreview, defineArtifactPreviewAction } from "@molis-ai/molis-work-contracts/platform/actions";
import { DATASET_ARTIFACT_TYPE_ID, type DatasetRecord } from "@molis-ai/molis-work-contracts/modules/dataset";
import { datasetCsv } from "./search.js";

/** A pinned version of a table as CSV (specs/artifact-positioning A4), read as a table wherever it is shown. */
export const datasetArtifactPreview = defineArtifactPreviewAction("dataset.artifacts.preview", "数据表", ["dataset:read"]);
export const datasetArtifactPreviewHandler = bindArtifactPreview(datasetArtifactPreview, DATASET_ARTIFACT_TYPE_ID, artifact => ({
  title: `${artifact.title}.csv`, media_type: "text/csv", text: datasetCsv({ columns: [], rows: [], ...(artifact.payload as object) } as unknown as DatasetRecord) }));
