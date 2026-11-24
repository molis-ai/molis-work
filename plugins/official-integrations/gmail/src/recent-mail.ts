import { Buffer } from "node:buffer";
import { readFileSync } from "node:fs";
import type { MailboxDriver, MailboxFile } from "@molis-ai/molis-work-contracts/platform/integration-drivers";
import { activeUiLocale, tryUiText } from "@molis-ai/molis-work-plugin-sdk/ui";

const API = "https://gmail.googleapis.com/gmail/v1/users/me/";
const GMAIL_LOCALES = new Map<string, Readonly<Record<string, string>>>();

function gmailMessages(locale: string): Readonly<Record<string, string>> {
  const base = locale.trim().toLowerCase().split(/[-_]/)[0] || "zh";
  const tag = base === "en" || base === "ja" ? base : "zh";
  let cached = GMAIL_LOCALES.get(tag);
  if (!cached) {
    try {
      const raw = readFileSync(new URL(`../locales/${tag}.json`, import.meta.url), "utf8");
      const parsed = JSON.parse(raw) as { messages?: Record<string, string> };
      cached = parsed.messages ?? {};
    } catch {
      cached = {};
    }
    GMAIL_LOCALES.set(tag, cached);
  }
  return cached;
}

function mailText(key: string, fallback: string): string {
  const fromContext = tryUiText(key);
  if (fromContext !== undefined) return fromContext;
  const locale = activeUiLocale();
  if (!locale) return fallback;
  return gmailMessages(locale)[key] ?? fallback;
}

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
        files.push({ path: `${item.id}.md`, reason: mailText("gmail.mail.no-body", "没有可读取的邮件正文，附件未读取") });
        continue;
      }
      const origin = `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(input.account)}#all/${item.id}`;
      const subject = header("subject") || mailText("gmail.mail.no-subject", "无主题邮件");
      const fromLabel = mailText("gmail.mail.from", "发件人：");
      const dateLabel = mailText("gmail.mail.date", "时间：");
      const originalLabel = mailText("gmail.mail.original", "原邮件：");
      files.push({ path: `${item.id}.md`, text: `# ${subject}\n\n${fromLabel}${header("from")}\n${dateLabel}${header("date")}\n${originalLabel}${origin}\n\n${body}` });
    }
    return files;
  },
});
