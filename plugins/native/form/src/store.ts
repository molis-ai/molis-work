import { openBaselineHomeSqlite, type SqliteBaseline } from "@molis-ai/molis-work-storage";
import type { DatabaseSync } from "node:sqlite";
import type {
  FormOption,
  FormQuestion,
  FormQuestionInput,
  FormQuestionType,
  FormRecord,
  FormStatus,
  FormSubmissionRecord,
  FormSubmissionSource,
} from "@molis-ai/molis-work-contracts/modules/form";
import { FormError } from "./error.js";
import { FORM_ANSWER_FORMAT } from "./fillpage.js";
import type { FormPublicationIntent, FormPublicationSnapshot } from "./promote.js";

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
  artifact_id?: string;
  artifact_version?: number;
  publication_pending_json?: string | null;
}

interface SubmissionRow {
  id: string;
  form_id: string;
  answers_json: string;
  submitted_at: string;
  form_version: number;
  questions_json: string;
  request_id: string | null;
  source: string;
}

/** What a form holds; a hand-over from another plugin is shaped to fit before it is received. */
export const FORM_TITLE_LIMIT = 80;
export const FORM_QUESTION_LIMIT = 40;

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
      artifact_id: "",
      artifact_version: 0,
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
    questions?: readonly FormQuestionInput[];
    expected_version?: number;
  }, projectId?: string): FormRecord {
    const current = this.get(id, projectId);
    this.assertVersion(current, patch.expected_version);
    const next: FormRecord = {
      ...current,
      title: patch.title !== undefined ? normalizeTitle(patch.title) : current.title,
      description: patch.description !== undefined ? normalizeDescription(patch.description) : current.description,
      questions: patch.questions !== undefined ? normalizeQuestions(patch.questions) : current.questions,
      updated_at: new Date().toISOString(),
      version: current.version + 1,
    };
    const result = this.db.prepare(
      "UPDATE forms SET title = ?, description = ?, questions_json = ?, updated_at = ?, version = ? WHERE id = ? AND version = ?",
    ).run(next.title, next.description, JSON.stringify(next.questions), next.updated_at, next.version, id, current.version);
    if (result.changes !== 1) throw new FormError("form.conflict", "问卷已改变，请重新读取后保存");
    return next;
  }

  publish(id: string, projectId?: string, expectedVersion?: number): FormRecord {
    const current = this.get(id, projectId);
    this.assertVersion(current, expectedVersion);
    const share_id = current.share_id ?? crypto.randomUUID().slice(0, 12);
    const next: FormRecord = {
      ...current,
      status: "published",
      share_id,
      updated_at: new Date().toISOString(),
      version: current.version + 1,
    };
    const result = this.db.prepare(
      "UPDATE forms SET status = ?, share_id = ?, updated_at = ?, version = ? WHERE id = ? AND version = ?",
    ).run(next.status, next.share_id, next.updated_at, next.version, id, current.version);
    if (result.changes !== 1) throw new FormError("form.conflict", "问卷已改变，请重新读取后发布");
    return next;
  }

  /** A form made from a list of questions another plugin hands over; one delivery makes one form. */
  receive(projectId: string, requestId: string, title: string, questions: readonly FormQuestionInput[]): FormRecord {
    const target = normalizeProjectId(projectId);
    return this.transaction(() => {
      const prior = this.db.prepare("SELECT target_id FROM form_copies WHERE project_id = ? AND request_id = ?").get(target, "receive:" + requestId) as { target_id: string } | undefined;
      if (prior) return this.get(prior.target_id, target);
      const created = this.create({ title, project_id: target });
      const filled = this.update(created.id, { questions, expected_version: created.version }, target);
      this.db.prepare("INSERT INTO form_copies (project_id, request_id, source_id, target_id, created_at) VALUES (?, ?, ?, ?, ?)").run(target, "receive:" + requestId, "", filled.id, filled.updated_at);
      return filled;
    });
  }

  /** Stop collecting: the fill page says so and takes no more answers; answers already in stay. */
  closeCollection(id: string, projectId?: string, expectedVersion?: number): FormRecord {
    const current = this.get(id, projectId);
    this.assertVersion(current, expectedVersion);
    const next: FormRecord = { ...current, status: "closed", updated_at: new Date().toISOString(), version: current.version + 1 };
    const result = this.db.prepare("UPDATE forms SET status = ?, updated_at = ?, version = ? WHERE id = ? AND version = ?")
      .run(next.status, next.updated_at, next.version, id, current.version);
    if (result.changes !== 1) throw new FormError("form.conflict", "问卷已改变，请重新读取后再停止收集");
    return next;
  }

  /**
   * Answer files people sent back from the exported fill page. Each file is untrusted: it must name this form, carry
   * its own question snapshot and valid answers. The same answer imported twice counts once.
   *
   * `source` is who imports, in the words of a submission's source: the person at the Host's own page (`preview`, the
   * default) or the audience that called. Whoever imports, what comes in is recorded as `file`. While the form is not
   * collecting, only the person imports; any other caller is refused as a whole, before a file is read.
   */
  importAnswers(id: string, files: readonly { name: string; content: string }[], projectId?: string,
    options: { source?: Exclude<FormSubmissionSource, "file"> } = {}): { imported: number; skipped: number; rejected: { name: string; reason: string }[] } {
    return this.transaction(() => {
      const form = this.get(id, projectId);
      assertTakesAnswers(form, options.source ?? "preview", "import");
      let imported = 0, skipped = 0;
      const rejected: { name: string; reason: string }[] = [];
      for (const file of files) {
        const name = String(file.name ?? "").slice(0, 200) || "答卷";
        try {
          if (file.content.length > 400_000) throw new FormError("form.invalid", "文件过大，不像一份答卷");
          const parsed = JSON.parse(file.content) as Record<string, unknown>;
          if (parsed.format !== FORM_ANSWER_FORMAT) throw new FormError("form.invalid", "不是 Molis 问卷答卷文件");
          if (parsed.form_id !== form.id) throw new FormError("form.invalid", "这份答卷属于另一份问卷");
          const answerId = typeof parsed.answer_id === "string" && /^[A-Za-z0-9-]{8,80}$/u.test(parsed.answer_id) ? parsed.answer_id : "";
          if (!answerId) throw new FormError("form.invalid", "答卷缺少编号");
          const requestId = "file:" + answerId;
          if (this.db.prepare("SELECT 1 FROM submissions WHERE form_id = ? AND request_id = ?").get(id, requestId)) { skipped += 1; continue; }
          const questions = normalizeQuestions(Array.isArray(parsed.questions) ? parsed.questions as FormQuestionInput[] : []);
          const answers = normalizeAnswers(questions, (parsed.answers && typeof parsed.answers === "object" ? parsed.answers : {}) as Record<string, string>);
          const at = typeof parsed.submitted_at === "string" && Number.isFinite(Date.parse(parsed.submitted_at)) ? new Date(parsed.submitted_at).toISOString() : new Date().toISOString();
          if (!Number.isSafeInteger(parsed.form_version) || Number(parsed.form_version) < 1) throw new FormError("form.invalid", "答卷缺少问卷版本");
          const version = Number(parsed.form_version);
          this.db.prepare("INSERT INTO submissions (id, form_id, answers_json, submitted_at, form_version, questions_json, request_id, source) VALUES (?, ?, ?, ?, ?, ?, ?, 'file')")
            .run(crypto.randomUUID(), id, JSON.stringify(answers), at, version, JSON.stringify(questions), requestId);
          imported += 1;
        } catch (error) {
          rejected.push({ name, reason: error instanceof FormError ? error.message : "文件内容无法读取" });
        }
      }
      return { imported, skipped, rejected };
    });
  }

  /** Move to another partition; the id stays and its answers go with it. Fixed versions stay with the old place. */
  relocate(id: string, from: string, to: string): FormRecord {
    const target = normalizeProjectId(to);
    return this.transaction(() => {
      const current = this.get(id, from);
      if (current.publication_pending) throw new FormError("form.publication_pending", "上次固定版本还没存完，请先在原位置恢复，再移动");
      // A move is not an edit: the content and its version stay as they were, so work that recorded this version still matches.
      const result = this.db.prepare("UPDATE forms SET project_id = ?, artifact_id = '', artifact_version = 0 WHERE id = ? AND version = ?")
        .run(target, id, current.version);
      if (result.changes !== 1) throw new FormError("form.conflict", "问卷刚被修改，请重新读取后再移动");
      return this.get(id, target);
    });
  }

  /** A copy of the questions in another partition, without answers and not collecting; the same request returns the same copy. */
  duplicate(id: string, from: string, to: string, requestId: string): FormRecord {
    const target = normalizeProjectId(to);
    return this.transaction(() => {
      const prior = this.db.prepare("SELECT target_id FROM form_copies WHERE project_id = ? AND request_id = ?").get(target, requestId) as { target_id: string } | undefined;
      if (prior) return this.get(prior.target_id, target);
      const source = this.get(id, from);
      const now = new Date().toISOString();
      const copy: FormRecord = { id: crypto.randomUUID(), project_id: target, title: source.title, description: source.description, status: "draft", share_id: null,
        questions: source.questions, created_at: now, updated_at: now, version: 1, artifact_id: "", artifact_version: 0 };
      this.db.prepare("INSERT INTO forms (id, project_id, title, description, status, share_id, questions_json, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        .run(copy.id, copy.project_id, copy.title, copy.description, copy.status, null, JSON.stringify(copy.questions), now, now, 1);
      this.db.prepare("INSERT INTO form_copies (project_id, request_id, source_id, target_id, created_at) VALUES (?, ?, ?, ?, ?)").run(target, requestId, id, copy.id, now);
      return copy;
    });
  }

  delete(id: string, projectId?: string, expectedVersion?: number): void {
    this.transaction(() => {
      const current = this.get(id, projectId); this.assertVersion(current, expectedVersion);
      if (current.publication_pending) throw new FormError("form.publication_pending", "请先恢复上次成果发布，再删除问卷");
      this.db.prepare("DELETE FROM submissions WHERE form_id = ?").run(id);
      this.db.prepare("DELETE FROM forms WHERE id = ?").run(id);
    });
  }

  generateQuestions(id: string, prompt: string, projectId?: string, expectedVersion?: number): FormRecord {
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
    return this.update(id, { questions: [...current.questions, question], expected_version: expectedVersion ?? current.version }, projectId);
  }

  submit(id: string, answers: Readonly<Record<string, string>>, projectId?: string,
    options: { expectedVersion?: number; requestId?: string; source?: Exclude<FormSubmissionSource, "file"> } = {}): FormSubmissionRecord {
    return this.transaction(() => {
      const form = this.get(id, projectId);
      const source = options.source ?? "preview";
      assertTakesAnswers(form, source);
      if (options.requestId) {
        const existing = this.db.prepare("SELECT * FROM submissions WHERE form_id = ? AND request_id = ?").get(id, options.requestId) as SubmissionRow | undefined;
        if (existing) {
          const prior = submissionFromRow(existing);
          const normalized = normalizeAnswers(prior.questions, answers);
          if (options.expectedVersion !== undefined && prior.form_version !== options.expectedVersion
            || Object.keys(normalized).some(key => prior.answers[key] !== normalized[key]))
            throw new FormError("form.request_conflict", "这次提交已保存为其他内容，请重新填写后提交");
          return prior;
        }
      }
      this.assertVersion(form, options.expectedVersion);
      const normalized = normalizeAnswers(form.questions, answers);
      const submission: FormSubmissionRecord = { id: crypto.randomUUID(), form_id: id, answers: normalized,
        submitted_at: new Date().toISOString(), form_version: form.version, questions: form.questions, source };
      this.db.prepare("INSERT INTO submissions (id, form_id, answers_json, submitted_at, form_version, questions_json, request_id, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
        .run(submission.id, id, JSON.stringify(normalized), submission.submitted_at, form.version, JSON.stringify(form.questions), options.requestId ?? null, source);
      return submission;
    });
  }

  listSubmissions(id: string, projectId?: string): FormSubmissionRecord[] {
    this.get(id, projectId);
    const rows = this.db.prepare(
      "SELECT * FROM submissions WHERE form_id = ? ORDER BY datetime(submitted_at) DESC",
    ).all(id) as unknown as SubmissionRow[];
    return rows.map(submissionFromRow);
  }

  analyze(id: string, projectId?: string): { form_id: string; submission_count: number } {
    this.get(id, projectId);
    const row = this.db.prepare(
      "SELECT COUNT(*) AS count FROM submissions WHERE form_id = ?",
    ).get(id) as { count: number };
    return { form_id: id, submission_count: Number(row.count) };
  }
  beginPublication(id: string, projectId: string, actorId: string, expectedVersion?: number, existing?: FormPublicationSnapshot, version?: number): FormPublicationIntent {
    return this.transaction(() => {
      const current = this.get(id, projectId); this.assertVersion(current, expectedVersion);
      const pending = this.publicationIntent(id);
      if (pending) {
        if (pending.actor_id !== actorId) throw new FormError("form.publication_owner", "请由上次发布的发起者恢复，原快照已保留");
        return pending;
      }
      const intent: FormPublicationIntent = { content: existing ?? { title: current.title, description: current.description, status: current.status, questions: current.questions },
        version: version ?? current.artifact_version + 1, source_version: current.version, actor_id: actorId };
      this.db.prepare("UPDATE forms SET publication_pending_json = ? WHERE id = ?").run(JSON.stringify(intent), id);
      return intent;
    });
  }

  completePublication(id: string, projectId: string, intent: FormPublicationIntent, artifact: { artifact_id: string; version: number }): FormRecord {
    return this.transaction(() => {
      const current = this.get(id, projectId);
      if (current.artifact_id === artifact.artifact_id && current.artifact_version >= intent.version) return current;
      if (JSON.stringify(this.publicationIntent(id)) !== JSON.stringify(intent)) throw new FormError("form.publication_conflict", "发布记录已改变，请重新读取问卷");
      this.db.prepare("UPDATE forms SET artifact_id = ?, artifact_version = ?, updated_at = ?, version = version + 1, publication_pending_json = NULL WHERE id = ?")
        .run(artifact.artifact_id, artifact.version, new Date().toISOString(), id);
      return this.get(id, projectId);
    });
  }

  private publicationIntent(id: string): FormPublicationIntent | null {
    const row = this.db.prepare("SELECT publication_pending_json FROM forms WHERE id = ?").get(id) as { publication_pending_json: string | null };
    return row.publication_pending_json ? JSON.parse(row.publication_pending_json) as FormPublicationIntent : null;
  }
  private assertVersion(current: FormRecord, expectedVersion?: number): void {
    if (expectedVersion !== undefined && expectedVersion !== current.version) throw new FormError("form.conflict", "问卷已被其他窗口修改，请重新读取；当前草稿未覆盖服务器内容");
  }
  private transaction<T>(run: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try { const result = run(); this.db.exec("COMMIT"); return result; }
    catch (error) { this.db.exec("ROLLBACK"); throw error; }
  }


}

/**
 * The form store's one current schema (repository-anti-corruption §4.1): new stores are created from it, existing ones
 * must already be at its version. Columns keep the order existing stores have them in.
 */
export const FORM_STORE_BASELINE: SqliteBaseline = { version: 2, schema: `
  CREATE TABLE forms (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT NOT NULL,
    share_id TEXT,
    questions_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    version INTEGER NOT NULL,
    project_id TEXT NOT NULL DEFAULT '',
    artifact_id TEXT NOT NULL DEFAULT '',
    artifact_version INTEGER NOT NULL DEFAULT 0,
    publication_pending_json TEXT
  );
  CREATE TABLE submissions (
    id TEXT PRIMARY KEY,
    form_id TEXT NOT NULL,
    answers_json TEXT NOT NULL,
    submitted_at TEXT NOT NULL,
    form_version INTEGER NOT NULL,
    questions_json TEXT NOT NULL,
    request_id TEXT,
    source TEXT NOT NULL
  );
  CREATE UNIQUE INDEX submissions_request ON submissions (form_id, request_id) WHERE request_id IS NOT NULL;
  CREATE TABLE form_copies (project_id TEXT NOT NULL, request_id TEXT NOT NULL, source_id TEXT NOT NULL, target_id TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY (project_id, request_id));
` };

export function openFormStore(homeDirectory: string): FormStore {
  const db = openBaselineHomeSqlite(homeDirectory, "form", FORM_STORE_BASELINE);
  return new FormStore(db);
}

function fromRow(row: FormRow): FormRecord {
  const pending = row.publication_pending_json ? JSON.parse(row.publication_pending_json) as FormPublicationIntent : null;
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
    artifact_id: row.artifact_id ?? "",
    artifact_version: Number(row.artifact_version) || 0,
    ...(pending ? { publication_pending: { version: pending.version, source_version: pending.source_version } } : {}),
  };
}

function submissionFromRow(row: SubmissionRow): FormSubmissionRecord {
  return { id: row.id, form_id: row.form_id, answers: JSON.parse(row.answers_json), submitted_at: row.submitted_at,
    form_version: row.form_version, questions: JSON.parse(row.questions_json) as FormQuestion[], source: row.source as FormSubmissionSource };
}

/**
 * A form takes answers while it is collecting (`published`). A draft, and a form whose collection stopped, take only what
 * the person does at the Host's own page (`preview`): the trial fill, and importing the answer files people sent back,
 * which the page promises still works after collection stops. The fill page is for collecting, and what an agent, an
 * external tool, a workflow or a plugin submits or imports is refused until the person starts collecting. Checked in the
 * submit or import transaction, so a form that is stopped between the check and the write cannot take the answer.
 */
function assertTakesAnswers(form: FormRecord, source: Exclude<FormSubmissionSource, "file">, how: "submit" | "import" = "submit"): void {
  if (form.status === "published" || source === "preview") return;
  const stopped = form.status === "closed", reason = stopped ? "这份问卷已停止收集答卷" : "这份问卷还没有开始收集答卷";
  if (source === "fill") throw new FormError("form.closed", reason);
  const what = how === "import" ? "导入答卷文件" : "提交";
  throw new FormError("form.closed", reason + (stopped
    ? `，助理、外部工具、工作流和插件不能再${what}；需要继续收集时，请本人在问卷里重新开始收集`
    : `，助理、外部工具、工作流和插件暂时不能${what}；请本人先在问卷里开始收集`));
}

function normalizeProjectId(value: string): string {
  const id = value.trim();
  if (!id) throw new FormError("form.invalid", "缺少项目");
  if (id.length > 80) throw new FormError("form.invalid", "项目标识过长");
  return id;
}

function normalizeTitle(value: string): string {
  const title = value.trim() || "未命名问卷";
  if (title.length > FORM_TITLE_LIMIT) throw new FormError("form.invalid", `标题须为 1 到 ${FORM_TITLE_LIMIT} 个字`);
  return title;
}

function normalizeDescription(value: string): string {
  if (value.length > 2000) throw new FormError("form.invalid", "说明须为 0 到 2000 个字");
  return value;
}

function usesOptions(type: FormQuestionType): boolean {
  return type === "singleChoice" || type === "multiChoice" || type === "dropdown";
}

function normalizeQuestions(value: readonly FormQuestionInput[]): FormQuestion[] {
  if (!Array.isArray(value)) throw new FormError("form.invalid", "题目须是列表");
  if (value.length > FORM_QUESTION_LIMIT) throw new FormError("form.invalid", `最多 ${FORM_QUESTION_LIMIT} 题`);
  const normalized = value.map((question: FormQuestionInput, index) => {
    const type = question.type && QUESTION_TYPES.includes(question.type) ? question.type : "text";
    const title = String(question.title ?? "").trim() || `问题 ${index + 1}`;
    if (title.length > 200) throw new FormError("form.invalid", "题目标题须为 1 到 200 个字");
    const options = usesOptions(type)
      ? (question.options ?? []).map((option: Partial<FormOption>, optionIndex: number) => ({
        id: option.id || crypto.randomUUID(),
        label: String(option.label ?? "").trim() || `选项 ${optionIndex + 1}`,
      }))
      : undefined;
    if (options && new Set(options.map(option => option.id)).size !== options.length) throw new FormError("form.invalid", "选项标识不能重复");
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
  if (new Set(normalized.map(question => question.id)).size !== normalized.length) throw new FormError("form.invalid", "题目标识不能重复");
  return normalized;
}

function normalizeAnswers(
  questions: readonly FormQuestion[],
  answers: Readonly<Record<string, string>>,
): Record<string, string> {
  const next: Array<[string, string]> = [];
  const ids = new Set(questions.map(question => question.id));
  if (Object.keys(answers).some(key => !ids.has(key))) throw new FormError("form.invalid", "答卷含有不存在的题目，请重新读取问卷");
  for (const question of questions) {
    const value = String(answers[question.id] ?? "").trim();
    if (question.required && !value) {
      throw new FormError("form.invalid", `请回答：${question.title}`);
    }
    if (value.length > 4000) throw new FormError("form.invalid", "回答过长");
    if (value && usesOptions(question.type)) {
      const allowed = new Set((question.options ?? []).map(option => option.label));
      const values = question.type === "multiChoice" ? value.split("\n") : [value];
      if (values.some(item => !allowed.has(item)) || new Set(values).size !== values.length) throw new FormError("form.invalid", `请选择有效选项：${question.title}`);
    }
    if (value && question.type === "rating" && !/^[1-5]$/.test(value)) throw new FormError("form.invalid", "评分须为 1 到 5");
    if (value && question.type === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value))
      throw new FormError("form.invalid", "请填写有效日期");
    next.push([question.id, value]);
  }
  return Object.fromEntries(next);
}

export type { FormOption };
