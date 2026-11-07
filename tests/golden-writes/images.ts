import { readsBack, type GoldenWriteContext } from "../fixtures/golden-write.ts";

/** images/images.db. A connection only: the address is the loopback discard port, and no job is started, so nothing is ever requested. */
export default async function ({ call, tag }: GoldenWriteContext) {
  await call("images.connections.save", { name: `金样图片连接 ${tag}`, api_format: "openai-images", base_url: "http://127.0.0.1:9/v1", model: "golden-model" });
  readsBack(await call("images.connections.list"), `金样图片连接 ${tag}`);
}
