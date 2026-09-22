import { createHash } from "node:crypto";

export interface ResearchLibraryEntry {
  id: string;
  title: string;
  summary: string;
  body: string;
  url: string;
  published_at: string;
  tags: string[];
  provenance: Record<string, unknown>;
}

/** Reads only published, hash-checked packages at one immutable Git revision. */
export async function readResearchLibrary(input: {
  repository: string;
  source_id: string;
  revision: string;
  readText(path: string): Promise<string>;
}): Promise<ResearchLibraryEntry[]> {
  const registry = object(JSON.parse(await input.readText("sources.json")));
  if (!Array.isArray(registry.sources)) throw new Error("研究库缺少来源列表");
  const source = objects(registry.sources).find((row) => row.id === input.source_id);
  if (!source || source.publication_state !== "ENABLED") throw new Error("该研究来源未开放发布");
  const catalog = object(JSON.parse(await input.readText("catalog.json")));
  if (!Array.isArray(catalog.packages)) throw new Error("研究库缺少发布索引");
  const entries: ResearchLibraryEntry[] = [];
  const packages = objects(catalog.packages).filter((row) => row.source_id === input.source_id);
  for (const pkg of packages) {
    const packageId = string(pkg.id);
    const path = `packages/${input.source_id}/${packageId}`;
    if (!/^[a-zA-Z0-9_-]+$/.test(packageId) || pkg.path !== path) throw new Error("研究包路径无效");
    const manifestText = await input.readText(`${path}/manifest.json`);
    verify(manifestText, pkg.manifest_sha256, "manifest.json");
    const manifest = object(JSON.parse(manifestText));
    if (manifest.id !== packageId || manifest.source_id !== input.source_id) throw new Error("研究包身份与索引不一致");
    const researchText = await input.readText(`${path}/research.json`);
    const reportText = await input.readText(`${path}/report.md`);
    const files = objects(manifest.files);
    verify(researchText, files.find((file) => file.path === "research.json")?.sha256, "research.json");
    verify(reportText, files.find((file) => file.path === "report.md")?.sha256, "report.md");
    const research = object(JSON.parse(researchText));
    if (!Array.isArray(research.source_records) || !Array.isArray(research.findings)) throw new Error("研究包缺少材料或发现列表");
    if (!Number.isFinite(Date.parse(string(pkg.published_at)))) throw new Error("研究包发布时间无效");
    const sources = objects(research.source_records);
    const findings = objects(research.findings);
    const seen = new Set<string>();
    for (const finding of findings) {
      const id = string(finding.id);
      if (!id || seen.has(id)) throw new Error("研究发现缺少唯一 id");
      seen.add(id);
      const refs = strings(finding.source_ids).map((ref) => {
        const row = sources.find((source) => source.id === ref);
        if (!row) throw new Error("研究发现引用了不存在的材料");
        return row;
      });
      const claim = string(finding.claim);
      if (!claim) throw new Error("研究发现没有正文");
      const url = `https://github.com/${input.repository}/blob/${input.revision}/${path}/report.md`;
      const usage = string(pkg.usage) || string(manifest.usage);
      const limitations = [...strings(manifest.limitations), ...strings(research.unknowns)];
      const body = [
        `## 研究发现\n${claim}`,
        `## 依据\n${string(finding.support) || "研究包未提供补充论证"}`,
        `## 使用边界\n使用级别：${usage}\n${string(finding.boundary)}\n${limitations.map((line) => `- ${line}`).join("\n")}`,
        `## 原始材料\n${refs.map((ref) => [
          `### ${string(ref.title) || string(ref.id)}`,
          safeUrl(ref.url) ? `[打开原始材料](${safeUrl(ref.url).replaceAll("(", "%28").replaceAll(")", "%29")})` : "", string(ref.summary),
          `阅读范围：${string(ref.read_scope)}。${string(ref.read_scope_detail)}`,
          `证据边界：${string(ref.boundary)}`,
        ].join("\n")).join("\n\n")}`,
        `## 研究版本\n来源：${string(source.name)}\n研究包：${packageId}\n修订自：${string(pkg.revision_of) || "无"}\n[打开研究包报告](${url})`,
      ].join("\n\n");
      entries.push({
        id: `${packageId}:${id}`, title: claim.slice(0, 120), summary: claim, body, url,
        published_at: string(pkg.published_at), tags: ["research-library", input.source_id, usage],
        provenance: { repository: input.repository, source_id: input.source_id, package_id: packageId,
          finding_id: id, revision: input.revision, revision_of: pkg.revision_of ?? null,
          manifest_sha256: pkg.manifest_sha256, usage, limitations,
          source_records: refs, finding },
      });
    }
  }
  return entries;
}

function verify(text: string, expected: unknown, label: string): void {
  if (typeof expected !== "string" || createHash("sha256").update(text).digest("hex") !== expected) {
    throw new Error(`研究包 ${label} 哈希与发布索引不一致`);
  }
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("研究库 JSON 格式无效");
  return value as Record<string, unknown>;
}
function objects(value: unknown): Record<string, unknown>[] { return Array.isArray(value) ? value.map(object) : []; }
function string(value: unknown): string { return typeof value === "string" ? value : ""; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : []; }
function safeUrl(value: unknown): string {
  const raw = string(value);
  try { const url = new URL(raw); return ["https:", "http:"].includes(url.protocol) ? raw : ""; } catch { return ""; }
}
