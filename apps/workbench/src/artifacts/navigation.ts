/** Platform navigation, independent of project Plugin membership or any Manifest. */
export const ARTIFACT_NAVIGATION = {
  id: "artifacts", surface: "artifacts", label: "成果", label_en: "Artifacts", glyph: "package", group: "make", rail: null,
  pinned_default: false, chosen: false, order: 60, hue: "pink", hint: "项目的固定成果，各版本可回看。",
} as const;
