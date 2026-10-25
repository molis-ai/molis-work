import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { withMolisWorkProjectCatalog } from "@molis-ai/molis-work-app-desktop";
import { LocalActionGatewayClient, LocalProjectDatabase, MolisWorkLocalHost, openProjectVersionStores, projectActionAvailability } from "@molis-ai/molis-work-app-local-host";
import { createActionMcpPorts, handleMcpMessage } from "@molis-ai/molis-work-app-mcp";
import type { ActionView } from "@molis-ai/molis-work-contracts/platform/actions";
import { FORM_ANSWER_FORMAT } from "@molis-ai/molis-work-plugin-form";
import { openFormStore } from "./fixtures/plugin-home-stores.js";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { serveTestHost, type TestHostServer } from "./fixtures/test-home.js";

// One Home has one execution owner, the resident Host (Forms runs on its Plugin Runtime, W4-04): each external tool is an MCP port whose
// calls cross the gateway to that Host, as the standard MCP launcher's do. "Across processes" is the tools' processes and a restart of the Host.
test("Form standard MCP preserves submissions and publications across tool processes, a Host restart and project grants", { timeout: 120_000 }, async t => {
  const home = await mkdtemp(join(tmpdir(), "form-mcp-"));
  let host: MolisWorkLocalHost | undefined, web: TestHostServer | undefined;
  const start = async () => {
    host = new MolisWorkLocalHost({ homeDirectory: home, actionAvailability: projectActionAvailability(withMolisWorkProjectCatalog, home),
      completeText: async () => JSON.stringify({ status: "done", questions: [{ title: "MCP 题目", type: "text" }] }) });
    web = await serveTestHost(null, { home, host });
  };
  const stop = async () => { await web?.close(); await host?.close(); web = undefined; host = undefined; };
  // The Host closes before its Home goes.
  t.after(async () => { await stop(); await rm(home, { recursive: true, force: true }); });
  await start();
  const a = await web!.createProject("MCP Form a"), b = await web!.createProject("MCP Form b");

  // What each tool may do is what the person granted it: the writer every Form action, the reader the ones that only read.
  const formViews = async (clientId: string, projectId: string) => (await web!.inspect(clientId, projectId)).filter(view => view.capability_id.startsWith("form."));
  const readsOnly = (view: ActionView) => view.action.permissions.every(permission => permission === "form:read");
  await web!.grant("writer", a.project_id, await formViews("writer", a.project_id));
  await web!.grant("second-writer", a.project_id, await formViews("second-writer", a.project_id));
  await web!.grant("reader", a.project_id, (await formViews("reader", a.project_id)).filter(readsOnly));
  await web!.grant("other", b.project_id, await formViews("other", b.project_id));

  type Tool = ReturnType<typeof createActionMcpPorts>;
  const connect = (clientId: string, projectId: string): Tool => createActionMcpPorts({ serverInfo: { name: "external-form", version: "1" },
    service: new LocalActionGatewayClient({ url: web!.origin, homeDirectory: home, clientId, projectId, controlToken: web!.controlToken }),
    context: () => ({ actor_id: clientId, project_id: projectId, audience: "mcp", permissions: [] }) });
  // W4-6-07: a tool is named by its capability version, and `content.receive` is at version 2; the other tools keep `__v1`.
  const tool = (name: string) => `form.${name}__v${name === "content.receive" || name === "subject.read" ? 2 : 1}`;
  const answer = async (client: Tool, name: string, args: Record<string, unknown>) => {
    const reply = await handleMcpMessage({ id: 1, method: "tools/call", params: { name: tool(name), arguments: args } }, client);
    return reply!.result as { isError: boolean; content: Array<{ text: string }>; structuredContent?: unknown };
  };
  const call = async (client: Tool, name: string, args: Record<string, unknown> = {}): Promise<any> => {
    const result = await answer(client, name, args);
    assert.equal(result.isError, false, JSON.stringify(result)); return result.structuredContent;
  };
  // A form that is not collecting refuses an external tool with its own code and reason, not a generic failure.
  const refused = async (client: Tool, name: string, args: Record<string, unknown>, reason: RegExp) => {
    const result = await answer(client, name, args); assert.equal(result.isError, true);
    const error = JSON.parse(result.content[0]!.text) as { code: string; error: string }; assert.equal(error.code, "form.closed"); assert.match(error.error, reason);
  };

  let writer = connect("writer", a.project_id), reader = connect("reader", a.project_id);
  const other = () => connect("other", b.project_id);
  const tools = await handleMcpMessage({ id: 1, method: "tools/list", params: {} }, writer);
  assert.deepEqual((tools!.result as { tools: Array<{ name: string }> }).tools.map(item => item.name).filter(name => name.startsWith("form.")).sort(),
    ["list","get","create","update","publish","close","promote","artifacts.pin","delete","questions.add","questions.draft","submit","results","results.csv","answers.import","fillpage","search.entries","subject.read",
      "content.list","content.read","content.receive","content.create"].map(tool).sort());
  assert.equal((await call(reader,"list")).ai_available, false);
  let {form} = await call(writer,"create",{title:"MCP 问卷"}); const id = form.id;
  form = (await call(writer,"questions.add",{id,prompt:"原始题目",expected_version:form.version})).form;
  assert.equal((await call(reader,"get",{id})).form.questions[0].title,"原始题目");
  assert.deepEqual((await call(other(),"list")).forms,[]);
  for (const [client,name,args] of [[other(),"get",{id}],[reader,"submit",{id,answers:{}}],[writer,"create",{project_id:b.project_id}]] as const) {
    assert.equal((await answer(client,name,args)).isError,true);
  }
  // An external tool's answer is taken only while the form is collecting: a draft refuses it and saves nothing.
  await refused(writer,"submit",{id,expected_version:form.version,answers:{[form.questions[0].id]:"草稿阶段"},request_id:"draft-submission"},/还没有开始收集答卷/u);
  assert.equal((await call(reader,"results",{id})).analysis.submission_count,0);
  form = (await call(writer,"publish",{id,expected_version:form.version})).form;
  const input = {id,answers:{[form.questions[0].id]:"保留原答案"},expected_version:form.version,request_id:"stable-submission"};
  // Two tools send the same answer at once; the Form keeps one.
  const [firstSubmit, retriedSubmit] = await Promise.all([call(writer,"submit",input), call(connect("second-writer", a.project_id),"submit",input)]);
  const {submission} = firstSubmit;
  assert.deepEqual(retriedSubmit.submission,submission);
  assert.equal((await call(reader,"results",{id})).analysis.submission_count,1);
  form = (await call(writer,"update",{id,questions:[],expected_version:form.version})).form;
  assert.equal((await call(reader,"results",{id})).submissions[0].questions[0].title,"原始题目");
  form = (await call(writer,"questions.draft",{id,prompt:"拟一道题",expected_version:form.version})).form;
  assert.equal(form.questions[0].title,"MCP 题目");
  form = (await call(writer,"publish",{id,expected_version:form.version})).form;
  const share = form.share_id; assert.ok(share);
  const db = openHomeSqliteDatabase(home,"form");
  try {
    db.exec("CREATE TRIGGER fail_form_mcp BEFORE UPDATE OF artifact_version ON forms WHEN NEW.artifact_version > OLD.artifact_version BEGIN SELECT RAISE(ABORT, 'fixture association failed'); END");
    assert.equal((await answer(writer,"promote",{id,expected_version:form.version})).isError,true);
    assert.equal((await call(reader,"get",{id})).form.publication_pending.version,1);
    form = (await call(writer,"update",{id,title:"Later edit",expected_version:form.version})).form;
    db.exec("DROP TRIGGER fail_form_mcp");
  } finally {db.close();}

  // The Host restarts; the tools reconnect to the new one.
  await stop(); await start();
  const restarted = connect("writer", a.project_id); writer = restarted; reader = connect("reader", a.project_id);
  assert.deepEqual((await call(restarted,"submit",input)).submission,submission);
  assert.equal((await call(reader,"results",{id})).analysis.submission_count,1);
  const recovered = await call(restarted,"promote",{id,expected_version:form.version});
  assert.equal(recovered.recovered,true); assert.equal(recovered.artifact.version,1);
  assert.equal(recovered.form.title,"Later edit"); assert.equal(recovered.form.share_id,share);
  const project = new LocalProjectDatabase(a.database_path);
  try {
    const library = openProjectVersionStores(project);
    const artifact = library.artifacts.query.getArtifactVersion(a.project_id,recovered.artifact)!;
    const payload = artifact.payload as { title: string; questions: Array<{ title: string }>; answers?: unknown };
    assert.equal(payload.title,"MCP 问卷"); assert.equal(payload.questions[0]!.title,"MCP 题目");
    assert.equal(payload.answers,undefined);
    assert.equal(library.artifacts.query.getArtifactVersion(a.project_id,{...recovered.artifact,version:2}),null);
  } finally {project.close();}
  const store = openFormStore(home);
  try {assert.deepEqual(store.get(id,a.project_id),recovered.form);assert.deepEqual(store.listSubmissions(id,a.project_id),[submission]);} finally {store.close();}
  // Collection stopped: an external tool's answer is refused again, and the one already in stays.
  const stopped = (await call(restarted,"close",{id,expected_version:recovered.form.version})).form;
  await refused(restarted,"submit",{id,expected_version:stopped.version,answers:{[stopped.questions[0].id]:"停止后"},request_id:"stopped-submission"},/已停止收集答卷/u);
  assert.equal((await call(reader,"results",{id})).analysis.submission_count,1);
  // Answer files obey the same gate for an external tool: refused while the form is not collecting, taken once it is.
  let filed = (await call(restarted,"create",{title:"MCP 答卷文件"})).form; const fileForm = filed.id;
  filed = (await call(restarted,"questions.add",{id:fileForm,prompt:"导入题",expected_version:filed.version})).form;
  const file = (answerId:string,value:string) => ({name:`${answerId}.molis-answer.json`,content:JSON.stringify({format:FORM_ANSWER_FORMAT,form_id:fileForm,form_version:filed.version,answer_id:answerId,
    submitted_at:"2026-10-08T01:02:03.000Z",questions:filed.questions,answers:{[filed.questions[0].id]:value}})});
  // The refusal is the form's own (not a bad input): the same file shape is taken once the form is collecting.
  const refusedImport = (answerId:string,value:string,reason:RegExp) => refused(restarted,"answers.import",{id:fileForm,files:[file(answerId,value)]},reason);
  await refusedImport("mcp-draft-0001","草稿阶段",/还没有开始收集答卷/u);
  assert.equal((await call(reader,"results",{id:fileForm})).analysis.submission_count,0);
  filed = (await call(restarted,"publish",{id:fileForm,expected_version:filed.version})).form;
  assert.equal((await call(restarted,"answers.import",{id:fileForm,files:[file("mcp-open-0001","收集中")]})).imported,1);
  filed = (await call(restarted,"close",{id:fileForm,expected_version:filed.version})).form;
  await refusedImport("mcp-stopped-0001","停止后",/已停止收集答卷/u);
  assert.equal((await call(reader,"results",{id:fileForm})).analysis.submission_count,1);
  await call(restarted,"delete",{id:fileForm,expected_version:filed.version});
  await call(restarted,"delete",{id,expected_version:stopped.version}); assert.deepEqual((await call(reader,"list")).forms,[]);
});
