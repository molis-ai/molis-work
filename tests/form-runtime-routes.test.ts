import assert from "node:assert/strict";
import test from "node:test";
import type { FormRecord, FormSubmissionRecord } from "@molis-ai/molis-work-contracts/modules/form";
import { FORM_ANSWER_FORMAT } from "@molis-ai/molis-work-plugin-form";
import { openFormStore } from "./fixtures/plugin-home-stores.js";
import { openTestHome } from "./fixtures/test-home.js";

/**
 * Forms runs as a Plugin Runtime plugin in each project (W4-04, docs/system/RUNTIME-MIGRATION.md 5.1): its page reaches it under the
 * project's `/api/plugins/io.molis.work.form/forms`, and each route only maps the request to the action of the same name.
 */
const answerFile = (form: FormRecord, answerId: string, value: string) => ({ name: `${answerId}.molis-answer.json`,
  content: JSON.stringify({ format: FORM_ANSWER_FORMAT, form_id: form.id, form_version: form.version, answer_id: answerId,
    submitted_at: "2026-10-15T01:02:03.000Z", questions: form.questions, answers: { q: value } }) });

test("W4-04-03 the page reaches Forms through the project's Runtime routes: edit, collect, results, files and two pins", { timeout: 90_000 }, async t => {
  const home = await openTestHome(t);
  const project = await home.createProject("Forms on the Runtime");
  const forms = `/projects/${project.project_id}/api/plugins/io.molis.work.form/forms`;
  const { form: created } = await home.web.post<{ form: FormRecord }>(forms, { title: "周报", project_id: project.project_id });
  assert.equal(created.project_id, project.project_id);
  let { form } = await home.web.post<{ form: FormRecord }>(`${forms}/${created.id}`, { expected_version: created.version,
    questions: [{ id: "q", type: "singleChoice", title: "用得最多的工具", required: true, options: [{ id: "a", label: "编辑器" }, { id: "b", label: "终端" }] }] });
  form = (await home.web.post<{ form: FormRecord }>(`${forms}/${form.id}/generate-questions`, { prompt: "还想要什么", expected_version: form.version })).form;
  assert.deepEqual(form.questions.map(question => question.title), ["用得最多的工具", "还想要什么"]);
  form = (await home.web.post<{ form: FormRecord }>(`${forms}/${form.id}/publish`, { expected_version: form.version })).form;
  await assert.rejects(home.web.post(`${forms}/${form.id}/submit`, { answers: {} }), { message: /请回答/u });
  const { submission } = await home.web.post<{ submission: FormSubmissionRecord }>(`${forms}/${form.id}/submit`, { answers: { [form.questions[0]!.id]: "编辑器" } });
  assert.equal(submission.source, "preview", "the page is the person; without a claim it is the trial fill");
  const results = await home.web.get<{ analysis: { submission_count: number } }>(`${forms}/${form.id}/results`);
  assert.equal(results.analysis.submission_count, 1);
  const csv = await home.web.get<{ mime_type: string; count: number }>(`${forms}/${form.id}/results.csv`);
  assert.deepEqual([csv.mime_type, csv.count], ["text/csv", 1]);
  const page = await home.web.get<{ mime_type: string; content: string }>(`${forms}/${form.id}/fill-page`);
  assert.equal(page.mime_type, "text/html");
  assert.match(page.content, /用得最多的工具/u);

  const first = await home.web.post<{ form: FormRecord; artifact: { artifact_id: string; version: number } }>(`${forms}/${form.id}/promote`, {});
  const second = await home.web.post<{ form: FormRecord; artifact: { artifact_id: string; version: number } }>(`${forms}/${form.id}/promote`, {});
  assert.deepEqual([first.artifact, second.artifact], [{ artifact_id: "form-" + form.id, version: 1 }, { artifact_id: "form-" + form.id, version: 2 }]);
  assert.equal(second.form.artifact_version, 2);
  const listed = await home.web.get<{ forms: FormRecord[] }>(forms);
  assert.deepEqual(listed.forms.map(item => item.title), ["周报"]);

  // The data stays where it was: the Home's form library, at its one baseline.
  const store = openFormStore(home.home);
  try { assert.equal(store.analyze(form.id, project.project_id).submission_count, 1); } finally { store.close(); }
  // The Host's hand-written Form routes are gone.
  await assert.rejects(home.web.get(`/projects/${project.project_id}/api/form`), { status: 404 });
});

test("W4-04-04 a page asking one project's Forms about another project is refused, and an answer file still comes in after collection stops", { timeout: 90_000 }, async t => {
  const home = await openTestHome(t);
  const project = await home.createProject("Forms here"), other = await home.createProject("Forms elsewhere");
  const forms = `/projects/${project.project_id}/api/plugins/io.molis.work.form/forms`;
  await home.web.post(`/projects/${other.project_id}/api/plugins/io.molis.work.form/forms`, { title: "别处的问卷" });
  await assert.rejects(home.web.get(`${forms}?project_id=${encodeURIComponent(other.project_id)}`), { code: "actions.scope_mismatch" });
  await assert.rejects(home.web.post(forms, { title: "写到别处", project_id: other.project_id }), { code: "actions.scope_mismatch" });
  assert.deepEqual((await home.web.get<{ forms: FormRecord[] }>(forms)).forms, [], "nothing was written, and the other project's form is not listed here");

  let { form } = await home.web.post<{ form: FormRecord }>(forms, { title: "回访" });
  form = (await home.web.post<{ form: FormRecord }>(`${forms}/${form.id}`, { expected_version: form.version, questions: [{ id: "q", type: "text", title: "哪里可以更好？" }] })).form;
  form = (await home.web.post<{ form: FormRecord }>(`${forms}/${form.id}/publish`, { expected_version: form.version })).form;
  form = (await home.web.post<{ form: FormRecord }>(`${forms}/${form.id}/close`, { expected_version: form.version })).form;
  // The page promises that answer files people send back still come in after collection stops: through its route the caller is the person.
  assert.deepEqual(await home.web.post(`${forms}/${form.id}/answers`, { files: [answerFile(form, "page-stopped-0001", "停止后经页面导入")] }),
    { imported: 1, skipped: 0, rejected: [] });
});

test("W4-04-05 「AI 生成题目」 asks first through the Runtime route: the Host adds the shared question card, and the answer goes on to a draft", { timeout: 90_000 }, async t => {
  const prompts: string[] = [];
  const home = await openTestHome(t, { host: { completeText: async prompt => {
    prompts.push(prompt);
    return JSON.stringify(/内部同事/u.test(prompt) ? { status: "done", questions: [{ title: "你最常用的工具是什么？", type: "text" }] }
      : { status: "needs_input", why: "先确认问卷给谁填", questions: [{ id: "audience", prompt: "给谁填？", options: [{ label: "内部同事", recommended: true }, { label: "外部客户" }] }] });
  } } });
  const project = await home.createProject("Forms drafting");
  const forms = `/projects/${project.project_id}/api/plugins/io.molis.work.form/forms`;
  const { form } = await home.web.post<{ form: FormRecord }>(forms, { title: "工具调研" });
  const asked = await home.web.post<{ status: string; interaction: { interaction_id: string; html: string } }>(`${forms}/${form.id}/draft-questions`,
    { prompt: "问问大家的常用工具", expected_version: form.version });
  assert.equal(asked.status, "needs_input");
  assert.match(asked.interaction.html, /data-ix-question/u, "the Runtime exit draws the same question card as the Assistant's");
  assert.match(asked.interaction.html, /给谁填？/u);
  const drafted = await home.web.post<{ status: string; form: FormRecord }>(`${forms}/${form.id}/draft-questions`,
    { prompt: "问问大家的常用工具", expected_version: form.version, interaction: { interaction_id: asked.interaction.interaction_id, values: { q0: ["0"] } } });
  assert.equal(drafted.status, "done");
  assert.deepEqual(drafted.form.questions.map(question => question.title), ["你最常用的工具是什么？"]);
  assert.equal(prompts.length, 2);
});
