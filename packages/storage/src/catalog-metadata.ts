import type { SqliteDatabase } from "./sqlite.js";

/** Existing local catalog schema metadata; the Host supplies identity and migration versions. */
export class LocalCatalogMetadata {
  constructor(private readonly db: SqliteDatabase) {}
  create(): void {
    this.db.exec(`CREATE TABLE catalog_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
  }
  initialize(owner: string, version: number): void {
    this.db.prepare("INSERT INTO catalog_meta (key, value) VALUES (?, ?)").run("owner", owner);
    this.db.prepare("INSERT INTO catalog_meta (key, value) VALUES (?, ?)").run("schema_version", String(version));
  }
  owner(): string | null {
    const exists = this.db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'catalog_meta'").get();
    if (!exists) return null;
    return (this.db.prepare("SELECT value FROM catalog_meta WHERE key = 'owner'").get() as { value: string } | undefined)?.value ?? null;
  }
  version(): number {
    const row = this.db.prepare("SELECT value FROM catalog_meta WHERE key = 'schema_version'").get() as { value: string } | undefined;
    return Number(row?.value);
  }
  setVersion(version: number): void {
    this.db.prepare("UPDATE catalog_meta SET value = ? WHERE key = 'schema_version'").run(String(version));
  }

  setOwner(owner: string): void {
    const changed = Number(this.db.prepare("UPDATE catalog_meta SET value = ? WHERE key = 'owner'").run(owner).changes);
    if (changed === 0) this.db.prepare("INSERT INTO catalog_meta (key, value) VALUES (?, ?)").run("owner", owner);
  }
}
