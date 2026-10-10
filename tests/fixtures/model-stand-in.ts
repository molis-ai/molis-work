import { createServer, type Server } from "node:http";

/**
 * A model provider on 127.0.0.1 that speaks the OpenAI chat-completions shape and accepts exactly one key.
 * The Host's real connectivity check runs against it, through the same Prologue path a Run takes: a key it does not
 * accept is a 401 the check must turn into a readable reason, the right key gets a streamed reply.
 */
export interface ModelStandIn {
  /** `http://127.0.0.1:<port>/v1`, what a person pastes into Base URL. */
  readonly baseUrl: string;
  readonly origin: string;
  /** One entry per request the provider received: which model was asked and which key was offered. */
  readonly requests: { model: string; offeredKey: string }[];
  close(): Promise<void>;
}

export async function startModelStandIn(acceptedKey: string, reply = "MOLIS_OK"): Promise<ModelStandIn> {
  const requests: ModelStandIn["requests"] = [];
  const server: Server = createServer(async (request, response) => {
    let body = "";
    for await (const chunk of request) body += chunk;
    const offeredKey = String(request.headers.authorization ?? "").replace(/^Bearer /, "");
    const payload = body ? JSON.parse(body) as { model?: string; stream?: boolean } : {};
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") { response.writeHead(404).end(); return; }
    requests.push({ model: String(payload.model ?? ""), offeredKey });
    if (offeredKey !== acceptedKey) {
      response.writeHead(401, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { message: "invalid api key" } }));
      return;
    }
    const usage = { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 };
    if (payload.stream) {
      response.writeHead(200, { "content-type": "text/event-stream" });
      const send = (value: unknown) => response.write(`data: ${JSON.stringify(value)}\n\n`);
      send({ id: "stand-in", object: "chat.completion.chunk", model: payload.model, choices: [{ index: 0, delta: { role: "assistant", content: reply }, finish_reason: null }] });
      send({ id: "stand-in", object: "chat.completion.chunk", model: payload.model, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage });
      response.end("data: [DONE]\n\n");
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ choices: [{ message: { content: reply } }], usage }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address !== "object") throw new Error("the stand-in provider did not start");
  const origin = `http://127.0.0.1:${address.port}`;
  return {
    origin, baseUrl: `${origin}/v1`, requests,
    close: () => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }),
  };
}
