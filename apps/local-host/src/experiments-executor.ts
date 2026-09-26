import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createFileSecretStore } from "@molis-ai/molis-work-storage";
import { createPrologueTypeSafeProvider } from "./typesafe-prologue.js";
import { FUNCTIONS_CREDENTIAL_REF } from "@molis-ai/molis-work-contracts/modules/functions";
import { typeSafeCredential, typeSafeConfiguration } from "./typesafe-connection.js";
import type { ExecutionPort, Participant } from "@molis-ai/molis-work-plugin-experiments";
import { JsonWorker } from "./experiments-process.js";
import { runGrok } from "./experiments-grok.js";
export function experimentDefaults(): Participant[] {
  return [
    {id:"jev",name:"Jev · TypeSafe",kind:"jev",model:"jev-latest"},
    {id:"laya",name:"Laya · multilingual",kind:"laya",model:"laya-multilingual",executable:process.env.MOLIS_LAYA_PYTHON ?? "",
      checkpoint:process.env.MOLIS_LAYA_CHECKPOINT ?? "",revision:process.env.MOLIS_LAYA_REVISION ?? ""},
    {id:"grok",name:"Grok 4.6 · xhigh",kind:"grok",model:"grok-4.6",effort:"xhigh",executable:join(homedir(),".grok/bin/grok")},
  ];
}
export function jevCredential(home?: string): string { return process.env.TYPESAFE_API_KEY?.trim() || (home ? typeSafeCredential(home,"experiments") : createFileSecretStore().get(FUNCTIONS_CREDENTIAL_REF)?.trim()) || ""; }
export function experimentConnectionStatus(participants: Participant[], home?: string) {
  return participants.map(p => ({id:p.id,configured:p.kind === "jev" ? !!jevCredential(home) : !!p.executable && existsSync(p.executable) && (p.kind !== "laya" || !!p.checkpoint && existsSync(join(p.checkpoint,"model.safetensors"))),
    note:p.kind === "jev" ? "使用实验中选择的 TypeSafe 连接；连通性以实际执行为准" : p.kind === "grok" ? "本地 CLI；执行前检查上下文隔离" : "本地路径检查；依赖、上下文长度以实际执行为准"}));
}
export function createExperimentExecutor(home?: string): ExecutionPort {
  const workers = new Map<string,JsonWorker>();
  const script = resolve(fileURLToPath(new URL("../tooling/experiments/laya-worker.py",import.meta.url)));
  return {
    async evaluate(p,request,signal) {
      if (p.kind === "grok") { if (!p.executable) throw new Error("Grok 未配置本地 CLI 路径"); return runGrok(p,request,signal); }
      if (p.kind === "laya") {
        if (!p.executable || !p.checkpoint || !p.revision) throw new Error("Laya 未配置：请填写 Python 环境、multilingual 权重目录和 revision");
        if (!p.checkpoint?.endsWith("/multilingual") || !p.revision || !p.checkpoint.includes(p.revision)) throw new Error("Laya 路径必须指向固定 revision 的 multilingual 权重目录");
        let worker = workers.get(p.id);
        if (!worker) {worker = new JsonWorker(p.executable!,[script,p.checkpoint],homedir()); workers.set(p.id,worker);}
        const answer = await worker.request(request,signal);
        return {...answer,model:`laya-multilingual@${p.revision}`};
      }
      const key = jevCredential(home); if (!key) throw new Error("Jev 未配置：请在 Connectors 中添加 TypeSafe 连接并在实验中选择");
      const answer = await createPrologueTypeSafeProvider(home, { resolveCredential: () => jevCredential(home),
        configuration: () => process.env.TYPESAFE_API_KEY?.trim() ? "env" : home ? typeSafeConfiguration(home, "experiments") : "legacy" }).evaluate(key, {
        id:p.id, function_key:"decision", name:p.name, primitive:"choice", status:"draft", version:null,
        model:p.model, instructions:request.task.instructions, criteria:request.task.criteria,
        scene_id:null, subject_kinds:[], scene_map:{},
        config_hash:"experiment-snapshot", last_preview:null, samples:[], published_at:null, created_at:"", updated_at:"",
      }, request.input, signal);
      if (!answer.choice || !answer.model) throw new Error("Jev 未返回答案或实际模型标识");
      return {choice:answer.choice,model:answer.model,probabilities:{...answer.probabilities},confidence:answer.confidence ?? undefined,
        input_tokens:answer.usage?.input_tokens ?? null,output_tokens:answer.usage?.output_tokens ?? null,
        model_ms:null,startup_ms:null,reported_cost_usd:null,cost_basis:"TypeSafe API；价格与实际扣款未提供",input_characters:request.input.length};
    },
    close(){ for(const worker of workers.values()) worker.close(); },
  };
}
