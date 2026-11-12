import type { HostSurfaceDriver } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import { reviewText, type ReviewWord, type ReviewWords } from "../review-presentation.js";

type DescribeDriver = Pick<HostSurfaceDriver, "describePoint" | "describeNode" | "focusedField"> | undefined;
export interface SurfaceReviewDetail { readonly raw: string; readonly words: ReviewWords }

const word = (key: string, args?: Record<string, string | number>) => reviewText("surface." + key, args);
const detail = (raw: string, ...words: ReviewWord[]): SurfaceReviewDetail => ({ raw, words: words.length ? words : [raw] });

async function typedText(driver: DescribeDriver, typed: string | undefined): Promise<SurfaceReviewDetail> {
  const field = driver?.focusedField ? await driver.focusedField().catch(() => ({ label: "", sensitive: false })) : { label: "", sensitive: false };
  const at = field.label ? "在「" + field.label + "」里输入" : "在当前输入框里输入";
  const place = field.label ? [word("input-in-field"), " ", field.label] : [word("input-in-current-field")];
  if (typed === undefined) return detail(at + "文字（内容读不到，请拒绝后让助理重新说明）", ...place, " · ", word("input-unreadable"));
  const chars = [...typed];
  if (field.sensitive) return detail(at + " " + chars.length + " 个字。这是密码类输入框，内容已遮住。", ...place, " · ", word("input-masked", { count: chars.length }));
  const clipped = chars.length > 2000, visible = clipped ? chars.slice(0, 2000).join("") : typed;
  return detail(at + "：\n" + visible + (clipped ? "\n……（共 " + chars.length + " 字，只显示前 2000 字）" : ""),
    ...place, ":\n", visible, ...(clipped ? ["\n", word("input-clipped", { count: chars.length })] : []));
}

function pointerVerb(button?: string, clicks = 1) {
  return button === "right" ? { raw: "右键点击", word: word("pointer-right") }
    : clicks > 1 ? { raw: "双击", word: word("pointer-double") } : { raw: "点击", word: word("pointer-click") };
}

async function pointerDetail(driver: DescribeDriver, summary: string, desktop: boolean): Promise<SurfaceReviewDetail> {
  const point = /at (\d+),(\d+)/u.exec(summary), clicks = /\((\d+)×(\w+)\)/u.exec(summary);
  const label = point && driver?.describePoint ? await driver.describePoint(Number(point[1]), Number(point[2])).catch(() => "") : "";
  const verb = pointerVerb(clicks?.[2], Number(clicks?.[1] ?? 1));
  if (label) return detail(verb.raw + "「" + label + "」", verb.word, " ", label);
  if (!point) return detail(verb.raw, verb.word);
  const x = point[1]!, y = point[2]!;
  return detail(verb.raw + (desktop ? "窗口里的位置" : "页面上的位置") + "（" + x + ", " + y + "）",
    verb.word, " ", word(desktop ? "window-position" : "page-position", { x, y }));
}

async function browserPointer(driver: DescribeDriver, summary: string): Promise<SurfaceReviewDetail> {
  // This token is the SDK's labelOf for this effect. It is only used to ask for a display label.
  const node = /^click node (\S+) \(([1-3])×(left|right|middle)\); the point is read from the tree at injection$/u.exec(summary);
  if (!node) return summary.startsWith("click node ") ? detail("页面目标已不可用，请拒绝后重新观察页面。", word("node-unavailable")) : pointerDetail(driver, summary, false);
  const verb = pointerVerb(node[3], Number(node[2])), label = await driver?.describeNode?.(node[1]!).catch(() => "");
  return label ? detail(verb.raw + "「" + label + "」", verb.word, " ", label)
    : detail(verb.raw + "的页面目标已不可用，请拒绝后重新观察页面。", word("node-unavailable"));
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
    case "pointer": return pointerDetail(driver, summary, true);
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
