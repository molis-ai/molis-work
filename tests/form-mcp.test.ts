import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { FORM_ANSWER_FORMAT, openFormStore } from "@molis-ai/molis-work-plugin-form";
import { openHomeSqliteDatabase } from "@molis-ai/molis-work-storage";
import { GoalProjectApplication, LocalProjectDatabase } from "@molis-ai/molis-work-app-local-host";

test("Form standard MCP preserves submissions and publications across processes and project grants", {timeout:45_000}, async () => {
  const home = await mkdtemp(join(tmpdir(), "form-mcp-")), clients: Client[] = [];
  const connect = async (project: string, access = "write") => {
    const client = new Client({ name: "external-form", version: "1" }); clients.push(client);
    const transport = new StdioClientTransport({ command: process.execPath, args: ["--import", "tsx", fileURLToPath(new URL("./fixtures/form-mcp-server.ts", import.meta.url)), home, project, access], stderr: "pipe" });
    let errors = ""; transport.stderr?.on("data", data => { errors += String(data); });
    try { await client.connect(transport); } catch (error) { throw new Error(`${String(error)}\n${errors}`); }
    return client;
  };
  const call = async (client: Client, name: string, args: Record<string, unknown> = {}) => {
    const result = await client.callTool({name:`form.${name}__v1`, arguments:args});
    assert.equal(result.isError, false, JSON.stringify(result)); return result.structuredContent as any;
  };
  // A form that is not collecting refuses an external tool with its own code and reason, not a generic failure.
  const refused = async (client: Client, name: string, args: Record<string, unknown>, reason: RegExp) => {
    const result = await client.callTool({name:`form.${name}__v1`, arguments:args}); assert.equal(result.isError, true);
    const error = JSON.parse((result.content as {text:string}[])[0]!.text); assert.equal(error.code, "form.closed"); assert.match(error.message, reason);
  };
  try {
    const writer = await connect("a"), reader = await connect("a", "read"), other = await connect("b");
    assert.deepEqual((await writer.listTools()).tools.map(t => t.name).filter(n => n.startsWith("form.")).sort(),
      ["list","get","create","update","publish","close","promote","artifacts.pin","delete","questions.add","questions.ai","submit","results","results.csv","answers.import","fillpage","search.entries","subject.read",
        "content.list","content.read","content.receive","content.create"].map(n=>`form.${n}__v1`).sort());
    assert.equal((await call(reader,"list")).ai_available, false);
    let {form} = await call(writer,"create",{title:"MCP 问卷"}); const id = form.id;
    form = (await call(writer,"questions.add",{id,prompt:"原始题目",expected_version:form.version})).form;
    assert.equal((await call(reader,"get",{id})).form.questions[0].title,"原始题目");
    assert.deepEqual((await call(other,"list")).forms,[]);
    for (const [client,name,args] of [[other,"get",{id}],[reader,"submit",{id,answers:{}}],[writer,"create",{project_id:"b"}]] as const) {
      assert.equal((await client.callTool({name:`form.${name}__v1`,arguments:args})).isError,true);
    }
    // An external tool's answer is taken only while the form is collecting: a draft refuses it and saves nothing.
    await refused(writer,"submit",{id,answers:{[form.questions[0].id]:"草稿阶段"},request_id:"draft-submission"},/还没有开始收集答卷/u);
    assert.equal((await call(reader,"results",{id})).analysis.submission_count,0);
    form = (await call(writer,"publish",{id,expected_version:form.version})).form;
    const input = {id,answers:{[form.questions[0].id]:"保留原答案"},expected_version:form.version,request_id:"stable-submission"};
    const secondWriter = await connect("a");
    const [firstSubmit, retriedSubmit] = await Promise.all([call(writer,"submit",input), call(secondWriter,"submit",input)]);
    const {submission} = firstSubmit;
    assert.deepEqual(retriedSubmit.submission,submission);
    assert.equal((await call(reader,"results",{id})).analysis.submission_count,1);
    await secondWriter.close();
    form = (await call(writer,"update",{id,questions:[],expected_version:form.version})).form;
    assert.equal((await call(reader,"results",{id})).submissions[0].questions[0].title,"原始题目");
    form = (await call(writer,"questions.ai",{id,prompt:"拟一道题",expected_version:form.version})).form;
    assert.equal(form.questions[0].title,"MCP 题目");
    form = (await call(writer,"publish",{id,expected_version:form.version})).form;
    const share = form.share_id; assert.ok(share);
    const db = openHomeSqliteDatabase(home,"form");
    try {
      db.exec("CREATE TRIGGER fail_form_mcp BEFORE UPDATE OF artifact_version ON forms WHEN NEW.artifact_version > OLD.artifact_version BEGIN SELECT RAISE(ABORT, 'fixture association failed'); END");
      assert.equal((await writer.callTool({name:"form.promote__v1",arguments:{id,expected_version:form.version}})).isError,true);
      assert.equal((await call(reader,"get",{id})).form.publication_pending.version,1);
      form = (await call(writer,"update",{id,title:"Later edit"})).form;
      db.exec("DROP TRIGGER fail_form_mcp");
    } finally {db.close();}
    await writer.close(); const restarted = await connect("a");
    assert.deepEqual((await call(restarted,"submit",input)).submission,submission);
    assert.equal((await call(reader,"results",{id})).analysis.submission_count,1);
    const recovered = await call(restarted,"promote",{id,expected_version:form.version});
    assert.equal(recovered.recovered,true); assert.equal(recovered.artifact.version,1);
    assert.equal(recovered.form.title,"Later edit"); assert.equal(recovered.form.share_id,share);
    const project = new LocalProjectDatabase(join(home,"a.sqlite"));
    try {
      const owner = new GoalProjectApplication(project);
      const artifact = owner.artifacts.query.getArtifactVersion("a",recovered.artifact)!;
      assert.equal((artifact.payload as any).title,"MCP 问卷"); assert.equal((artifact.payload as any).questions[0].title,"MCP 题目");
      assert.equal((artifact.payload as any).answers,undefined);
      assert.equal(owner.artifacts.query.getArtifactVersion("a",{...recovered.artifact,version:2}),null);
    } finally {project.close();}
    const store = openFormStore(home);
    try {assert.deepEqual(store.get(id,"a"),recovered.form);assert.deepEqual(store.listSubmissions(id,"a"),[submission]);} finally {store.close();}
    // Collection stopped: an external tool's answer is refused again, and the one already in stays.
    const stopped = (await call(restarted,"close",{id,expected_version:recovered.form.version})).form;
    await refused(restarted,"submit",{id,answers:{[stopped.questions[0].id]:"停止后"},request_id:"stopped-submission"},/已停止收集答卷/u);
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
  } finally {await Promise.all(clients.map(c=>c.close()));await rm(home,{recursive:true,force:true});}
});
