import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, mkdir, writeFile, readFile, rm, chmod, stat, symlink, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createGitWorktreePort, readWriterIntegration, prepareWriterIntegration } from "@molis-ai/molis-work-app-local-host";
const run = promisify(execFile);

async function fixture() {
  const home = await realpath(await mkdtemp(path.join(tmpdir(), "writer-integration-"))), root = path.join(home, "repo"); await mkdir(root);
  const git = (args: string[], cwd = root) => run("git", args, { cwd });
  await git(["init", "-q"]); await git(["config", "user.name", "Fixture"]); await git(["config", "user.email", "fixture@example.invalid"]);
  for (const [name, text] of Object.entries({ "modify.txt": "original\n", "remove.txt": "remove\n", "no-lf.txt": "old without LF", "mode.sh": "echo ok\n" })) await writeFile(path.join(root, name), text);
  await git(["add", "."]); await git(["commit", "-qm", "base"]);
  const tree = await createGitWorktreePort(root).create("child"), child = path.resolve(root, tree.directory);
  let grants = [{ workspace_id: "parent", canonical_path: root, realpath_verified: true, display_name: "Parent" }, { workspace_id: "child", canonical_path: child, realpath_verified: true, display_name: "Child" }];
  const selection = { workspace_id: "parent", writer_workspace_id: "child" }, current = async () => grants;
  const read = () => readWriterIntegration(selection, current);
  const prepare = async (names: string[]) => {
    const view = await read();
    return prepareWriterIntegration({ ...selection, files: names.map(name => { const f = view.files.find(f => f.path.join("/") === name)!; return { path: f.path, revision: f.revision! }; }) }, current);
  };
  return { home, root, child, tree, git, selection, current, read, prepare, revoke: () => { grants = grants.slice(0, 1); }, close: () => rm(home, { recursive: true, force: true }) };
}

test("selected child changes integrate exact text, modes and deletions while preserving index, unrelated edits and child work", async () => {
  const f = await fixture();
  try {
    await writeFile(path.join(f.child,"modify.txt"),"new\nsecond\n"); await rm(path.join(f.child,"remove.txt"));
    await writeFile(path.join(f.child,"no-lf.txt"),"new without LF"); await chmod(path.join(f.child,"mode.sh"),0o755);
    await writeFile(path.join(f.child,'中文 空格 "引号".txt'),"new file\n"); await writeFile(path.join(f.child,"empty.txt"),"");
    await writeFile(path.join(f.child,"unselected.txt"),"leave here\n");
    await writeFile(path.join(f.root,"local.txt"),"unrelated staged\n"); await f.git(["add","local.txt"]);
    const index = await readFile(path.join(f.root,".git/index"));
    const names=["modify.txt","remove.txt","no-lf.txt","mode.sh",'中文 空格 "引号".txt',"empty.txt"];
    const prepared=await f.prepare(names);
    assert.equal(await readFile(path.join(f.root,"modify.txt"),"utf8"),"original\n","preparing must not write");
    await prepared.execute();
    for(const name of names.filter(n=>n!=="remove.txt")) assert.deepEqual(await readFile(path.join(f.root,name)),await readFile(path.join(f.child,name)));
    assert.equal((await stat(path.join(f.root,"mode.sh"))).mode & 0o111,0o111);
    await assert.rejects(readFile(path.join(f.root,"remove.txt")),{code:"ENOENT"});
    await assert.rejects(readFile(path.join(f.root,"unselected.txt")),{code:"ENOENT"});
    assert.equal(await readFile(path.join(f.child,"unselected.txt"),"utf8"),"leave here\n");
    assert.deepEqual(await readFile(path.join(f.root,".git/index")),index);
    await assert.rejects(prepared.execute(),/相同内容|改变|冲突/);
    assert.equal((await createGitWorktreePort(f.root).list()).length,1);
  } finally { await f.close(); }
});

for(const change of ["source","target","grant","branch"] as const) test(`a ${change} change after preparation invalidates the selected integration`, async()=>{
  const f=await fixture();try{
    await writeFile(path.join(f.child,"modify.txt"),"proposed\n");const prepared=await f.prepare(["modify.txt"]);
    if(change==="source")await writeFile(path.join(f.child,"modify.txt"),"different\n");
    if(change==="target")await writeFile(path.join(f.root,"modify.txt"),"user edit\n");
    if(change==="grant")f.revoke();
    if(change==="branch")await f.git(["checkout","-b","other"]);
    await assert.rejects(prepared.execute());
    assert.equal(await readFile(path.join(f.root,"modify.txt"),"utf8"),change==="target"?"user edit\n":"original\n");
  }finally{await f.close();}
});

test("conflicted, staged, binary and symlink entries remain visible but cannot be selected",async()=>{
 const f=await fixture();try{
  await writeFile(path.join(f.child,"modify.txt"),"child\n");await writeFile(path.join(f.root,"modify.txt"),"staged\n");await f.git(["add","modify.txt"]);await writeFile(path.join(f.root,"modify.txt"),"original\n");
  await writeFile(path.join(f.child,"binary.bin"),Buffer.from([0,1,2]));await symlink("modify.txt",path.join(f.child,"link.txt"));
  const view=await f.read();assert.equal(view.files.length,3);assert.ok(view.files.every(file=>!file.selectable&&file.reason));
  assert.match(view.files.find(file=>file.path[0]==="modify.txt")!.reason!,/暂存区/);
  await assert.rejects(f.prepare(["modify.txt"]),/冲突/);
  await assert.rejects(prepareWriterIntegration({...f.selection,files:[{path:["..","outside"],revision:"fake"}]},f.current));
 }finally{await f.close();}
});

test("content conversion is refused before filters can run, and other worktree provenance cannot be forged",async()=>{
 const f=await fixture();try{
  const marker=path.join(f.home,"filter-called"), filter=path.join(f.home,"filter.sh");
  await writeFile(filter,`#!/bin/sh\nprintf called > '${marker}'\ncat\n`);await chmod(filter,0o755);
  await f.git(["config","filter.probe.clean",filter]);
  await writeFile(path.join(f.root,".gitattributes"),"modify.txt filter=probe\n");
  await writeFile(path.join(f.child,"modify.txt"),"child\n");
  const view=await f.read();assert.equal(view.files[0]!.selectable,false);assert.match(view.files[0]!.reason!,/转换/);
  await assert.rejects(readFile(marker),{code:"ENOENT"});
  await assert.rejects(readWriterIntegration({workspace_id:"child",writer_workspace_id:"parent"},f.current),/不属于/);
 }finally{await f.close();}
});
