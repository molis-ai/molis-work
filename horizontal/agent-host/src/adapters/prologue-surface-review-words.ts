import { reviewText, type ReviewWord, type ReviewWords } from "../review-presentation.js";

type DescribeDriver = {
  describeNode?(node: string): Promise<string>;
  focusedField?(): Promise<{ readonly label: string; readonly sensitive: boolean }>;
} | undefined;
export interface SurfaceReviewDetail { readonly raw: string; readonly words: ReviewWords; readonly reviewable: boolean; readonly focus?: string }

const word = (key: string, args?: Record<string, string | number>) => reviewText("surface." + key, args);
const detail = (raw: string, ...words: ReviewWord[]): SurfaceReviewDetail => ({ raw, words: words.length ? words : [raw], reviewable: true });
const unreadable = (raw: string, ...words: ReviewWord[]): SurfaceReviewDetail => ({ ...detail(raw, ...words), reviewable: false });

async function typedText(driver: DescribeDriver, typed: string | undefined): Promise<SurfaceReviewDetail> {
  if (!driver?.focusedField) return unreadable("输入内容或目标无法核对，请拒绝后让助理重新说明。", word("input-unreadable"));
  const field = await driver.focusedField();
  const at = field.label ? "在「" + field.label + "」里输入" : "在当前输入框里输入";
  const place = field.label ? [word("input-in-field"), " ", field.label] : [word("input-in-current-field")];
  if (typed === undefined) return unreadable(at + "文字（内容读不到，请拒绝后让助理重新说明）", ...place, " · ", word("input-unreadable"));
  const chars = [...typed];
  if (field.sensitive) return unreadable(at + " " + chars.length + " 个字。这是密码类输入框，内容已遮住。", ...place, " · ", word("input-masked", { count: chars.length }));
  return detail(at + "：\n" + typed, ...place, ":\n", typed);
}

function pointerVerb(button?: string, clicks = 1) {
  if (button === "right" && clicks === 1) return { raw: "右键点击", word: word("pointer-right") };
  if (button === "left" && clicks === 2) return { raw: "双击", word: word("pointer-double") };
  if ((!button || button === "left") && clicks === 1) return { raw: "点击", word: word("pointer-click") };
  const exact = `${clicks}×${button}`;
  return { raw: exact, word: exact };
}

function pointerDetail(summary: string, desktop: boolean): SurfaceReviewDetail {
  const point = /^click \(([1-3])×(left|right|middle)\) at ([-+\d.e]+),([-+\d.e]+)(\. IRREVERSIBLE(?: \([\s\S]*\))?: this cannot be undone)?$/u.exec(summary);
  if (!point) return unreadable(summary);
  const verb = pointerVerb(point[2], Number(point[1]));
  const x = point[3]!, y = point[4]!, warning = point[5] ?? "";
  return detail(verb.raw + (desktop ? "窗口里的位置" : "页面上的位置") + "（" + x + ", " + y + "）" + warning,
    verb.word, " ", word(desktop ? "window-position" : "page-position", { x, y }), ...(warning ? [warning] : []));
}

const pointerNode = (summary: string) => /^click node ([\s\S]+) \(([1-3])×(left|right|middle)\); the point is read from the tree at injection(\. IRREVERSIBLE(?: \([\s\S]*\))?: this cannot be undone)?$/u.exec(summary);

async function browserPointer(driver: DescribeDriver, summary: string): Promise<SurfaceReviewDetail> {
  // This token is the SDK's labelOf for this effect. It is only used to ask for a display label.
  const node = pointerNode(summary);
  if (!node) return summary.startsWith("click node ") ? unreadable("页面目标已不可用，请拒绝后重新观察页面。", word("node-unavailable")) : pointerDetail(summary, false);
  const verb = pointerVerb(node[3], Number(node[2])), label = await driver?.describeNode?.(node[1]!).catch(() => "");
  return label ? detail(verb.raw + "「" + label + "」", verb.word, " ", label)
    : unreadable(verb.raw + "的页面目标已不可用，请拒绝后重新观察页面。", word("node-unavailable"));
}

const followedBy = (prefix: string, key: string, original: string) => detail(prefix + original, word(key), " ", original);
function waitDetail(summary: string) {
  const original = summary.replace(/^wait /u, ""), ms = /^(.*)ms$/u.exec(original);
  return ms ? detail("等待 " + ms[1] + " 毫秒", word("wait-ms", { ms: ms[1]! })) : followedBy("等待 ", "wait", original);
}

export async function describeBrowserAction(driver: DescribeDriver, action: string, summary: string, typed?: string): Promise<SurfaceReviewDetail> {
  switch (action) {
    case "pointer": return browserPointer(driver, summary);
    case "key": return followedBy("按下 ", "press", summary.replace(/^press /u, ""));
    case "text": return typedText(driver, typed);
    case "navigate": return followedBy("打开 ", "navigate", summary.replace(/^navigate to /u, ""));
    case "wait": return waitDetail(summary);
    case "upload": return followedBy("上传本机文件 ", "upload-file", "/" + summary.replace(/^upload /u, ""));
    case "download": return followedBy("下载到 ", "download-file", "/" + summary.replace(/^download to /u, ""));
    default: return detail(summary);
  }
}

export async function describeDesktopAction(driver: DescribeDriver, action: string, summary: string, typed?: string): Promise<SurfaceReviewDetail> {
  switch (action) {
    case "pointer": {
      const node = pointerNode(summary);
      if (!node) return pointerDetail(summary, true);
      const verb = pointerVerb(node[3], Number(node[2]));
      return detail(verb.raw + "「" + node[1] + "」" + (node[4] ?? ""), verb.word, " ", node[1]!, ...(node[4] ? [node[4]] : []));
    }
    case "key": return followedBy("按下 ", "press", summary.replace(/^press /u, ""));
    case "text": return typedText(driver, typed);
    case "scroll": {
      const point = /^scroll by \(([-\d]+), ([-\d]+)\) points at.*$/u.exec(summary);
      return point ? detail("滚动（横 " + point[1] + "、纵 " + point[2] + " 点；正数表示往右、往下看更多）", word("scroll-points", { x: point[1]!, y: point[2]! })) : detail(summary);
    }
    case "drag": {
      const point = /^drag from (\d+),(\d+) to (\d+),(\d+)$/u.exec(summary);
      return point ? detail("从（" + point[1] + ", " + point[2] + "）拖到（" + point[3] + ", " + point[4] + "）",
        word("drag-points", { x: point[1]!, y: point[2]!, toX: point[3]!, toY: point[4]! })) : detail(summary);
    }
    case "hover": {
      const point = /^move the pointer to (\d+),(\d+)$/u.exec(summary);
      return point ? detail("把鼠标移到（" + point[1] + ", " + point[2] + "）", word("hover-point", { x: point[1]!, y: point[2]! })) : detail(summary);
    }
    case "menu": return followedBy("选择菜单 ", "choose-menu", summary.replace(/^choose menu /u, "").replace(/ > /gu, " › "));
    case "app": return followedBy("打开或切换到应用 ", "switch-app", summary.replace(/^switch to application /u, "").replace(/ \(launching it if needed\)$/u, ""));
    case "wait": return waitDetail(summary);
    case "upload": return followedBy("把本机文件交给应用：", "give-app-file", "/" + summary.replace(/^upload /u, ""));
    case "download": return followedBy("从应用取出文件，存到 ", "save-app-file", "/" + summary.replace(/^download to /u, ""));
    default: return detail(summary);
  }
}

export function surfaceActionWords(verbs: Readonly<Record<string, string>>, action: string, surface: "desktop" | "browser"): ReviewWords {
  return [Object.hasOwn(verbs, action) ? word(surface + "." + action) : action];
}
