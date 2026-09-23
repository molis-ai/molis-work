import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { contentHash, decodeFile, ignoredPath, linksFor, materialRole, metadata, safeRelativePath } from "./content.js";
import { COGNIA_LIMITS, requireCognia, stringField, type Domain, type Draft, type ImportEntry, type ImportFile, type Material, type Preview, type Receipt, type Source } from "./types.js";
interface Staged { path: string; data: string; base_hash: string | null; material: Material }
interface SavedPreview extends Preview { files: Staged[] }
const parse = <T>(row: unknown): T | null => row ? JSON.parse((row as { body: string }).body) as T : null;
export class CogniaStore {
  constructor(private readonly db: DatabaseSync) {}
  close(): void { this.db.close(); }
  domains(): Domain[] { return this.db.prepare("SELECT id,name FROM cognia_domains ORDER BY name").all() as unknown as Domain[]; }
  createDomain(name: unknown): Domain { const clean = stringField(name, "请输入领域名称", 120); const found = this.domains().find(d => d.name === clean); if (found) return found; const domain = { id: randomUUID(), name: clean }; this.db.prepare("INSERT INTO cognia_domains VALUES (?,?)").run(domain.id, domain.name); return domain; }
  private domain(id: unknown): string | null { if (id === null || id === undefined || id === "") return null; requireCognia(typeof id === "string" && this.domains().some(d => d.id === id), "领域不存在", 404); return id; }
  private atPath(sourceId: string, path: string): Material | null { return parse<Material>(this.db.prepare("SELECT body FROM cognia_materials WHERE source_id=? AND path=?").get(sourceId, path)); }
  sources(): Source[] { return this.db.prepare("SELECT body FROM cognia_sources ORDER BY rowid DESC").all().map(r => parse<Source>(r)!); }
  materials(query = "", domainId = "", sourceId = ""): Material[] {
    requireCognia(query.length <= 500, "搜索词过长"); const terms = query.toLocaleLowerCase().trim().split(/\s+/u).filter(Boolean);
    return this.db.prepare("SELECT body FROM cognia_materials ORDER BY updated_at DESC").all().map(r => parse<Material>(r)!).filter(m => (!domainId || m.domain_id === domainId || domainId === "unclassified" && !m.domain_id) && (!sourceId || m.source_id === sourceId) && terms.every(q => [m.title, m.path, m.body, ...m.tags, ...m.aliases].join("\n").toLocaleLowerCase().includes(q)));
  }
  read(id: string, revision?: number): Material { const row = revision === undefined ? this.db.prepare("SELECT body FROM cognia_materials WHERE id=?").get(id) : this.db.prepare("SELECT body FROM cognia_versions WHERE material_id=? AND revision=?").get(id, revision); const value = parse<Material>(row); requireCognia(value, "资料或版本不存在", 404); return value; }
  detail(id: string, revision?: number): { material: Material; outgoing: ReturnType<typeof linksFor>; incoming: Material[]; references: Draft["references"] } {
    const material = this.read(id, revision), all = this.materials(); const draft = this.drafts().find(d => d.saved_id === id);
    return { material, outgoing: linksFor(material, all), incoming: all.filter(m => m.id !== id && linksFor(m, all).some(l => l.material_id === id)), references: draft?.references ?? [] };
  }
  download(id: string, revision?: number): { material: Material; bytes: Buffer } { const material = this.read(id, revision); const row = this.db.prepare("SELECT data FROM cognia_versions WHERE material_id=? AND revision=?").get(id, material.revision) as { data: string }; return { material, bytes: Buffer.from(row.data, "base64") }; }
  preview(input: { kind: unknown; name: unknown; locator: string; source_id?: unknown; domain_id?: unknown; files: ImportFile[] }): Preview {
    requireCognia(["obsidian", "llm-wiki", "markdown"].includes(String(input.kind)), "请选择来源格式");
    requireCognia(Array.isArray(input.files) && input.files.length <= COGNIA_LIMITS.files, "每批最多 1000 个文件，请选择较小目录");
    const sourceId = input.source_id ? stringField(input.source_id, "来源无效") : input.locator.startsWith("local:") ? contentHash(input.locator) : randomUUID();
    const existing = this.sources().find(s => s.id === sourceId);
    requireCognia(!input.source_id || existing, "来源不存在", 404);
    requireCognia(!existing || existing.locator === input.locator || existing.locator === "upload" && input.locator === "upload", "来源目录不一致");
    const source: Source = existing ?? { id: sourceId, name: stringField(input.name, "请输入来源名称", 200), kind: input.kind as Source["kind"], locator: input.locator, domain_id: this.domain(input.domain_id) };
    const preview: SavedPreview = { id: randomUUID(), source, entries: [], files: [], expires_at: Date.now() + 30 * 60_000 };
    const seen = new Set<string>(); let total = 0;
    for (const file of input.files) {
      const path = safeRelativePath(file.path); requireCognia(!seen.has(path), "同一批次含重复路径：" + path); seen.add(path);
      if (file.reason || ignoredPath(path)) { preview.entries.push({ path, status: "skipped", reason: file.reason || "隐藏或缓存目录" }); continue; }
      try {
        const decoded = decodeFile(file); total += decoded.bytes.length; requireCognia(total <= COGNIA_LIMITS.batch_bytes, "批次超过 32 MB，请选择较小目录");
        const old = this.atPath(source.id, path), hash = contentHash(decoded.bytes);
        const status: ImportEntry["status"] = old ? old.hash === hash ? "unchanged" : "update" : "new";
        const material: Material = { ...metadata(decoded.body, path), id: old?.id ?? randomUUID(), source_id: source.id, path, domain_id: source.domain_id, role: materialRole(path, decoded.text, source.kind), revision: (old?.revision ?? 0) + 1, hash, bytes: decoded.bytes.length, updated_at: new Date().toISOString(), mime: decoded.mime, body: decoded.body };
        preview.entries.push({ path, status, bytes: material.bytes, role: material.role });
        preview.files.push({ path, data: file.data!, base_hash: old?.hash ?? null, material });
      } catch (error) { preview.entries.push({ path, status: "skipped", reason: error instanceof Error ? error.message : "读取失败" }); }
    }
    this.db.prepare("DELETE FROM cognia_previews WHERE expires_at < ? AND receipt IS NULL").run(Date.now());
    this.db.prepare("INSERT INTO cognia_previews VALUES (?,?,?,NULL)").run(preview.id, JSON.stringify(preview), preview.expires_at);
    const { files: _, ...visible } = preview; return visible;
  }
  cancelPreview(id: string): void { this.db.prepare("DELETE FROM cognia_previews WHERE id=? AND receipt IS NULL").run(id); }
  commit(id: string): Receipt {
    return this.transaction(() => {
      const row = this.db.prepare("SELECT body,receipt FROM cognia_previews WHERE id=?").get(id) as { body: string; receipt: string | null } | undefined; requireCognia(row, "预览不存在，请重新选择目录", 404);
      if (row.receipt) return JSON.parse(row.receipt) as Receipt;
      const preview = JSON.parse(row.body) as SavedPreview; requireCognia(preview.files.length > 0, "没有可导入的内容，请查看跳过原因并选择 Markdown 导出目录。"); requireCognia(preview.expires_at > Date.now(), "预览已过期，请重新预览", 409);
      const receipt: Receipt = { id, source_id: preview.source.id, added: 0, updated: 0, unchanged: 0, skipped: preview.entries.filter(e => e.status === "skipped").length, material_ids: [], entries: structuredClone(preview.entries) };
      this.db.prepare("INSERT OR IGNORE INTO cognia_sources VALUES (?,?)").run(preview.source.id, JSON.stringify(preview.source));
      for (const file of preview.files) {
        const current = this.atPath(preview.source.id, file.path);
        if (current?.hash === file.material.hash) { receipt.unchanged++; receipt.material_ids.push(current.id); receipt.entries.find(e => e.path === file.path)!.status = "unchanged"; continue; }
        requireCognia((current?.hash ?? null) === file.base_hash, "资料在预览后发生变化，请重新预览：" + file.path, 409);
        const material = { ...file.material, id: current?.id ?? file.material.id, revision: (current?.revision ?? 0) + 1 };
        this.put(material, file.data); receipt[current ? "updated" : "added"]++; receipt.material_ids.push(material.id);
      }
      this.db.prepare("UPDATE cognia_previews SET receipt=? WHERE id=?").run(JSON.stringify(receipt), id); return receipt;
    });
  }
  private put(material: Material, data: string): void {
    this.db.prepare("INSERT INTO cognia_versions VALUES (?,?,?,?)").run(material.id, material.revision, JSON.stringify(material), data);
    this.db.prepare("INSERT INTO cognia_materials VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at").run(material.id, material.source_id, material.path, material.updated_at, JSON.stringify(material));
  }
  createMaterial(input: { title: unknown; body: unknown; domain_id?: unknown }): Material {
    const title = stringField(input.title, "请输入标题", 500); requireCognia(typeof input.body === "string" && Buffer.byteLength(input.body) <= COGNIA_LIMITS.text_bytes, "正文无效或超过 2 MB");
    const domain_id = this.domain(input.domain_id), id = randomUUID();
    return this.transaction(() => {
      const source: Source = { id: "manual", name: "手动添加", locator: "manual", kind: "markdown", domain_id: null };
      this.db.prepare("INSERT OR IGNORE INTO cognia_sources VALUES (?,?)").run(source.id, JSON.stringify(source));
      const body = input.body as string, material: Material = { ...metadata(body, title), title, id, source_id: source.id, path: id + ".md", domain_id, role: "material", revision: 1, hash: contentHash(body), bytes: Buffer.byteLength(body), body, mime: "text/plain; charset=utf-8", updated_at: new Date().toISOString() };
      this.put(material, Buffer.from(body).toString("base64")); return material;
    });
  }
  drafts(): Draft[] { return this.db.prepare("SELECT body FROM cognia_drafts ORDER BY rowid DESC").all().map(r => parse<Draft>(r)!); }
  addDraft(draft: Draft): Draft { this.db.prepare("INSERT INTO cognia_drafts VALUES (?,?)").run(draft.id, JSON.stringify(draft)); return draft; }
  saveDraft(id: string): Material {
    return this.transaction(() => {
      const draft = parse<Draft>(this.db.prepare("SELECT body FROM cognia_drafts WHERE id=?").get(id)); requireCognia(draft, "草稿不存在", 404); if (draft.saved_id) return this.read(draft.saved_id);
      const materialId = randomUUID(), source: Source = { id: "knowledge", name: "知识库", kind: "markdown", locator: "knowledge", domain_id: null };
      this.db.prepare("INSERT OR IGNORE INTO cognia_sources VALUES (?,?)").run(source.id, JSON.stringify(source));
      const material: Material = { ...metadata(draft.body, draft.title), title: draft.title, id: materialId, source_id: source.id, path: materialId + ".md", domain_id: draft.domain_id, role: "wiki", revision: 1, hash: contentHash(draft.body), bytes: Buffer.byteLength(draft.body), body: draft.body, mime: "text/plain; charset=utf-8", updated_at: new Date().toISOString() };
      this.put(material, Buffer.from(draft.body).toString("base64")); draft.saved_id = materialId; this.db.prepare("UPDATE cognia_drafts SET body=? WHERE id=?").run(JSON.stringify(draft), id); return material;
    });
  }
  private transaction<T>(run: () => T): T { this.db.exec("BEGIN IMMEDIATE"); try { const result = run(); this.db.exec("COMMIT"); return result; } catch (error) { this.db.exec("ROLLBACK"); throw error; } }
}
export function openCogniaStore(home: string): CogniaStore {
  const db = openHomeSqliteDatabase(home, "cognia");
  try { db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS cognia_domains (id TEXT PRIMARY KEY,name TEXT NOT NULL UNIQUE);
    CREATE TABLE IF NOT EXISTS cognia_sources (id TEXT PRIMARY KEY,body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS cognia_materials (id TEXT PRIMARY KEY,source_id TEXT NOT NULL,path TEXT NOT NULL,updated_at TEXT NOT NULL,body TEXT NOT NULL,UNIQUE(source_id,path));
    CREATE TABLE IF NOT EXISTS cognia_versions (material_id TEXT NOT NULL,revision INTEGER NOT NULL,body TEXT NOT NULL,data TEXT NOT NULL,PRIMARY KEY(material_id,revision));
    CREATE TABLE IF NOT EXISTS cognia_previews (id TEXT PRIMARY KEY,body TEXT NOT NULL,expires_at INTEGER NOT NULL,receipt TEXT);
    CREATE TABLE IF NOT EXISTS cognia_drafts (id TEXT PRIMARY KEY,body TEXT NOT NULL);`); return new CogniaStore(db); } catch(error) { db.close(); throw error; }
}
