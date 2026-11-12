import {
  ACTION_REFERENCE_SCHEMA, inputSchemaFor, type ActionAudience, type ActionDefinition, type ActionSchema, type ExactActionReference,
} from "../platform/actions.js";
import {
  CONTENT_ADOPTION_RESULT_SCHEMA, contentAdoptionInputSchema, contentAdoptionReadInputSchema, contentAdoptionReadOutputSchema,
  type ContentAdoptionInput, type ContentAdoptionQuery, type ContentAdoptionReadResult, type ContentAdoptionResult,
} from "../platform/blueprints.js";
import { closedObjectSchema } from "../platform/closed-object-schema.js";
import type { ContractDescriptor } from "../platform/package.js";
import type { SandboxSchema } from "../platform/plugin-sandbox.js";

/** The homepage service's public contract (specs/scene-and-page-contract/spec.md §6): the basic homepage, generated page versions and their approval; the page's run is batch 37's. */
export const servicesHomeContract = {
  contractId: /* @version contract.io.molis.work.service.home "io.molis.work.service.home.v{version}" */ "io.molis.work.service.home.v1",
  kind: "service",
  schemaVersion: /* @version contract.io.molis.work.service.home */ 1,
  maturity: "contract-only",
  ssot: "specs/scene-and-page-contract/spec.md",
} as const satisfies ContractDescriptor;

export const HOME_PAGE_CONTENT_TYPE = /* @version type.molis.home-page "molis.home-page.v{version}" */ "molis.home-page.v1";
export const HOME_PAGE_LIMITS = { files: 64, fileBytes: 1024 * 1024, totalBytes: 4 * 1024 * 1024 } as const;

const mediaTypes = ["text/html", "text/javascript", "text/css"] as const;
const authors = ["assistant", "person"] as const;
const approvalOperations = ["adopt", "restore"] as const;
const fileChanges = ["added", "modified", "deleted"] as const;

export interface HomePageRef { page_id: string; version: number }
export type HomePageMediaType = (typeof mediaTypes)[number];
export interface HomePageFile { path: string; media_type: HomePageMediaType; text: string }
export interface HomePageFileMetadata { path: string; media_type: HomePageMediaType; bytes: number; sha256: string }

export interface HomePageDraft {
  title: string;
  entry: string;
  actions: ExactActionReference[];
  files: HomePageFile[];
}

export interface HomePageVersion extends HomePageRef {
  title: string;
  files: HomePageFileMetadata[];
  entry: string;
  actions: ExactActionReference[];
  author: (typeof authors)[number];
  based_on?: number;
  created_at: string;
}

export type HomeBasicSelection = { kind: "basic" };
export type HomeGeneratedPageSelection = { kind: "page" } & HomePageRef;
export type HomeSelection = HomeBasicSelection | HomeGeneratedPageSelection;
export interface HomeSelectionState { selection: HomeSelection; revision: string }
export interface HomePageApproval { page: HomePageRef; approved_actions: ExactActionReference[]; approved_at: string }
export type HomePageApprovalOperation = (typeof approvalOperations)[number];
export interface HomePageApprovalReceipt<Operation extends HomePageApprovalOperation = HomePageApprovalOperation> {
  operation: Operation;
  request_id: string;
  selection: HomeGeneratedPageSelection;
  revision: string;
  approval: HomePageApproval;
}

export interface HomePageApprovalReadQuery { by: "approval_request"; operation: HomePageApprovalOperation; request_id: string }
export type HomePageApprovalReadResult =
  | { kind: "receipt"; receipt: HomePageApprovalReceipt; current: HomeSelectionState }
  | { kind: "missing"; current: HomeSelectionState };

export interface HomePageVersionSummary extends HomePageVersion { approval: HomePageApproval | null }
export interface HomePageOverview extends HomeSelectionState { versions: HomePageVersionSummary[] }
export type HomePageReadInput = Record<string, never> | { queries: Array<ContentAdoptionQuery<HomePageDraft> | HomePageApprovalReadQuery> };
export type HomePageReadResult = HomePageOverview | {
  results: Array<ContentAdoptionReadResult | HomePageApprovalReadResult>;
};

export type HomePageDirectDraftSaveInput =
  | { draft: HomePageDraft }
  | { draft: HomePageDraft; page_id: string; expected_version: number; based_on?: number };
export type HomePageDraftSaveInput = HomePageDirectDraftSaveInput | ContentAdoptionInput<HomePageDraft>;
export interface HomePageDirectDraftSaveResult { version: HomePageVersion }
/** In an adoption receipt, subject identifies the page and revision is the immutable draft version. */
export type HomePageDraftSaveResult = HomePageDirectDraftSaveResult | ContentAdoptionResult;
export interface HomePagePreviewResult { page: HomePageRef; page_session_id: string }
export interface HomePageFilesResult { version: HomePageVersion; files: HomePageFile[] }

export interface HomePageApprovalInput extends HomePageRef { approved_actions: ExactActionReference[]; request_id: string; expected_revision: string }
export interface HomePageSelectInput extends HomeBasicSelection { request_id: string; expected_revision: string }
export interface HomePageSelectResult { selection: HomeBasicSelection; revision: string; approval: null }

export interface HomePageDiffInput { page_id: string; from_version: number; to_version: number }
export interface HomePageDiffResult extends HomePageDiffInput {
  files: Array<{ path: string; kind: (typeof fileChanges)[number] }>;
  entry: { before: string; after: string };
  actions: { added: ExactActionReference[]; removed: ExactActionReference[] };
}

const text = { type: "string", minLength: 1 } as const;
const token = { type: "string", pattern: "\\S" } as const;
const version = { type: "integer", minimum: 1, maximum: Number.MAX_SAFE_INTEGER } as const;
const dateTime = { type: "string", format: "date-time" } as const;
const nullValue = { type: "null" } as const;
const pageRef = { page_id: token, version };
const pageRefSchema = inputSchemaFor<HomePageRef>()(closedObjectSchema(pageRef));
const fileList = <const S extends object>(items: S) => ({ type: "array", minItems: 1, maxItems: HOME_PAGE_LIMITS.files, items } as const);
const exactFields = [...ACTION_REFERENCE_SCHEMA.required, "provider_id"] as const;
const exactAction = {
  ...ACTION_REFERENCE_SCHEMA,
  properties: { ...ACTION_REFERENCE_SCHEMA.properties, version },
  required: [...exactFields],
} satisfies SandboxSchema;
const actions = { type: "array", maxItems: 100, items: exactAction } as const;
const fileIdentity = { path: text, media_type: { type: "string", enum: [...mediaTypes] } satisfies SandboxSchema };
const sourceFile = closedObjectSchema({ ...fileIdentity, text: { type: "string" } });
const sandboxFile = { ...sourceFile, required: [...sourceFile.required] } satisfies SandboxSchema;
const pageContent = { title: text, entry: text, actions };
const draftShape = closedObjectSchema({ ...pageContent, files: fileList(sandboxFile) });
const draft = { ...draftShape, required: [...draftShape.required] } satisfies SandboxSchema;

/** Also the body schema of the homepage content proposal. The SDK checks paths, bytes, and exact references. */
export const HOME_PAGE_DRAFT_SCHEMA: SandboxSchema = draft;

const metadata = closedObjectSchema({
  ...fileIdentity, bytes: { type: "integer", minimum: 0, maximum: HOME_PAGE_LIMITS.fileBytes }, sha256: { type: "string", pattern: "^[0-9a-f]{64}$" },
});
const versionFields = {
  ...pageRef, ...pageContent, files: fileList(metadata), author: { enum: authors }, based_on: version, created_at: dateTime,
};
const versionRequired = ["page_id", "version", "title", "entry", "actions", "files", "author", "created_at"] as const;
const pageVersion = closedObjectSchema(versionFields, versionRequired);
const directSaveResult = closedObjectSchema({ version: pageVersion });
const saveInput = { oneOf: [
  inputSchemaFor<{ draft: HomePageDraft }>()(closedObjectSchema({ draft })),
  inputSchemaFor<Extract<HomePageDirectDraftSaveInput, { page_id: string }>>()(
    closedObjectSchema({ draft, page_id: token, expected_version: version, based_on: version }, ["draft", "page_id", "expected_version"]),
  ),
  contentAdoptionInputSchema(draft),
] };
const saveResult = { oneOf: [directSaveResult, CONTENT_ADOPTION_RESULT_SCHEMA] };

const basic = closedObjectSchema({ kind: { const: "basic" } });
const generated = closedObjectSchema({ kind: { const: "page" }, ...pageRef });
const selection = { oneOf: [basic, generated] };
const state = { selection, revision: token };
const approval = closedObjectSchema({ page: pageRefSchema, approved_actions: actions, approved_at: dateTime });
const approvalReceiptFields = { request_id: token, selection: generated, revision: token, approval };
const approvalReceipt = closedObjectSchema({ operation: { enum: approvalOperations }, ...approvalReceiptFields });
const approvalReply = (operation: HomePageApprovalOperation) => closedObjectSchema({ operation: { const: operation }, ...approvalReceiptFields });
const approvalReadInput = inputSchemaFor<HomePageApprovalReadQuery>()(closedObjectSchema({
  by: { const: "approval_request" }, operation: { enum: approvalOperations }, request_id: token,
}));
const current = closedObjectSchema(state);
const readInput = { oneOf: [inputSchemaFor<Record<string, never>>()(closedObjectSchema({})), contentAdoptionReadInputSchema(draft, [approvalReadInput])] };
const versions = closedObjectSchema({ ...versionFields, approval: { oneOf: [approval, nullValue] } }, [...versionRequired, "approval"]);
const readResult = { oneOf: [
  closedObjectSchema({ ...state, versions: { type: "array", items: versions } }),
  contentAdoptionReadOutputSchema([
    closedObjectSchema({ kind: { const: "receipt" }, receipt: approvalReceipt, current }),
    closedObjectSchema({ kind: { const: "missing" }, current }),
  ]),
] };

const request = { request_id: token, expected_revision: token };
const approveInput = inputSchemaFor<HomePageApprovalInput>()(closedObjectSchema({ ...pageRef, ...request, approved_actions: actions }));
const selectInput = inputSchemaFor<HomePageSelectInput>()(closedObjectSchema({ ...basic.properties, ...request }));
const selectResult = closedObjectSchema({ selection: basic, revision: token, approval: nullValue });
const diff = { page_id: token, from_version: version, to_version: version };
const diffInput = inputSchemaFor<HomePageDiffInput>()(closedObjectSchema(diff));
const diffResult = closedObjectSchema({
  ...diff,
  files: { type: "array", maxItems: 2 * HOME_PAGE_LIMITS.files, items: closedObjectSchema({ path: text, kind: { enum: fileChanges } }) },
  entry: closedObjectSchema({ before: text, after: text }),
  actions: closedObjectSchema({ added: actions, removed: actions }),
});

const person = ["user"] as const;

/** Public declarations for the homepage owner. No page execution or approval authority is installed by these definitions. */
export const homePageActions: {
  read: ActionDefinition<HomePageReadInput, HomePageReadResult>;
  saveDraft: ActionDefinition<HomePageDraftSaveInput, HomePageDraftSaveResult>;
  preview: ActionDefinition<HomePageRef, HomePagePreviewResult>;
  adopt: ActionDefinition<HomePageApprovalInput, HomePageApprovalReceipt<"adopt">>;
  restore: ActionDefinition<HomePageApprovalInput, HomePageApprovalReceipt<"restore">>;
  select: ActionDefinition<HomePageSelectInput, HomePageSelectResult>;
  diff: ActionDefinition<HomePageDiffInput, HomePageDiffResult>;
  readFiles: ActionDefinition<HomePageRef, HomePageFilesResult>;
} = {
  read: homeAction("home.read", /* @version action.home.read */ 1, "读取项目首页", "读取首页选择、版本或指定请求的原回执", "query", ["user", "plugin", "agent"], readInput, readResult),
  saveDraft: homeAction("home.pages.drafts.save", /* @version action.home.pages.drafts.save */ 1, "保存首页草稿", "新建或追加页面草稿版本，保存不改变当前首页", "command", ["user", "agent"], saveInput, saveResult),
  preview: homeAction("home.pages.preview", /* @version action.home.pages.preview */ 1, "试用首页草稿", "为固定的草稿版本打开只读动作的试用页面", "command", person, pageRefSchema,
    closedObjectSchema({ page: pageRefSchema, page_session_id: token })),
  adopt: homeAction("home.pages.adopt", /* @version action.home.pages.adopt */ 1, "采用生成首页", "确认固定页面版本与批准的动作，再设为项目首页", "command", person, approveInput, approvalReply("adopt")),
  restore: homeAction("home.pages.restore", /* @version action.home.pages.restore */ 1, "恢复首页版本", "由本人再次批准后恢复指定页面版本", "command", person, approveInput, approvalReply("restore")),
  select: homeAction("home.select", /* @version action.home.select */ 1, "切回基础首页", "按所见的选择修订切回项目的基础首页", "command", person, selectInput, selectResult),
  diff: homeAction("home.pages.diff", /* @version action.home.pages.diff */ 1, "比较首页版本", "比较两个固定版本的文件、入口和动作集合", "query", person, diffInput, diffResult),
  readFiles: homeAction("home.pages.files.read", /* @version action.home.pages.files.read */ 1, "读取首页版本文件", "读取一个固定版本的文件清单和完整正文", "query", person, pageRefSchema,
    closedObjectSchema({ version: pageVersion, files: fileList(sourceFile) })),
};

function homeAction<Input, Output>(capability_id: string, actionVersion: number, title: string, description: string,
  operation: "query" | "command", audiences: readonly ActionAudience[], input_schema: ActionSchema, output_schema: ActionSchema,
): ActionDefinition<Input, Output> {
  return { capability_id, version: actionVersion, operation, action: {
    title, description, audiences, input_schema, output_schema, scope: "project", subject_kinds: [],
    kind: operation === "query" ? "query" : "operation", effect: operation === "query" ? "read" : "write",
    ...(audiences.includes("agent") && !audiences.includes("plugin") ? { plugin: false as const } : {}),
    permissions: [operation === "query" ? "home:read" : "home:write"],
  } };
}
