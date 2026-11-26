import { ActionError, sameCarriedRecord, type ActionExecutionContext, type PlacementExport, type PlacementRecord } from "@molis-ai/molis-work-contracts/platform/actions";
import type {
  FormOption,
  FormQuestion,
  FormQuestionInput,
  FormQuestionType,
  FormRecord,
  FormStatus,
  FormSubmissionRecord,
  FormSubmissionSource,
} from "./contract.js";
import { formErrors } from "./error.js";
import { FORM_ANSWER_FORMAT, FORM_ANSWER_LIMIT } from "./fillpage.js";

import { FORM_DATABASE } from "./database.js";
export { FORM_DATABASE };

type FormRow = {
  id: string;
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
};

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

/**
 * The SQL the store runs: its own connection to a partition's `libraries/form.db`, or the library the Runtime gives the plugin, inside one write
 * transaction or read-only. Reads are SELECT; writes are INSERT, UPDATE and DELETE.
 */
export interface FormSql {
  get(sql: string, parameters?: readonly FormSqlValue[]): Readonly<Record<string, unknown>> | null | undefined;
  all(sql: string, parameters?: readonly FormSqlValue[]): readonly Readonly<Record<string, unknown>>[];
  run(sql: string, parameters?: readonly FormSqlValue[]): { changes: number | bigint };
}
export type FormSqlValue = string | number | null;

/** Where the actions read and write: reads run on their own; a write waits for the call's authority and is one transaction. */
export interface FormStores {
  read<T>(run: (store: FormStore) => T): T;
  write<T>(caller: ActionExecutionContext, run: (store: FormStore) => T): Promise<T>;
}

/** Reads and writes on a store opened for each run (`withStore`), by a process with its own connection: tests, maintenance. */
export function ownFormStores(withStore: <T>(run: (store: FormStore) => T) => T): FormStores {
  return { read: withStore, async write(caller, run) { await caller.beforeEffect(); return withStore(run); } };
}

/** One partition's forms: the library is that partition's own, so a record's `project_id` is the partition this store was opened for. */
export class FormStore {
  /** `atomically` runs a write that takes several statements as one: a transaction of its own, or nothing more inside one. */
  constructor(private readonly db: FormSql, readonly partition: string, private readonly atomically: <T>(run: () => T) => T = run => run(), private readonly release: () => void = () => {}) {}

  close(): void {
    this.release();
  }

  list(): FormRecord[] {
    const rows = this.db.all("SELECT * FROM forms ORDER BY datetime(updated_at) DESC, title COLLATE NOCASE") as unknown as FormRow[];
    return rows.map(row => fromRow(row, this.partition));
  }

  get(id: string): FormRecord {
    const row = this.db.get("SELECT * FROM forms WHERE id = ?", [id]) as FormRow | undefined;
    if (!row) throw formErrors.not_found("找不到这份问卷");
    return fromRow(row, this.partition);
  }

  create(input: { title?: string }): FormRecord {
    const now = new Date().toISOString();
    const record: FormRecord = {
      id: crypto.randomUUID(),
      project_id: this.partition,
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
    this.db.run("INSERT INTO forms (id, title, description, status, share_id, questions_json, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [record.id, record.title, record.description, record.status, record.share_id,
      JSON.stringify(record.questions), record.created_at, record.updated_at, record.version]);
    return record;
  }

  update(id: string, patch: {
    title?: string;
    description?: string;
    questions?: readonly FormQuestionInput[];
    expected_version?: number;
  }): FormRecord {
    const current = this.get(id);
    assertFormVersion(current, patch.expected_version);
    const next: FormRecord = {
      ...current,
      title: patch.title !== undefined ? normalizeTitle(patch.title) : current.title,
      description: patch.description !== undefined ? normalizeDescription(patch.description) : current.description,
      questions: patch.questions !== undefined ? normalizeQuestions(patch.questions) : current.questions,
      updated_at: new Date().toISOString(),
      version: current.version + 1,
    };
    const result = this.db.run("UPDATE forms SET title = ?, description = ?, questions_json = ?, updated_at = ?, version = ? WHERE id = ? AND version = ?", [next.title, next.description, JSON.stringify(next.questions), next.updated_at, next.version, id, current.version]);
    if (result.changes !== 1) throw formErrors.conflict("问卷已改变，请重新读取后保存");
    return next;
  }

  publish(id: string, expectedVersion?: number): FormRecord {
    const current = this.get(id);
    assertFormVersion(current, expectedVersion);
    const share_id = current.share_id ?? crypto.randomUUID().slice(0, 12);
    const next: FormRecord = {
      ...current,
      status: "published",
      share_id,
      updated_at: new Date().toISOString(),
      version: current.version + 1,
    };
    const result = this.db.run("UPDATE forms SET status = ?, share_id = ?, updated_at = ?, version = ? WHERE id = ? AND version = ?", [next.status, next.share_id, next.updated_at, next.version, id, current.version]);
    if (result.changes !== 1) throw formErrors.conflict("问卷已改变，请重新读取后发布");
    return next;
  }

  /** A form made from a list of questions another plugin hands over; one delivery makes one form. */
  receive(requestId: string, title: string, questions: readonly FormQuestionInput[]): FormRecord {
    return this.atomically(() => {
      const prior = this.db.get("SELECT target_id FROM form_copies WHERE request_id = ?", ["receive:" + requestId]) as { target_id: string } | undefined;
      if (prior) return this.get(prior.target_id);
      const created = this.create({ title });
      const filled = this.update(created.id, { questions, expected_version: created.version });
      this.db.run("INSERT INTO form_copies (request_id, source_id, target_id, created_at) VALUES (?, ?, ?, ?)", ["receive:" + requestId, "", filled.id, filled.updated_at]);
      return filled;
    });
  }

  /** Stop collecting: the fill page says so and takes no more answers; answers already in stay. */
  closeCollection(id: string, expectedVersion?: number): FormRecord {
    const current = this.get(id);
    assertFormVersion(current, expectedVersion);
    const next: FormRecord = { ...current, status: "closed", updated_at: new Date().toISOString(), version: current.version + 1 };
    const result = this.db.run("UPDATE forms SET status = ?, updated_at = ?, version = ? WHERE id = ? AND version = ?", [next.status, next.updated_at, next.version, id, current.version]);
    if (result.changes !== 1) throw formErrors.conflict("问卷已改变，请重新读取后再停止收集");
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
  importAnswers(id: string, files: readonly { name: string; content: string }[],
    options: { source?: Exclude<FormSubmissionSource, "file"> } = {}): { imported: number; skipped: number; rejected: { name: string; reason: string }[] } {
    return this.atomically(() => {
      const form = this.get(id);
      assertTakesAnswers(form, options.source ?? "preview", "import");
      let imported = 0, skipped = 0;
      const rejected: { name: string; reason: string }[] = [];
      for (const file of files) {
        const name = [...String(file.name ?? "")].slice(0, 200).join("") || "答卷";
        try {
          // The store's own size guard counts UTF-8 bytes, the size the file has on disk; the import action's schema counts code points
          // instead (content.maxLength 400,000, Ajv), so that layer is a little looser. A file of 40 questions whose answers are 4000
          // 汉字 each has about 480,000 bytes, so this guard refuses it as too large rather than reading it.
          if (Buffer.byteLength(file.content) > 400_000) throw formErrors.invalid("文件过大，不像一份答卷");
          const parsed = JSON.parse(file.content) as Record<string, unknown>;
          if (parsed.format !== FORM_ANSWER_FORMAT) throw formErrors.invalid("不是 Molis 问卷答卷文件");
          if (parsed.form_id !== form.id) throw formErrors.invalid("这份答卷属于另一份问卷");
          const answerId = typeof parsed.answer_id === "string" && /^[A-Za-z0-9-]{8,80}$/u.test(parsed.answer_id) ? parsed.answer_id : "";
          if (!answerId) throw formErrors.invalid("答卷缺少编号");
          const requestId = "file:" + answerId;
          if (this.db.get("SELECT 1 FROM submissions WHERE form_id = ? AND request_id = ?", [id, requestId])) { skipped += 1; continue; }
          const questions = normalizeQuestions(Array.isArray(parsed.questions) ? parsed.questions as FormQuestionInput[] : []);
          const answers = normalizeAnswers(questions, (parsed.answers && typeof parsed.answers === "object" ? parsed.answers : {}) as Record<string, string>);
          const at = typeof parsed.submitted_at === "string" && Number.isFinite(Date.parse(parsed.submitted_at)) ? new Date(parsed.submitted_at).toISOString() : new Date().toISOString();
          if (!Number.isSafeInteger(parsed.form_version) || Number(parsed.form_version) < 1) throw formErrors.invalid("答卷缺少问卷版本");
          const version = Number(parsed.form_version);
          this.db.run("INSERT INTO submissions (id, form_id, answers_json, submitted_at, form_version, questions_json, request_id, source) VALUES (?, ?, ?, ?, ?, ?, ?, 'file')", [crypto.randomUUID(), id, JSON.stringify(answers), at, version, JSON.stringify(questions), requestId]);
          imported += 1;
        } catch (error) {
          rejected.push({ name, reason: error instanceof ActionError ? error.message : "文件内容无法读取" });
        }
      }
      return { imported, skipped, rejected };
    });
  }

  /**
   * One form as the record placement carries to another partition (`placement.export`): its questions, whether it collects, and every
   * answer people gave it. Its pinned versions stay with this place's results.
   */
  exportRecord(id: string): PlacementExport {
    const current = this.get(id);
    const submissions = this.db.all("SELECT id, answers_json, submitted_at, form_version, questions_json, request_id, source FROM submissions WHERE form_id = ? ORDER BY rowid", [id])
      .map(row => JSON.stringify(row));
    const { title, description, status, share_id, questions, created_at, updated_at, version } = current;
    return { subject: { kind: "form", id }, revision: String(version),
      record: { title, description, status, share_id, questions_json: JSON.stringify(questions), created_at, updated_at, version, submissions } };
  }

  /**
   * Writes a carried form here (`placement.put`). With `targetId` (a move) it keeps its id, version, sharing and answers, replacing what an
   * earlier attempt of the same move put; without (a copy) it is a new draft of the same questions with no answers, and the same request
   * makes the same one. Pinned versions belonged to where it came from, so the numbering starts again here.
   */
  putRecord(record: PlacementRecord, requestId: string, targetId?: string): FormRecord {
    const carried = carriedForm(record);
    return this.atomically(() => {
      if (targetId === undefined) {
        const prior = this.db.get("SELECT target_id FROM form_copies WHERE request_id = ?", ["copy:" + requestId]) as { target_id: string } | undefined;
        if (prior) return this.get(prior.target_id);
        const now = new Date().toISOString(), copyId = crypto.randomUUID();
        this.db.run("INSERT INTO forms (id, title, description, status, share_id, questions_json, created_at, updated_at, version) VALUES (?, ?, ?, 'draft', NULL, ?, ?, ?, 1)",
          [copyId, carried.title, carried.description, JSON.stringify(carried.questions), now, now]);
        this.db.run("INSERT INTO form_copies (request_id, source_id, target_id, created_at) VALUES (?, ?, ?, ?)", ["copy:" + requestId, "", copyId, now]);
        return this.get(copyId);
      }
      // An earlier attempt of the same move already put it here: only that exact record is a replay; anything written since is kept (conflict).
      if (this.db.get("SELECT 1 FROM forms WHERE id = ?", [targetId])) {
        // Compared with what this put would write (its own normalizing included), so a retry of the same move is found the same.
        if (sameCarriedRecord(this.exportRecord(targetId).record, { ...record, title: carried.title, description: carried.description, questions_json: JSON.stringify(carried.questions) })) return this.get(targetId);
        throw formErrors.conflict("目标位置已经有这份问卷，而且内容或答卷不同；没有覆盖它");
      }
      this.db.run("DELETE FROM submissions WHERE form_id = ?", [targetId]);
      this.db.run("INSERT INTO forms (id, title, description, status, share_id, questions_json, created_at, updated_at, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [targetId, carried.title, carried.description, carried.status, carried.share_id, JSON.stringify(carried.questions), carried.created_at, carried.updated_at, carried.version]);
      for (const row of carried.submissions) {
        this.db.run("INSERT INTO submissions (id, form_id, answers_json, submitted_at, form_version, questions_json, request_id, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [row.id, targetId, row.answers_json, row.submitted_at, row.form_version, row.questions_json, row.request_id, row.source]);
      }
      return this.get(targetId);
    });
  }

  /** Lets a form that went to another partition go from here (`placement.remove`), with its answers, only while it is still the version carried. */
  removeCarried(id: string, revision: string): boolean {
    return this.atomically(() => {
      const row = this.db.get("SELECT version, publication_pending_json FROM forms WHERE id = ?", [id]);
      if (!row) return false;
      if (row.publication_pending_json) throw formErrors.publication_pending("上次固定版本还没存完，请先在原位置恢复，再移动");
      if (String(row.version) !== revision) throw formErrors.conflict("问卷刚被修改，请重新读取后再移动");
      this.db.run("DELETE FROM submissions WHERE form_id = ?", [id]);
      return this.db.run("DELETE FROM forms WHERE id = ? AND version = ?", [id, row.version as number]).changes === 1;
    });
  }

  delete(id: string, expectedVersion?: number): void {
    this.atomically(() => {
      const current = this.get(id); assertFormVersion(current, expectedVersion);
      if (current.publication_pending) throw formErrors.publication_pending("请先恢复上次成果发布，再删除问卷");
      this.db.run("DELETE FROM submissions WHERE form_id = ?", [id]);
      this.db.run("DELETE FROM forms WHERE id = ?", [id]);
    });
  }

  generateQuestions(id: string, prompt: string, expectedVersion?: number): FormRecord {
    const current = this.get(id);
    const title = prompt.trim() || "请填写你的回答";
    if ([...title].length > 200) throw formErrors.invalid("出题提示须为 1 到 200 个字");
    const question: FormQuestion = {
      id: crypto.randomUUID(),
      type: "text",
      title,
      required: false,
      order: current.questions.length + 1,
    };
    return this.update(id, { questions: [...current.questions, question], expected_version: expectedVersion ?? current.version });
  }

  submit(id: string, answers: Readonly<Record<string, string>>,
    options: { expectedVersion?: number; requestId?: string; source?: Exclude<FormSubmissionSource, "file"> } = {}): FormSubmissionRecord {
    return this.atomically(() => {
      const form = this.get(id);
      const source = options.source ?? "preview";
      assertTakesAnswers(form, source);
      if (options.requestId) {
        const existing = this.db.get("SELECT * FROM submissions WHERE form_id = ? AND request_id = ?", [id, options.requestId]) as SubmissionRow | undefined;
        if (existing) {
          const prior = submissionFromRow(existing);
          const normalized = normalizeAnswers(prior.questions, answers);
          if (options.expectedVersion !== undefined && prior.form_version !== options.expectedVersion
            || Object.keys(normalized).some(key => prior.answers[key] !== normalized[key]))
            throw formErrors.request_conflict("这次提交已保存为其他内容，请重新填写后提交");
          return prior;
        }
      }
      assertFormVersion(form, options.expectedVersion);
      const normalized = normalizeAnswers(form.questions, answers);
      const submission: FormSubmissionRecord = { id: crypto.randomUUID(), form_id: id, answers: normalized,
        submitted_at: new Date().toISOString(), form_version: form.version, questions: form.questions, request_id: options.requestId ?? null, source };
      this.db.run("INSERT INTO submissions (id, form_id, answers_json, submitted_at, form_version, questions_json, request_id, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)", [submission.id, id, JSON.stringify(normalized), submission.submitted_at, form.version, JSON.stringify(form.questions), options.requestId ?? null, source]);
      return submission;
    });
  }

  listSubmissions(id: string): FormSubmissionRecord[] {
    this.get(id);
    const rows = this.db.all("SELECT * FROM submissions WHERE form_id = ? ORDER BY datetime(submitted_at) DESC", [id]) as unknown as SubmissionRow[];
    return rows.map(submissionFromRow);
  }

  analyze(id: string): { form_id: string; submission_count: number } {
    this.get(id);
    const row = this.db.get("SELECT COUNT(*) AS count FROM submissions WHERE form_id = ?", [id]) as { count: number };
    return { form_id: id, submission_count: Number(row.count) };
  }
}


export function assertFormVersion(current: FormRecord, expectedVersion?: number): void {
  if (expectedVersion !== undefined && expectedVersion !== current.version) throw formErrors.conflict("问卷已被其他窗口修改，请重新读取；当前草稿未覆盖服务器内容");
}

export function fromRow(row: FormRow, partition: string): FormRecord {
  const pending = row.publication_pending_json ? JSON.parse(row.publication_pending_json) as NonNullable<FormRecord["publication_pending"]> : null;
  return {
    id: row.id,
    project_id: partition,
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
  return { id: row.id, form_id: row.form_id, request_id: row.request_id, answers: JSON.parse(row.answers_json), submitted_at: row.submitted_at,
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
  if (source === "fill") throw formErrors.closed(reason);
  const what = how === "import" ? "导入答卷文件" : "提交";
  throw formErrors.closed(reason + (stopped
    ? `，助理、外部工具、工作流和插件不能再${what}；需要继续收集时，请本人在问卷里重新开始收集`
    : `，助理、外部工具、工作流和插件暂时不能${what}；请本人先在问卷里开始收集`));
}

function normalizeTitle(value: string): string {
  const title = value.trim() || "未命名问卷";
  if ([...title].length > FORM_TITLE_LIMIT) throw formErrors.invalid(`标题须为 1 到 ${FORM_TITLE_LIMIT} 个字`);
  return title;
}

function normalizeDescription(value: string): string {
  if ([...value].length > 2000) throw formErrors.invalid("说明须为 0 到 2000 个字");
  return value;
}

function usesOptions(type: FormQuestionType): boolean {
  return type === "singleChoice" || type === "multiChoice" || type === "dropdown";
}

function normalizeQuestions(value: readonly FormQuestionInput[]): FormQuestion[] {
  if (!Array.isArray(value)) throw formErrors.invalid("题目须是列表");
  if (value.length > FORM_QUESTION_LIMIT) throw formErrors.invalid(`最多 ${FORM_QUESTION_LIMIT} 题`);
  const normalized = value.map((question: FormQuestionInput, index) => {
    const type = question.type && QUESTION_TYPES.includes(question.type) ? question.type : "text";
    const title = String(question.title ?? "").trim() || `问题 ${index + 1}`;
    if ([...title].length > 200) throw formErrors.invalid("题目标题须为 1 到 200 个字");
    const options = usesOptions(type)
      ? (question.options ?? []).map((option: Partial<FormOption>, optionIndex: number) => ({
        id: option.id || crypto.randomUUID(),
        label: String(option.label ?? "").trim() || `选项 ${optionIndex + 1}`,
      }))
      : undefined;
    if (options && new Set(options.map(option => option.id)).size !== options.length) throw formErrors.invalid("选项标识不能重复");
    if (usesOptions(type) && (options?.length ?? 0) < 2) {
      throw formErrors.invalid("选择题至少两个选项");
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
  if (new Set(normalized.map(question => question.id)).size !== normalized.length) throw formErrors.invalid("题目标识不能重复");
  return normalized;
}

function normalizeAnswers(
  questions: readonly FormQuestion[],
  answers: Readonly<Record<string, string>>,
): Record<string, string> {
  const next: Array<[string, string]> = [];
  const ids = new Set(questions.map(question => question.id));
  if (Object.keys(answers).some(key => !ids.has(key))) throw formErrors.invalid("答卷含有不存在的题目，请重新读取问卷");
  for (const question of questions) {
    const value = Object.hasOwn(answers, question.id) ? String(answers[question.id] ?? "").trim() : "";
    if (question.required && !value) {
      throw formErrors.invalid(`请回答：${question.title}`);
    }
    if ([...value].length > FORM_ANSWER_LIMIT) throw formErrors.invalid("回答过长");
    if (value && usesOptions(question.type)) {
      const allowed = new Set((question.options ?? []).map(option => option.label));
      const values = question.type === "multiChoice" ? value.split("\n") : [value];
      if (values.some(item => !allowed.has(item)) || new Set(values).size !== values.length) throw formErrors.invalid(`请选择有效选项：${question.title}`);
    }
    if (value && question.type === "rating" && !/^[1-5]$/.test(value)) throw formErrors.invalid("评分须为 1 到 5");
    if (value && question.type === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value))
      throw formErrors.invalid("请填写有效日期");
    next.push([question.id, value]);
  }
  return Object.fromEntries(next);
}

const SUBMISSION_SOURCES: readonly string[] = ["preview", "fill", "file", "agent", "mcp", "workflow", "plugin"];

/** A carried form's record, as `exportRecord` wrote it; its questions and every answer are checked before a row is written. */
function carriedForm(record: PlacementRecord): Omit<FormRecord, "id" | "project_id" | "artifact_id" | "artifact_version"> & { submissions: SubmissionRow[] } {
  const { title, description, status, share_id, questions_json, created_at, updated_at, version, submissions } = record;
  const invalid = () => formErrors.invalid("带来的问卷内容不完整");
  if (typeof title !== "string" || typeof description !== "string" || !["draft", "published", "closed"].includes(status as string)
    || share_id !== null && typeof share_id !== "string" || typeof questions_json !== "string" || typeof created_at !== "string" || typeof updated_at !== "string"
    || !Number.isSafeInteger(version) || (version as number) < 1 || !Array.isArray(submissions) || submissions.some(row => typeof row !== "string")) throw invalid();
  const parse = (text: string): unknown => { try { return JSON.parse(text); } catch { throw invalid(); } };
  const rows = (submissions as string[]).map(text => {
    const row = parse(text) as Partial<SubmissionRow> | null;
    if (!row || typeof row.id !== "string" || !row.id || typeof row.answers_json !== "string" || typeof row.submitted_at !== "string"
      || !Number.isSafeInteger(row.form_version) || typeof row.questions_json !== "string" || row.request_id !== null && typeof row.request_id !== "string"
      || !SUBMISSION_SOURCES.includes(row.source as string)) throw invalid();
    normalizeAnswers(normalizeQuestions(parse(row.questions_json) as FormQuestionInput[]), parse(row.answers_json) as Record<string, string>);
    return row as SubmissionRow;
  });
  return { title: normalizeTitle(title), description: normalizeDescription(description), status: status as FormStatus, share_id: share_id as string | null,
    questions: normalizeQuestions(parse(questions_json) as FormQuestionInput[]), created_at, updated_at, version: version as number, submissions: rows };
}
