import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { openFormStore } from "@molis-ai/molis-work-plugin-form";
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
  try {
    const writer = await connect("a"), reader = await connect("a", "read"), other = await connect("b");
    assert.deepEqual((await writer.listTools()).tools.map(t => t.name).filter(n => n.startsWith("form.")).sort(),
      ["list","get","create","update","publish","promote","delete","questions.add","questions.ai","submit","results"].map(n=>`form.${n}__v1`).sort());
    assert.equal((await call(reader,"list")).ai_available, false);
    let {form} = await call(writer,"create",{title:"MCP 问卷"}); const id = form.id;
    form = (await call(writer,"questions.add",{id,prompt:"原始题目",expected_version:form.version})).form;
    assert.equal((await call(reader,"get",{id})).form.questions[0].title,"原始题目");
    assert.deepEqual((await call(other,"list")).forms,[]);
    for (const [client,name,args] of [[other,"get",{id}],[reader,"submit",{id,answers:{}}],[writer,"create",{project_id:"b"}]] as const) {
      assert.equal((await client.callTool({name:`form.${name}__v1`,arguments:args})).isError,true);
    }
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
    await call(restarted,"delete",{id,expected_version:recovered.form.version}); assert.deepEqual((await call(reader,"list")).forms,[]);
  } finally {await Promise.all(clients.map(c=>c.close()));await rm(home,{recursive:true,force:true});}
});
