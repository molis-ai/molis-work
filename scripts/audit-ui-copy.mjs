#!/usr/bin/env node
// Read-only UI microcopy style & terminology audit against skills/molis-plugin-dev/text-and-appearance.md and docs/system/GLOSSARY.md.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { isMainScript } from "./script-paths.mjs";

const CATALOG_SPECIMEN_KEY = /(?:^workbench\.env\.|\b(?:catalog|specimens?|board-frame|style-probe)\b)/u;

const ZH_RULES = [
  { id: "zh.arch-jargon", label: "内部架构黑话外露", pattern: /宿主|权威(?:状态|记录|事件|存储)|视图投影|幂等运行|事件游标|已落盘|终端通道|对象挂载位|异步上下文/u },
  { id: "zh.retired-term", label: "退役或禁用界面术语", pattern: /\bFunctions\b|判断函数|动作库|共同目录|消费场景|\bBoard\b|原生\s*Agent|本地\s*Agent|本机\s*Agent|终端\s*Agent|Agent\s*CLI|\bConnectors\b/u },
  { id: "zh.colloquial-or-filler", label: "口语俚语或冗余套话", pattern: /连看都不看|你够不到它|还没有叫醒过|AI\s*自己说的(?!，Molis\s*没有核对)|您可以在|你可以通?过|请点击|点击此处|当前尚未|暂无任何|正在为您|本页面用于/u },
  { id: "zh.bare-empty", label: "空洞的空状态文案", pattern: /^(?:暂无(?:数据|内容|记录)?。?|无数据。?|列表为空。?)$/u },
  { id: "zh.bent-quotes", label: "中文界面混用弯引号（应统一用「…」）", pattern: /(?<!\\|\[)[“”](?!\])/u },
  { id: "zh.arrow-path", label: "菜单或设置路径使用箭头（应统一用 › ）", pattern: /(?:设置|个人|项目|偏好|模型|记忆|能力|插件|工作台|目录|入口)\s*(?:->|→)\s*/u },
];

const EN_PROPER_NOUNS = new Set([
  "Molis", "Work", "Goal", "Goals", "Frame", "Inbox", "Feed", "Schedule", "Coding", "Git", "Diff",
  "Cognia", "Jelly", "Shelf", "Pages", "Forms", "Dataset", "PPT", "PowerPoint", "Issue", "Brief",
  "Alchemist", "Studio", "Prologue", "Runtime", "Agent", "Agents", "Skill", "Skills", "Character", "Characters",
  "TypeSafe", "MCP", "OAuth", "API", "CLI", "TUI", "SSH", "HTTP", "HTTPS", "JSON", "CSV", "PDF", "Markdown", "Word", "ID",
  "GitHub", "GitLab", "Bitbucket", "Gmail", "Google", "Drive", "Calendar", "Microsoft", "Outlook", "OneDrive", "SharePoint", "Teams",
  "Slack", "Discord", "Notion", "Linear", "Jira", "Confluence", "Asana", "Monday", "ClickUp", "Trello", "Atlassian", "X",
  "Figma", "Canva", "Adobe", "Loom", "Dropbox", "Box", "Airtable", "Supabase", "Vercel", "Cloudflare", "Stripe", "Sentry",
  "HubSpot", "Salesforce", "Intercom", "LinkedIn", "WeChat", "Feishu", "Lark", "Zoom", "Hugging", "Face",
  "OpenAI", "Anthropic", "Claude", "Code", "Codex", "Cursor", "OpenCode", "Grok", "Build", "Pi", "MiniMax",
  "Console", "Developer", "Platform", "Portal", "App", "Hub", "Open", "Marketplace",
]);

const EN_RULES = [
  { id: "en.arch-jargon", label: "English internal architecture jargon", pattern: /\b(?:host execution bounds|idempotent run ledger|canonical state)\b/iu },
  { id: "en.retired-term", label: "English retired or drifted term", pattern: /\b(?:Functions|subtasks?|native agent|local agent|terminal agent|Agent CLI)\b/u },
  { id: "en.round-drift", label: "Use 'turn' instead of 'round' for AI turns", pattern: /\b(?:this|next|previous|last|each|every)\s+round\b|\bby\s+round\b/iu },
];

function isTitleCaseButton(key, text) {
  if (!/\.(?:btn|button|cta|submit|create|open|add|save|delete|remove)(?:$|-)/u.test(key)) return false;
  const words = text.trim().split(/\s+/u);
  if (words.length < 2 || words.length > 5) return false;
  if (!words.every((w) => /^[A-Z][A-Za-z0-9-]*$/u.test(w))) return false;
  return words.slice(1).some((w) => !EN_PROPER_NOUNS.has(w));
}

export function auditRepositoryCopy(root, options = {}) {
  const includeCatalog = Boolean(options.includeCatalog);
  const ownerFilter = options.owner ?? null;
  const categoryFilter = options.category ?? null;
  const files = execFileSync("git", ["-c", "core.quotepath=off", "ls-files", "-z"], { cwd: root, encoding: "utf8", maxBuffer: 1 << 28 })
    .split("\0")
    .filter((f) => f.endsWith("/locales/zh.json") || f.endsWith("/locales/en.json"))
    .filter((f) => !f.startsWith("examples/"));

  const findings = [];
  for (const file of files.sort()) {
    if (ownerFilter && !file.includes(ownerFilter)) continue;
    const isZh = file.endsWith("/zh.json");
    const parsed = JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
    const messages = parsed.messages ?? {};
    for (const [key, entry] of Object.entries(messages)) {
      if (!includeCatalog && CATALOG_SPECIMEN_KEY.test(key)) continue;
      const texts = typeof entry === "string" ? [entry] : Object.values(entry?.forms ?? {});
      for (const text of texts) {
        if (typeof text !== "string") continue;
        const rules = isZh ? ZH_RULES : EN_RULES;
        for (const rule of rules) {
          if (categoryFilter && rule.id !== categoryFilter) continue;
          if (rule.pattern.test(text)) findings.push({ file, key, rule: rule.id, label: rule.label, text });
        }
        if (!isZh && (!categoryFilter || categoryFilter === "en.title-case-cta") && isTitleCaseButton(key, text)) {
          findings.push({ file, key, rule: "en.title-case-cta", label: "Button/CTA uses Title Case instead of Sentence case", text });
        }
      }
    }
  }
  return findings;
}

export function main(argv) {
  let root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  let owner = null, category = null, json = false, strict = false, includeCatalog = false, limit = 15;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--root") root = path.resolve(argv[++i]);
    else if (arg === "--owner") owner = argv[++i];
    else if (arg === "--category") category = argv[++i];
    else if (arg === "--limit") limit = Number(argv[++i]);
    else if (arg === "--json") json = true;
    else if (arg === "--strict") strict = true;
    else if (arg === "--include-catalog") includeCatalog = true;
    else { process.stderr.write(`unknown option: ${arg}\n`); return 2; }
  }
  const findings = auditRepositoryCopy(root, { owner, category, includeCatalog });
  if (json) {
    process.stdout.write(JSON.stringify({ count: findings.length, findings }, null, 2) + "\n");
  } else {
    const byRule = new Map();
    for (const item of findings) {
      if (!byRule.has(item.rule)) byRule.set(item.rule, { label: item.label, items: [] });
      byRule.get(item.rule).items.push(item);
    }
    process.stdout.write(`UI copy audit: ${findings.length} finding(s) across ${byRule.size} rule(s)\n`);
    for (const [ruleId, group] of byRule) {
      process.stdout.write(`\n[${ruleId}] ${group.label}: ${group.items.length}\n`);
      for (const item of group.items.slice(0, limit)) {
        process.stdout.write(`  ${item.file} (${item.key}): ${JSON.stringify(item.text)}\n`);
      }
      if (group.items.length > limit) process.stdout.write(`  ... and ${group.items.length - limit} more\n`);
    }
  }
  return strict && findings.length > 0 ? 1 : 0;
}

if (isMainScript(import.meta.url)) process.exitCode = main(process.argv.slice(2));
