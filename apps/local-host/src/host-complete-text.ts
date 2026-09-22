import { createFileSecretStore } from "@molis-ai/molis-work-storage";
/** One Host completion adapter shared by Pages and the bounded workbench assistant. */
export type HostCompleteText = (prompt: string, options?: { signal?: AbortSignal }) => Promise<string>;
export function hostCompleteText(options: { fetch?: typeof fetch; env?: NodeJS.ProcessEnv } = {}): HostCompleteText | undefined {
  const env = (name: string) => (options.env ?? process.env)[name]?.trim();
  const minimax = env("MINIMAX_API_KEY");
  const key = env("MOLIS_WORK_TEXT_API_KEY") || minimax || (!options.env ? createFileSecretStore().get("model:text:api_key") : null);
  if (!key) return undefined;
  const format = env("MOLIS_WORK_TEXT_API_FORMAT") || "anthropic-messages";
  if (!["anthropic-messages", "openai-chat-completions"].includes(format)) throw new Error("模型接口格式无效");
  const base = (env("MOLIS_WORK_TEXT_BASE_URL") || "https://api.minimaxi.com/anthropic").replace(/\/$/, "");
  const model = env("MOLIS_WORK_TEXT_MODEL") || "MiniMax-M3";
  const url = new URL(base + (format === "openai-chat-completions" ? "/chat/completions" : "/v1/messages"));
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))) {
    throw new Error("模型地址必须使用 HTTPS");
  }
  return async (prompt, completionOptions) => {
    if (!prompt.trim() || prompt.length > 180_000) throw new Error("写作输入为空或过长，请减少材料后重试");
    let response: Response;
    try {
      response = await (options.fetch ?? fetch)(url, {
        method: "POST", redirect: "error", signal: completionOptions?.signal ? AbortSignal.any([completionOptions.signal, AbortSignal.timeout(120_000)]) : AbortSignal.timeout(120_000),
        headers: { "content-type": "application/json", authorization: `Bearer ${key}`,
          ...(format === "anthropic-messages" ? { "x-api-key": key, "anthropic-version": "2023-06-01" } : {}) },
        body: JSON.stringify({ model, max_tokens: 5000, messages: [{ role: "user", content: prompt }] }),
      });
    } catch { throw new Error("模型请求失败或超时，材料已保留，可重试"); }
    if (!response.ok) throw new Error(`模型返回 ${response.status}，请检查模型配置后重试`);
    const result = await response.json() as { content?: Array<{ type: string; text?: string }>; choices?: Array<{ message?: { content?: string } }> };
    const text = format === "openai-chat-completions" ? result.choices?.[0]?.message?.content
      : result.content?.filter((part) => part.type === "text").map((part) => part.text ?? "").join("\n");
    if (!text?.trim()) throw new Error("模型没有返回正文，材料已保留，可重试");
    return text.trim();
  };
}
