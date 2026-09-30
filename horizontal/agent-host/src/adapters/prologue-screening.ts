import { redactText, screenInbound } from "@prologue/sdk";

/**
 * Screen material before it leaves the machine for a model (specs/contextual-interaction §4.2): secret-shaped text and
 * absolute paths are redacted with Prologue's own rules; instruction-shaped wording is reported, and stays data.
 * The notes go into receipts; the text itself is not kept.
 */
export function screenModelMaterial(text: string): { text: string; notes: string[] } {
  const redacted = redactText(text);
  const notes: string[] = [];
  if (redacted !== text) notes.push("去掉了形似密钥、凭据或本机路径的内容");
  for (const reason of screenInbound(redacted).reasons) notes.push(`有像指令的文字（${reason.rule}），已作为数据处理`);
  return { text: redacted, notes };
}
