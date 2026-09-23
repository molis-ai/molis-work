import { execFile } from "node:child_process";
import { statSync } from "node:fs";
import path from "node:path";

/** What the Workspace form can show after the system folder window closes. */
export type DirectoryPickResult =
  | { status: "picked"; path: string }
  | { status: "cancelled" }
  | { status: "busy" }
  | { status: "unavailable"; message: string };

export interface DirectoryPickerCommandResult {
  stdout: string;
  stderr: string;
  code: number;
  missing?: boolean;
  timedOut?: boolean;
}

export type DirectoryPickerRun = (
  command: string,
  args: readonly string[],
) => Promise<DirectoryPickerCommandResult>;

const PROMPT = "选择要关联到当前项目的目录";
const OPEN_FAILED = "这台电脑打不开目录选择窗口";
const NOT_A_DIRECTORY = "选中的路径不是这台电脑上的目录";
const TIMED_OUT = "目录选择超时，请再试一次";

function appleString(value: string): string {
  return `"${value.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"")}"`;
}

function dialogCommand(): { command: string; args: string[] } | null {
  if (process.platform === "darwin") {
    const script = [
      "try",
      `POSIX path of (choose folder with prompt ${appleString(PROMPT)} default location (path to home folder))`,
      "on error number -128",
      "\"\"",
      "end try",
    ].join("\n");
    return { command: "osascript", args: ["-e", script] };
  }
  if (process.platform === "linux") {
    return { command: "zenity", args: ["--file-selection", "--directory", "--title", PROMPT] };
  }
  if (process.platform === "win32") {
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms",
      "$dialog = New-Object System.Windows.Forms.FolderBrowserDialog",
      `$dialog.Description = '${PROMPT.replaceAll("'", "''")}'`,
      "$dialog.UseDescriptionForTitle = $true",
      "if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { Write-Output $dialog.SelectedPath }",
    ].join("\n");
    return { command: "powershell.exe", args: ["-NoProfile", "-STA", "-Command", script] };
  }
  return null;
}

/** The last non-empty line, without a trailing separator, when it is absolute. */
export function cleanPickedPath(raw: string): string | null {
  const line = raw.split(/\r?\n/).map((item) => item.trim()).filter(Boolean).at(-1) ?? "";
  if (!line || line.includes("\0")) return null;
  const value = line.length > 1 && !/^[A-Za-z]:\\$/.test(line) ? line.replace(/[/\\]+$/, "") : line;
  return path.isAbsolute(value) ? value : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

async function defaultRun(command: string, args: readonly string[]): Promise<DirectoryPickerCommandResult> {
  try {
    const { stdout, stderr } = await execFile(command, args, {
      encoding: "utf8",
      timeout: 5 * 60_000,
      windowsHide: false,
    });
    return { stdout: text(stdout), stderr: text(stderr), code: 0 };
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
      code?: number | string;
      killed?: boolean;
      signal?: NodeJS.Signals;
    };
    if (failure.code === "ENOENT") return { stdout: "", stderr: "", code: 1, missing: true };
    if (failure.killed || failure.signal === "SIGTERM" || failure.code === "ETIMEDOUT") {
      return { stdout: "", stderr: "", code: 1, timedOut: true };
    }
    return {
      stdout: text(failure.stdout),
      stderr: text(failure.stderr),
      code: typeof failure.code === "number" ? failure.code : 1,
    };
  }
}

export function createDirectoryPicker(run: DirectoryPickerRun = defaultRun) {
  let pending: Promise<DirectoryPickResult> | null = null;
  const open = async (): Promise<DirectoryPickResult> => {
    const command = dialogCommand();
    if (!command) return { status: "unavailable", message: OPEN_FAILED };
    const result = await run(command.command, command.args);
    if (result.missing) return { status: "unavailable", message: OPEN_FAILED };
    if (result.timedOut) return { status: "unavailable", message: TIMED_OUT };
    if (!result.stdout.trim()) {
      return result.code === 0 || result.code === 1
        ? { status: "cancelled" }
        : { status: "unavailable", message: OPEN_FAILED };
    }
    const picked = cleanPickedPath(result.stdout);
    if (!picked) return { status: "unavailable", message: NOT_A_DIRECTORY };
    try {
      if (!statSync(picked).isDirectory()) return { status: "unavailable", message: NOT_A_DIRECTORY };
    } catch {
      return { status: "unavailable", message: NOT_A_DIRECTORY };
    }
    return { status: "picked", path: picked };
  };
  return {
    pick(): Promise<DirectoryPickResult> {
      if (pending) return Promise.resolve({ status: "busy" });
      const task = open().finally(() => {
        pending = null;
      });
      pending = task;
      return task;
    },
  };
}

const shared = createDirectoryPicker();

/** One system folder window for this host process. */
export function pickLocalDirectory(): Promise<DirectoryPickResult> {
  return shared.pick();
}
