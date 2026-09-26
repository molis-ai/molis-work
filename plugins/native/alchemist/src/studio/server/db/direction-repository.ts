import type { Direction, DirectionSource } from "../../domain/discovery/direction.js";
import type { SqliteDatabase } from "./open-database.js";

interface DirectionRow {
  id: string;
  workspace_id: string;
  title: string;
  description: string;
  source_json: string;
  status: Direction["status"];
  created_at: string;
  updated_at: string;
}

export class SqliteDirectionRepository {
  constructor(private readonly database: SqliteDatabase) {}

  create(direction: Direction): Direction {
    this.database
      .prepare(
        `INSERT INTO directions (
          id, workspace_id, title, description, source_kind, source_json, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        direction.id,
        direction.workspaceId,
        direction.title,
        direction.description,
        direction.source.kind,
        JSON.stringify(direction.source),
        direction.status,
        direction.createdAt,
        direction.updatedAt,
      );
    return direction;
  }

  get(id: string): Direction | undefined {
    const row = this.database.prepare("SELECT * FROM directions WHERE id = ?").get(id) as
      | DirectionRow
      | undefined;
    return row ? mapDirection(row) : undefined;
  }

  list(): Direction[] {
    return (
      this.database.prepare("SELECT * FROM directions ORDER BY updated_at DESC").all() as DirectionRow[]
    ).map(mapDirection);
  }

  update(id: string, input: { title: string; description: string; updatedAt: string }): Direction | undefined {
    const result = this.database.prepare("UPDATE directions SET title = ?, description = ?, updated_at = ? WHERE id = ?")
      .run(input.title, input.description, input.updatedAt, id);
    return Number(result.changes) === 1 ? this.get(id) : undefined;
  }

  setStatus(id: string, status: Direction["status"], updatedAt: string): Direction | undefined {
    const result = this.database.prepare("UPDATE directions SET status = ?, updated_at = ? WHERE id = ?")
      .run(status, updatedAt, id);
    return Number(result.changes) === 1 ? this.get(id) : undefined;
  }
}

function mapDirection(row: DirectionRow): Direction {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    title: row.title,
    description: row.description,
    source: JSON.parse(row.source_json) as DirectionSource,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
