import type { TreeNode } from "./computer-driver.js";

const ROLE_NAMES: Readonly<Record<string, string>> = {
  AXButton: "按钮", AXTextField: "文本框", AXTextArea: "文本区", AXStaticText: "文字", AXCheckBox: "复选框", AXRadioButton: "单选按钮",
  AXPopUpButton: "弹出菜单", AXMenuButton: "菜单按钮", AXLink: "链接", AXTab: "标签", AXRow: "行", AXCell: "单元格", AXImage: "图像",
  AXSlider: "滑块", AXComboBox: "组合框", AXMenuItem: "菜单项", AXMenuBarItem: "菜单", AXGroup: "组", AXScrollArea: "滚动区",
  AXTable: "表格", AXOutline: "大纲", AXList: "列表", AXToolbar: "工具栏", AXWebArea: "网页区域", AXHeading: "标题",
  AXDisclosureTriangle: "展开按钮", AXIncrementor: "步进器", AXSegmentedControl: "分段控件", AXSwitch: "开关", AXSheet: "表单",
  AXDialog: "对话框", AXPopover: "浮层", AXWindow: "窗口",
};

/** The role the tree text shows; a secure or search field keeps its specific name. */
export function roleName(node: TreeNode): string {
  if (node.subrole === "AXSecureTextField") return "密码框";
  if (node.subrole === "AXSearchField") return "搜索框";
  return ROLE_NAMES[node.role] ?? node.role.replace(/^AX/u, "");
}

/** A coordinate from an accessibility-tree look is not reused after this long. */
export const OBSERVATION_TTL_MS = 10_000;

const CONTAINERS = new Set(["AXGroup", "AXScrollArea", "AXWindow", "AXToolbar", "AXList", "AXTable", "AXOutline", "AXWebArea"]);

/** A container with no name, value or secure text: indentation already says where its children sit. */
export function isUnnamedContainer(node: TreeNode): boolean {
  return CONTAINERS.has(node.role) && !node.name && !node.value && !node.secure;
}

export function observationExpired(observedAt: number | null, now: number): boolean {
  return observedAt !== null && now - observedAt > OBSERVATION_TTL_MS;
}

/** A control the model can be asked to hit: a real frame, enabled, and not a label or a container. */
export function nodeIsClickable(node: TreeNode): boolean {
  const frame = node.frame;
  if (!frame || frame[2] <= 0 || frame[3] <= 0 || node.disabled) return false;
  if (node.role === "AXStaticText" || CONTAINERS.has(node.role)) return false;
  return true;
}

/** Why a window picture would be offered: the tree was cut, or nothing in it can be clicked. A complete tree offers none. */
export function modelImageReason(nodes: readonly TreeNode[], cut: boolean): "truncated" | "no-clickable" | null {
  if (cut) return "truncated";
  if (!nodes.some(nodeIsClickable)) return "no-clickable";
  return null;
}

type NodeTree = { nodes: TreeNode[] };

/**
 * `保存`, `按钮:保存` (localized or AX role), or `~保存` (the name contains it, case-insensitively): resolved on the tree
 * read at injection time. The selector comes from the model, which page text can steer, so it is never compiled into a
 * pattern: a plain substring test stays linear over the whole tree (S-25).
 */
function selector(trimmed: string): (node: TreeNode) => boolean {
  if (trimmed.startsWith("~")) {
    const fragment = trimmed.slice(1).trim().toLowerCase();
    if (!fragment) throw new Error("「~」后面要写名称里的一段文字");
    return node => (node.name ?? "").toLowerCase().includes(fragment);
  }
  const colon = trimmed.indexOf(":");
  if (colon > 0) {
    const role = trimmed.slice(0, colon).trim();
    const name = trimmed.slice(colon + 1).trim();
    return node => (node.role === role || node.subrole === role || roleName(node) === role) && (node.name ?? "").trim() === name;
  }
  return node => (node.name ?? "").trim() === trimmed;
}

/**
 * The center of node `[index]` in the tree just read, relative to the window's origin. A node can also be named by
 * its name (`保存`), role and name (`按钮:保存`) or a part of its name (`~保存`); the tree read at injection is the one
 * resolved. A missing or ambiguous node is not clicked at an older coordinate.
 */
export function pointerFromNode(nodeId: string, tree: NodeTree, windowFrame: readonly [number, number, number, number]): { x: number; y: number } {
  const trimmed = nodeId.trim();
  if (!trimmed) throw new Error("请给出节点编号或控件名称");
  const index = Number(/^\[(\d+)\]$/u.exec(trimmed)?.[1] ?? "");
  let node: TreeNode | undefined;
  if (Number.isInteger(index) && index >= 1) node = tree.nodes[index - 1];
  else {
    const match = selector(trimmed);
    const matches = tree.nodes.filter(one => nodeIsClickable(one) && match(one));
    if (matches.length === 0) throw new Error(`这个窗口里没有「${trimmed}」这个可点的控件，请先重新观察`);
    if (matches.length > 1) throw new Error(`「${trimmed}」在这个窗口里有 ${matches.length} 个可点的控件，请用「角色:名称」或坐标说清是哪一个`);
    node = matches[0];
  }
  const frame = node?.frame;
  if (!frame || frame[2] <= 0 || frame[3] <= 0) throw new Error("这个节点已经不在当前窗口里，请重新观察");
  const [ox, oy] = windowFrame;
  return { x: Math.round(frame[0] - ox + frame[2] / 2), y: Math.round(frame[1] - oy + frame[3] / 2) };
}
