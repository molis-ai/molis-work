import path from "node:path";
import type { AgentHostComposition } from "./agent-host-composition.js";
import { resolveMolisWorkHome } from "@molis-ai/molis-work-storage";
import { PrologueInferenceError, type PrologueInferenceClient } from "@molis-ai/molis-work-service-agent-host";

/** References the existing Home owner. This registry never constructs a Runtime. */
const bindings = new Map<string, PrologueInferenceClient>();
export function bindPrologueInference(home: string, inference: PrologueInferenceClient): () => void {
  const key = path.resolve(home);
  if (bindings.has(key) && bindings.get(key) !== inference) throw new PrologueInferenceError("inference.home_in_use", "这个 Home 已有运行中的推理服务");
  bindings.set(key, inference);
  return () => { if (bindings.get(key) === inference) bindings.delete(key); };
}
export async function resolvePrologueInference(homeDirectory = resolveMolisWorkHome()): Promise<PrologueInferenceClient> {
  const client = bindings.get(path.resolve(homeDirectory));
  if (!client) throw new PrologueInferenceError("inference.unbound", "这个 Home 的推理服务尚未装配");
  return client;
}

const builderBindings = new Map<string, AgentHostComposition["createBuilderAgent"]>();
export function bindPrologueBuilder(home: string, create: AgentHostComposition["createBuilderAgent"]): () => void {
  const key = path.resolve(home);
  if (builderBindings.has(key) && builderBindings.get(key) !== create) throw new Error("这个 Home 已有构建服务");
  builderBindings.set(key, create);
  return () => { if (builderBindings.get(key) === create) builderBindings.delete(key); };
}
export async function resolvePrologueBuilder(homeDirectory = resolveMolisWorkHome()): Promise<AgentHostComposition["createBuilderAgent"]> {
  const create = builderBindings.get(path.resolve(homeDirectory));
  if (!create) throw new Error("这个 Home 的构建服务尚未装配");
  return create;
}
