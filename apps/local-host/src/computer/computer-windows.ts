/**
 * The app's Window menu, when it has one (specs/computer-use §9, CU-G09). macOS lists the app's open windows there;
 * choosing one with the existing typed `menu` action makes it the window the next look reads. Only titles that match
 * the app's own windows are offered, so commands such as Minimize are not mistaken for another window.
 */
import { showsMolis } from "./app-tiers.js";

type Helper = { call<T>(op: string, payload?: Record<string, unknown>): Promise<T> };

const WINDOW_MENU = /^(window|窗口)$/iu;
const MAX_WINDOWS = 12;

export async function windowMenuHint(helper: Helper, pid: number, menus: readonly string[], windows: readonly string[]): Promise<string> {
  const menu = menus.find(title => WINDOW_MENU.test(title.trim()));
  const titles = new Set(windows.map(title => title.trim()).filter(title => title.length > 0 && !showsMolis(title)));
  if (!menu || titles.size < 2) return "";
  const opened = await helper.call<{ items?: readonly { title?: string; enabled?: boolean }[] }>("observe.menus", { pid, path: [menu] }).catch(() => null);
  const items = (opened?.items ?? [])
    .filter((item): item is { title: string; enabled?: boolean } => item.enabled !== false && Boolean(item.title && titles.has(item.title)))
    .slice(0, MAX_WINDOWS);
  if (items.length === 0) return "";
  // The menu path is matched exactly, so a window title in the example must not be shortened.
  const named = items.map(item => item.title);
  return `\n\n这个应用的「${menu}」菜单列着这些窗口：${named.join("、")}。要切到另一个窗口，用 surface-act 的 menu 动作按路径选，例如 ["${menu}", "${named[0] ?? ""}"]；切开之后先重新观察。`;
}
