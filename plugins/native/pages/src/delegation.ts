import type { ActionDelegationDeclaration } from "@molis-ai/molis-work-contracts/platform/actions";
import { PAGES_FOLDER_KIND, PAGES_SUBJECT_KIND } from "./presentation.js";

const document = { key: "document", title: "文档", title_text: { key: "pages.doc.name" }, kind: PAGES_SUBJECT_KIND, field: "id" };
const folder = { key: "folder", title: "文件夹", title_text: { key: "pages.delegation.folder" }, empty_title: { key: "pages.delegation.root" }, kind: PAGES_FOLDER_KIND, field: "folder_id" };
// Pages cannot prove a nonempty Goal's current project/existence at its final write boundary yet.
const goal = { key: "goal", title: "关联目标", title_text: { key: "pages.delegation.goal" }, empty_title: { key: "pages.delegation.no-goal" }, kind: "goal", field: "goal_id", allowed_values: [""] };
const content = ["title", "body", "markdown", "starred"];

export const pagesDelegations = {
  create: { targets: [{ ...folder, default_value: "" }, { ...goal, default_value: "" }],
    operations: [{ key: "create", title_text: { key: "pages.delegation.create" }, title: "新建文档", fields: [...content, "template_id", "folder_id", "goal_id"], targets: ["folder", "goal"], when: "always" }], control_fields: ["request_id"] },
  update: { targets: [document, folder, goal], operations: [
    { key: "edit", title_text: { key: "pages.delegation.edit" }, title: "编辑文档", fields: content, targets: ["document"], when: content },
    { key: "move", title_text: { key: "pages.delegation.move" }, title: "移动文档", fields: ["folder_id"], targets: ["document", "folder"], when: ["folder_id"] },
    { key: "associate", title_text: { key: "pages.delegation.associate" }, title: "关联目标", fields: ["goal_id"], targets: ["document", "goal"], when: ["goal_id"] },
  ], control_fields: ["expected_version"] },
  promote: { targets: [document, goal], operations: [
    { key: "publish", title_text: { key: "pages.delegation.publish" }, title: "保存固定成果", fields: [], targets: ["document", "goal"], when: "always" },
    { key: "associate", title_text: { key: "pages.delegation.associate" }, title: "关联目标", fields: ["goal_id"], targets: ["document", "goal"], when: "always" },
  ], control_fields: ["expected_version"] },
  delete: { targets: [document], operations: [{ key: "delete", title_text: { key: "pages.delegation.delete" }, title: "删除文档及评论", fields: [], targets: ["document"], when: "always" }], control_fields: [] },
  discard: { targets: [document], operations: [{ key: "discard", title_text: { key: "pages.delegation.discard" }, title: "撤销新建并删除文档及评论", fields: [], targets: ["document"], when: "always" }], control_fields: ["expected_version"] },
} satisfies Readonly<Record<string, ActionDelegationDeclaration>>;
