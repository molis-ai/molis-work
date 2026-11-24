import { Buffer } from "node:buffer";
import type { MailboxDriver, MailboxFile } from "@molis-ai/molis-work-contracts/platform/integration-drivers";

const API = "https://gmail.googleapis.com/gmail/v1/users/me/";

interface GmailPart { mimeType?: string; filename?: string; body?: { data?: string }; parts?: GmailPart[]; headers?: { name: string; value: string }[] }
function messageText(part: GmailPart, depth = 0): string {
  if (depth > 12 || part.filename) return "";
  if (part.parts?.length) {
    const text = part.parts.map(p => messageText(p, depth + 1)).filter(Boolean);
    return part.mimeType === "multipart/alternative" ? text[0] ?? "" : text.join("\n\n");
  }
  if (!part.body?.data || !["text/plain", "text/html"].includes(part.mimeType ?? "")) return "";
  const decoded = Buffer.from(part.body.data, "base64url").toString("utf8");
  return part.mimeType === "text/html" ? decoded.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/giu, "").replace(/<[^>]+>/gu, " ").replace(/&nbsp;/gu, " ").replace(/&amp;/gu, "&").replace(/&lt;/gu, "<").replace(/&gt;/gu, ">") : decoded;
}

/** Gmail's recent mail: the 20 newest messages of the last 7 or 30 days, outside spam and trash, body text only (attachments are not read). */
export const GMAIL_MAILBOX_DRIVER: MailboxDriver = Object.freeze({
  service: "gmail",
  title: "Gmail",
  account_title: "Google",
  origin: API,
  async readRecent(get: (url: string) => Promise<Record<string, unknown>>, input: { days: 7 | 30; account: string }): Promise<MailboxFile[]> {
    const query = `newer_than:${input.days}d -in:spam -in:trash`;
    const listed = await get(`${API}messages?maxResults=20&q=${encodeURIComponent(query)}`);
    const messages = Array.isArray(listed.messages) ? listed.messages.slice(0, 20) : [];
    const files: MailboxFile[] = [];
    for (const item of messages) {
      if (!item || typeof item.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/u.test(item.id)) continue;
      const mail = await get(`${API}messages/${encodeURIComponent(item.id)}?format=full`);
      const payload = mail.payload as GmailPart | undefined;
      if (!payload) continue;
      const header = (name: string) => payload.headers?.find(h => h.name.toLowerCase() === name)?.value ?? "";
      const body = messageText(payload).trim();
      if (!body) {
        files.push({ path: `${item.id}.md`, reason: "没有可读取的邮件正文，附件未读取" });
        continue;
      }
      const origin = `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(input.account)}#all/${item.id}`;
      files.push({ path: `${item.id}.md`, text: `# ${header("subject") || "无主题邮件"}\n\n发件人：${header("from")}\n时间：${header("date")}\n原邮件：${origin}\n\n${body}` });
    }
    return files;
  },
});
