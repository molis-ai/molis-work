import { createServer, type Server } from "node:http";
import type { ModelApiFormat } from "@molis-ai/molis-work-contracts/modules/model-providers";
import { withConnectorConnections, type LocalWebCatalogRunner } from "@molis-ai/molis-work-app-local-host";
import { runWithMolisWorkHome } from "@molis-ai/molis-work-storage";

export const DEFAULT_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";
export const DEFAULT_GEMINI_MODEL_ID = "gemini-2.5-flash";
export const DEFAULT_GEMINI_API_FORMAT: ModelApiFormat = "openai-chat-completions";
export const STAND_IN_DUMMY_TOKEN = "stand-in-eval-token-not-a-secret";

export interface StandInModelServer {
  readonly baseUrl: string;
  readonly requestCount: () => number;
  close(): Promise<void>;
}

function renderSseReply(modelId: string, content: string): string {
  const first = JSON.stringify({
    id: "eval-stand-in-1",
    object: "chat.completion.chunk",
    model: modelId,
    choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: null }],
  });
  const final = JSON.stringify({
    id: "eval-stand-in-1",
    object: "chat.completion.chunk",
    model: modelId,
    choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
    usage: { prompt_tokens: 48, completion_tokens: 24, total_tokens: 72 },
  });
  return `data: ${first}\n\ndata: ${final}\n\ndata: [DONE]\n\n`;
}

function deterministicReplyFor(rawBody: string): { readonly model: string; readonly stream: boolean; readonly text: string } {
  let model = DEFAULT_GEMINI_MODEL_ID;
  let stream = false;
  if (rawBody.trim().startsWith("{")) {
    const parsed = JSON.parse(rawBody) as { model?: unknown; stream?: unknown };
    if (typeof parsed.model === "string" && parsed.model.trim()) model = parsed.model.trim();
    stream = parsed.stream === true;
  }
  const text = "评测摘要：本批补齐样本留存豁免清理与隔离回放能力，未知与失败严格区分。";
  return { model, stream, text };
}

export async function startEvaluationStandInServer(): Promise<StandInModelServer> {
  let count = 0;
  const server: Server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      chunks.push(Buffer.from(chunk));
    });
    request.on("end", () => {
      count += 1;
      const raw = Buffer.concat(chunks).toString("utf8");
      const reply = deterministicReplyFor(raw);
      if (reply.stream) {
        response.writeHead(200, { "content-type": "text/event-stream; charset=utf-8" });
        response.end(renderSseReply(reply.model, reply.text));
        return;
      }
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(
        JSON.stringify({
          id: "eval-stand-in-1",
          object: "chat.completion",
          model: reply.model,
          choices: [{ index: 0, message: { role: "assistant", content: reply.text }, finish_reason: "stop" }],
          usage: { prompt_tokens: 48, completion_tokens: 24, total_tokens: 72 },
        }),
      );
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("无法绑定本地评测替身模型端口");
  }
  return {
    baseUrl: `http://127.0.0.1:${address.port}/v1`,
    requestCount: () => count,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

export interface IsolatedModelProviderInput {
  readonly home: string;
  readonly withCatalog: LocalWebCatalogRunner;
  readonly providerId: string;
  readonly displayName: string;
  readonly baseUrl: string;
  readonly apiFormat: ModelApiFormat;
  readonly modelId: string;
  readonly apiKey: string;
}

export async function configureIsolatedModelProvider(input: IsolatedModelProviderInput): Promise<void> {
  const origin = new URL(input.baseUrl).origin;
  await runWithMolisWorkHome(input.home, () =>
    input.withCatalog({ homeDirectory: input.home }, (catalog) => {
      const connection = withConnectorConnections(input.home, (store) => {
        const created = store.createToken({
          serviceId: "model-api",
          displayName: input.displayName,
          token: input.apiKey,
        });
        store.assertTarget(created.connection_id, "model-api", origin);
        return created;
      });
      if (!connection.credential_ref) {
        throw new Error("隔离 Home 未能为评测模型创建凭据引用");
      }
      catalog.models.upsert({
        provider_id: input.providerId,
        display_name: input.displayName,
        base_url: input.baseUrl,
        api_format: input.apiFormat,
        credential_ref: connection.credential_ref,
        enabled: true,
        models: [{ model_id: input.modelId, enabled: true }],
      });
    }),
  );
}
