import type { PluginBoardSpecimen, PluginBoardSpecimenPorts } from "@molis-ai/molis-work-contracts/platform/plugin-registration";
import type { ShelfItemGroup, ShelfItemKind, ShelfItemRecord } from "@molis-ai/molis-work-module-shelf/contract";
import { renderRow, stageFold } from "./ui.js";

/**
 * Shelf's media rows on the component board (specs/visual-ui-experience VUX-39): a picture, a long-named picture, a recording
 * and a voice note as Shelf files them (by the kind it gives a file), and a result whose run failed, drawn by the rows' own
 * renderer in their groups. Sample names, never a real material.
 */
type Sample = readonly [zh: string, en: string, mixed: string];
const ROWS: ReadonlyArray<readonly [id: string, kind: ShelfItemKind, mime: string, group: ShelfItemGroup, name: Sample, failed?: true]> = [
  ["board-photo", "image", "image/png", "material", ["白板照片.png", "whiteboard-photo.png", "白板 photo.png"]],
  ["board-shot", "image", "image/png", "material", ["首次使用记录-截图-导入向导第一步-2026-10-23-上午.png", "first-use-notes-screenshot-import-wizard-step-one-2026-10-23-morning.png", "首次使用 notes-screenshot-import wizard 第一步-2026-10-23.png"]],
  ["board-video", "file", "video/mp4", "material", ["试用录屏-第一次导入.mp4", "trial-recording-first-import.mp4", "试用 recording-第一次导入.mp4"]],
  ["board-audio", "file", "audio/mp4", "material", ["访谈录音-王一骏.m4a", "interview-wang-yijun.m4a", "interview 录音-王一骏.m4a"]],
  ["board-transcript", "markdown", "text/markdown", "result", ["访谈录音-转写.md", "interview-transcript.md", "interview 录音-转写.md"], true],
];
const WORDS = { zh: 0, en: 1, mixed: 2 } as const;

export function shelfBoardSpecimens(p: PluginBoardSpecimenPorts): readonly PluginBoardSpecimen[] {
  const item = ([item_id, kind, mime, group, name, failed]: (typeof ROWS)[number]): ShelfItemRecord => ({
    item_id, kind, mime, group, name: name[WORDS[p.sample]], relative_path: failed ? "" : "board/" + item_id, size_bytes: 2_400_000, origin_hash: "", hidden: false,
    created_at: "2026-10-23T09:40:00.000Z", source_item_id: null, source_item_ids: [], job_id: null, preview_text: null, status: failed ? "failed" : "done", failure_reason: failed ? "board" : null, children: [],
  });
  const fold = (id: "materials" | "results", label: string, group: ShelfItemGroup) => {
    const rows = ROWS.filter((row) => row[3] === group);
    return stageFold(p.text(label), id, rows.length, `<ul class="shelf-tree" data-shelf-list="${id}">${rows.map((row) => renderRow(item(row), false, p)).join("")}</ul>`);
  };
  return [{ id: "shelf-media", place: "column", title: p.text("媒体材料行 · 图片、视频、音频与失败的结果"), html: `<div data-shelf="board">${fold("materials", "材料", "material")}${fold("results", "生成结果", "result")}</div>` }];
}
