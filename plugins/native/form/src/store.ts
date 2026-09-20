import { chmodSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type {
  FormOption,
  FormQuestion,
  FormQuestionType,
  FormRecord,
  FormStatus,
  FormSubmissionRecord,
} from "@molis-ai/molis-work-contracts/modules/form";
import { FormError } from "./error.js";

interface FormRow {
  id: string;
  project_id: string;
  title: string;
  description: string;
  status: string;
  share_id: string | null;
  questions_json: string;
  created_at: string;
  updated_at: string;
  version: number;
}

interface SubmissionRow {
  id: string;
  form_id: string;
  answers_json: string;
  submitted_at: string;
}

const QUESTION_TYPES: readonly FormQuestionType[] = [
  "text", "singleChoice", "multiChoice", "dropdown", "rating", "date",
];

export class FormStore {
  constructor(private readonly db: DatabaseSync) {}

  close(): void {
    this.db.close();
  }

  list(projectId: string): FormRecord[] {
    const project_id = normalizeProjectId(projectId);
    const rows = this.db.prepare(
      "SELECT * FROM forms WHERE project_id = ? ORDER BY datetime(updated_at) DESC, title COLLATE NOCASE",
    ).all(project_id) as unknown as FormRow[];
    return rows.map(fromRow);
  }

  get(id: string, projectId?: string): FormRecord {
    const row = this.db.prepare("SELECT * FROM forms WHERE id = ?").get(id) as FormRow | undefined;
    if (!row) throw new FormError("form.not_found", "找不到这份问卷");
    if (projectId && row.project_id !== normalizeProjectId(projectId)) {
      throw new FormError("form.not_found", "找不到这份问卷");
    }
    return fromRow(row);
  }

  create(input: { title?: string; project_id: string }): FormRecord {
    const now = new Date().toISOString();
    const record: FormRecord = {
      id: crypto.randomUUID(),
      project_id: normalizeProjectId(input.project_id),
      title: normalizeTitle(input.title ?? "未命名问卷"),
      description: "",
      status: "draft",
      share_id: null,
      questions: [],
      created_at: now,
      updated_at: now,
      version: 1,
    };
    this.db.prepare(
      "INSERT INTO forms (id, project_id, title, description, status, share_id, questions_json, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    ).run(
      record.id, record.project_id, record.title, record.description, record.status, record.share_id,
      JSON.stringify(record.questions), record.created_at, record.updated_at, record.version,
    );
    return record;
  }

  update(id: string, patch: {
    title?: string;
    description?: string;
    questions?: readonly FormQuestion[];
  }, projectId?: string): FormRecord {
    const current = this.get(id, projectId);
    const next: FormRecord = {
      ...current,
      title: patch.title !== undefined ? normalizeTitle(patch.title) : current.title,
      description: patch.description !== undefined ? normalizeDescription(patch.description) : current.description,
      questions: patch.questions !== undefined ? normalizeQuestions(patch.questions) : current.questions,
      updated_at: new Date().toISOString(),
      version: current.version + 1,
    };
    this.db.prepare(
      "UPDATE forms SET title = ?, description = ?, questions_json = ?, updated_at = ?, version = ? WHERE id = ?",
    ).run(next.title, next.description, JSON.stringify(next.questions), next.updated_at, next.version, id);
    return next;
  }

  publish(id: string, projectId?: string): FormRecord {
    const current = this.get(id, projectId);
    const share_id = current.share_id ?? crypto.randomUUID().slice(0, 12);
    const next: FormRecord = {
      ...current,
      status: "published",
      share_id,
      updated_at: new Date().toISOString(),
      version: current.version + 1,
    };
    this.db.prepare(
      "UPDATE forms SET status = ?, share_id = ?, updated_at = ?, version = ? WHERE id = ?",
    ).run(next.status, next.share_id, next.updated_at, next.version, id);
    return next;
  }

  delete(id: string, projectId?: string): void {
    this.get(id, projectId);
    this.db.prepare("DELETE FROM submissions WHERE form_id = ?").run(id);
    this.db.prepare("DELETE FROM forms WHERE id = ?").run(id);
  }

  generateQuestions(id: string, prompt: string, projectId?: string): FormRecord {
    const current = this.get(id, projectId);
    const title = prompt.trim() || "请填写你的回答";
    if (title.length > 200) throw new FormError("form.invalid", "出题提示须为 1 到 200 个字");
    const question: FormQuestion = {
      id: crypto.randomUUID(),
      type: "text",
      title,
      required: false,
      order: current.questions.length + 1,
    };
    return this.update(id, { questions: [...current.questions, question] }, projectId);
  }

  submit(id: string, answers: Readonly<Record<string, string>>, projectId?: string): FormSubmissionRecord {
    const form = this.get(id, projectId);
    const normalized = normalizeAnswers(form.questions, answers);
    const submission: FormSubmissionRecord = {
      id: crypto.randomUUID(),
      form_id: id,
      answers: normalized,
      submitted_at: new Date().toISOString(),
    };
    this.db.prepare(
      "INSERT INTO submissions (id, form_id, answers_json, submitted_at) VALUES (?, ?, ?, ?)",
    ).run(submission.id, submission.form_id, JSON.stringify(submission.answers), submission.submitted_at);
    return submission;
  }

  listSubmissions(id: string, projectId?: string): FormSubmissionRecord[] {
    this.get(id, projectId);
    const rows = this.db.prepare(
      "SELECT * FROM submissions WHERE form_id = ? ORDER BY datetime(submitted_at) DESC",
    ).all(id) as unknown as SubmissionRow[];
    return rows.map((row) => ({
      id: row.id,
      form_id: row.form_id,
      answers: JSON.parse(row.answers_json) as Record<string, string>,
      submitted_at: row.submitted_at,
    }));
  }

  analyze(id: string, projectId?: string): { form_id: string; submission_count: number } {
    this.get(id, projectId);
    const row = this.db.prepare(
      "SELECT COUNT(*) AS count FROM submissions WHERE form_id = ?",
    ).get(id) as { count: number };
    return { form_id: id, submission_count: Number(row.count) };
  }
}

export function openFormStore(homeDirectory: string): FormStore {
  const dir = join(homeDirectory, "form");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const dbPath = join(dir, "form.db");
  const db = new DatabaseSync(dbPath);
  try {
    chmodSync(dbPath, 0o600);
  } catch {
    // best-effort
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS forms (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      status TEXT NOT NULL,
      share_id TEXT,
      questions_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      version INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      form_id TEXT NOT NULL,
      answers_json TEXT NOT NULL,
      submitted_at TEXT NOT NULL
    );
  `);
  ensureProjectIdColumn(db, "forms");
  return new FormStore(db);
}

function ensureProjectIdColumn(db: DatabaseSync, table: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "project_id")) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN project_id TEXT NOT NULL DEFAULT ''`);
  }
}

function fromRow(row: FormRow): FormRecord {
  return {
    id: row.id,
    project_id: row.project_id ?? "",
    title: row.title,
    description: row.description,
    status: row.status as FormStatus,
    share_id: row.share_id,
    questions: JSON.parse(row.questions_json) as FormQuestion[],
    created_at: row.created_at,
    updated_at: row.updated_at,
    version: row.version,
  };
}

function normalizeProjectId(value: string): string {
  const id = value.trim();
  if (!id) throw new FormError("form.invalid", "缺少项目");
  if (id.length > 80) throw new FormError("form.invalid", "项目标识过长");
  return id;
}

function normalizeTitle(value: string): string {
  const title = value.trim() || "未命名问卷";
  if (title.length > 80) throw new FormError("form.invalid", "标题须为 1 到 80 个字");
  return title;
}

function normalizeDescription(value: string): string {
  if (value.length > 2000) throw new FormError("form.invalid", "说明须为 0 到 2000 个字");
  return value;
}

function usesOptions(type: FormQuestionType): boolean {
  return type === "singleChoice" || type === "multiChoice" || type === "dropdown";
}

function normalizeQuestions(value: readonly FormQuestion[]): FormQuestion[] {
  if (!Array.isArray(value)) throw new FormError("form.invalid", "题目须是列表");
  if (value.length > 40) throw new FormError("form.invalid", "最多 40 题");
  return value.map((question, index) => {
    const type = QUESTION_TYPES.includes(question.type) ? question.type : "text";
    const title = String(question.title ?? "").trim() || `问题 ${index + 1}`;
    if (title.length > 200) throw new FormError("form.invalid", "题目标题须为 1 到 200 个字");
    const options = usesOptions(type)
      ? (question.options ?? []).map((option: FormOption, optionIndex: number) => ({
        id: option.id || crypto.randomUUID(),
        label: String(option.label ?? "").trim() || `选项 ${optionIndex + 1}`,
      }))
      : undefined;
    if (usesOptions(type) && (options?.length ?? 0) < 2) {
      throw new FormError("form.invalid", "选择题至少两个选项");
    }
    return {
      id: question.id || crypto.randomUUID(),
      type,
      title,
      required: Boolean(question.required),
      order: index + 1,
      options,
    };
  });
}

function normalizeAnswers(
  questions: readonly FormQuestion[],
  answers: Readonly<Record<string, string>>,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const question of questions) {
    const value = String(answers[question.id] ?? "").trim();
    if (question.required && !value) {
      throw new FormError("form.invalid", `请回答：${question.title}`);
    }
    if (value.length > 4000) throw new FormError("form.invalid", "回答过长");
    next[question.id] = value;
  }
  return next;
}

export type { FormOption };
