import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { HostSurfaceAction } from "@molis-ai/molis-work-contracts/services/ui-surfaces";
import { refused } from "./computer-errors.js";
import type { DeskContext, Target } from "./computer-driver.js";

/** A new file in the person's Downloads folder, never overwriting one. */
function downloadDestination(to: readonly string[]): string {
  const downloads = path.join(os.homedir(), "Downloads");
  if (to.some(segment => segment === "..")) throw new Error("取出文件的位置不能含「..」");
  const resolved = to.length === 1 ? path.join(downloads, to[0]!) : path.resolve(path.sep, ...to);
  if (path.dirname(resolved) !== downloads) throw new Error("从应用取出的文件只能存进「下载」文件夹");
  if (fs.existsSync(resolved)) throw new Error(`「下载」里已经有 ${path.basename(resolved)}，换个文件名`);
  return resolved;
}

/** One desktop action, after the driver has chosen the point. The landing check runs on that point, immediately before it is sent. */
export async function injectDesktopAction(action: HostSurfaceAction, target: Target, at: (x: number, y: number) => [number, number], pid: number, deps: {
  helper: DeskContext["helper"];
  ctx: DeskContext;
  settled(): Promise<void>;
  landsOnTarget(point: [number, number]): Promise<void>;
  describePoint(x: number, y: number): Promise<string>;
  focusedField(): Promise<{ label: string; sensitive: boolean }>;
}): Promise<void> {
  const { helper, ctx } = deps;
  switch (action.what) {
    case "pointer": {
      await deps.settled();
      await deps.landsOnTarget(at(action.x, action.y));
      const label = await deps.describePoint(action.x, action.y);
      const verb = action.button === "right" ? "右键点击" : action.clicks > 1 ? "双击" : "点击";
      ctx.mark(`在「${target.name}」${verb}${label ? `「${label}」` : `（${action.x}, ${action.y}）`}`, { x: action.x, y: action.y });
      return void await helper.call("input.pointer", { pid, point: at(action.x, action.y), button: action.button, clicks: action.clicks });
    }
    case "hover":
      await deps.settled();
      await deps.landsOnTarget(at(action.x, action.y));
      ctx.mark(`在「${target.name}」把鼠标移到（${action.x}, ${action.y}）`, { x: action.x, y: action.y });
      return void await helper.call("input.hover", { pid, point: at(action.x, action.y) });
    case "scroll":
      await deps.settled();
      await deps.landsOnTarget(at(action.x, action.y));
      ctx.mark(`在「${target.name}」滚动`, { x: action.x, y: action.y });
      return void await helper.call("input.scroll", { pid, point: at(action.x, action.y), dx: action.dx, dy: action.dy });
    case "drag":
      await deps.settled();
      await deps.landsOnTarget(at(action.x, action.y));
      await deps.landsOnTarget(at(action.to_x, action.to_y));
      ctx.mark(`在「${target.name}」从（${action.x}, ${action.y}）拖到（${action.to_x}, ${action.to_y}）`, { x: action.to_x, y: action.to_y });
      return void await helper.call("input.drag", { pid, from: at(action.x, action.y), to: at(action.to_x, action.to_y) });
    case "key":
      await deps.settled();
      ctx.mark(`在「${target.name}」按下 ${action.keys.join(" + ")}`, null);
      return void await helper.call("input.key", { pid, keys: action.keys });
    case "text": {
      await deps.settled();
      const field = await deps.focusedField();
      if (field.sensitive) throw refused("outside-target", "焦点在密码类输入框里：助理不替用户输入密码，请用户自己完成");
      ctx.mark(`在「${target.name}」${field.label ? `的「${field.label}」里` : ""}输入 ${[...action.text].length} 个字`, null);
      return void await helper.call("input.text", { pid, text: action.text });
    }
    case "menu":
      ctx.mark(`在「${target.name}」选择菜单 ${action.path.join(" › ")}`, null);
      return void await helper.call("input.menu", { pid, path: action.path });
    case "wait": {
      const ms = Math.max(0, Math.min(action.ms, 10_000));
      ctx.mark(`等待「${target.name}」（${Math.round(ms / 100) / 10} 秒）`, null);
      return void await new Promise(resolve => setTimeout(resolve, ms));
    }
    case "upload": {
      const file = path.resolve(path.sep, ...action.from);
      ctx.mark(`把本机文件 ${path.basename(file)} 交给「${target.name}」`, null);
      return void await helper.call("file.give", { pid, path: file });
    }
    case "download": {
      const destination = downloadDestination(action.to);
      const document = await helper.call<{ path: string }>("document", { pid });
      if (!document.path) throw new Error(`「${target.name}」的前窗没有对应的文件可取出`);
      ctx.mark(`从「${target.name}」取出 ${path.basename(document.path)}，存到 ${destination}`, null);
      fs.copyFileSync(document.path, destination, fs.constants.COPYFILE_EXCL);
      return;
    }
    case "app":
    case "navigate":
      return;
  }
}
