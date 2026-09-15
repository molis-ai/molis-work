import { randomUUID } from "node:crypto";
import type { WorkSessionApi } from "@molis-ai/molis-work-contracts/modules/private-work-context";

const FLUSH_BYTES = 32 * 1024;
const FLUSH_DELAY_MS = 250;

interface BufferedOutput {
  sessionId: string;
  panelId: string;
  chunks: string[];
  bytes: number;
  sequence: number;
  timer: ReturnType<typeof setTimeout> | null;
}

export class SessionTuiRecorder {
  private readonly recordingId = randomUUID();
  private readonly buffers = new Map<string, BufferedOutput>();
  private closed = false;

  constructor(
    private readonly registry: WorkSessionApi,
    private readonly onError: (error: Error) => void = () => undefined,
  ) {}

  recordOutput(panelId: string, sessionId: string, data: string): void {
    if (this.closed || !panelId.trim() || !sessionId.trim() || !data) return;
    const clean = stripTerminalControl(data);
    if (!clean) return;
    let buffer = this.buffers.get(panelId);
    if (!buffer || buffer.sessionId !== sessionId) {
      if (buffer) this.flushPanel(panelId);
      buffer = {
        sessionId,
        panelId,
        chunks: [],
        bytes: 0,
        sequence: 0,
        timer: null,
      };
      this.buffers.set(panelId, buffer);
    }
    buffer.chunks.push(clean);
    buffer.bytes += Buffer.byteLength(clean, "utf8");
    if (buffer.bytes >= FLUSH_BYTES) {
      this.flushPanel(panelId);
      return;
    }
    buffer.timer ??= setTimeout(() => this.flushPanel(panelId), FLUSH_DELAY_MS);
  }

  recordExit(
    panelId: string,
    sessionId: string,
    exit: { exitCode: number; signal: number },
  ): void {
    if (this.closed) return;
    this.flushPanel(panelId);
    try {
      this.registry.appendEvent({
        session_id: sessionId,
        source: "goalboard_tui",
        kind: "status",
        source_id: `${panelId}:${this.recordingId}:exit`,
        source_order: Number.MAX_SAFE_INTEGER,
        content: exit.signal
          ? `终端进程已退出（signal ${exit.signal}）`
          : `终端进程已退出（退出码 ${exit.exitCode}）`,
        metadata: {
          panel_id: panelId,
          exit_code: exit.exitCode,
          signal: exit.signal,
          partial_terminal_history: true,
        },
      });
    } catch (error) {
      this.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }

  flush(): void {
    for (const panelId of [...this.buffers.keys()]) this.flushPanel(panelId);
  }

  close(): void {
    if (this.closed) return;
    this.flush();
    this.closed = true;
  }

  private flushPanel(panelId: string): void {
    const buffer = this.buffers.get(panelId);
    if (!buffer || buffer.chunks.length === 0) return;
    if (buffer.timer) clearTimeout(buffer.timer);
    buffer.timer = null;
    const content = buffer.chunks.join("");
    buffer.chunks = [];
    buffer.bytes = 0;
    const sequence = buffer.sequence++;
    try {
      this.registry.appendEvent({
        session_id: buffer.sessionId,
        source: "goalboard_tui",
        kind: "terminal_output",
        source_id: `${buffer.panelId}:${this.recordingId}:output:${sequence}`,
        source_order: sequence,
        content,
        metadata: {
          panel_id: buffer.panelId,
          partial_terminal_history: true,
        },
      });
    } catch (error) {
      this.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}

/** Strip ANSI CSI/OSC sequences and remaining C0 controls except line layout. */
export function stripTerminalControl(value: string): string {
  return value
    .replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/gu, "")
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001a\u001c-\u001f\u007f]/gu, "");
}
