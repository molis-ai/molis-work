import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";
import { openServerDatabase, transaction, Identity, ServerEvents, ContinuityService, startServer, createImDomain, memberClientId, CONTINUITY_ACTIONS, type ProjectScope } from "@molis-ai/molis-work-server";
import { renderImPage, IM_STYLES, IM_CLIENT_SCRIPT } from "@molis-ai/molis-work-im-ui";
import { configureMemberActions } from "./admin-grants.js";
import { gatewayFactory } from "./gateway.js";
import { restoreWorkAssets, readRestoredAssets } from "./assets.js";

const {values,positionals}=parseArgs({allowPositionals:true,options:{state:{type:"string"},config:{type:"string"},"host-home":{type:"string"},"host-url":{type:"string"},port:{type:"string"},hostname:{type:"string"},origin:{type:"string"},cert:{type:"string"},key:{type:"string"},bundle:{type:"string"},destination:{type:"string"},project:{type:"string"},name:{type:"string"},member:{type:"string"},"control-token-file":{type:"string"},revoke:{type:"boolean"}}});
const command=positionals[0] ?? "help";
if(command === "authorize") {
  if(!values.state || !values.member || !values.project || !values["control-token-file"])throw Error("authorize requires --state, --member, --project and --control-token-file");
  const storage=openServerDatabase(resolve(values.state));
  try {
    const access=storage.db.prepare("SELECT role FROM mw_access WHERE project_id=? AND member_id=?").get(values.project,values.member) as {role:"owner"|"editor"|"viewer"}|undefined;
    if(!values.revoke && !access)throw Error("Member has no access to this project");
    console.log(JSON.stringify(await configureMemberActions({hostUrl:values["host-url"] ?? "http://127.0.0.1:4173",controlTokenFile:resolve(values["control-token-file"]),memberId:values.member,projectId:values.project,role:values.revoke?"revoked":access!.role}),null,2));
  } finally {storage.close();}
} else if(command === "members") {
  if(!values.state)throw Error("members requires --state");
  const storage=openServerDatabase(resolve(values.state));
  try{console.log(JSON.stringify(storage.db.prepare("SELECT m.id,m.display_name,a.project_id,a.role FROM mw_members m LEFT JOIN mw_access a ON a.member_id=m.id").all(),null,2));}finally{storage.close();}
} else if(command === "restore") {
  if(!values.bundle || !values.destination)throw Error("restore requires --bundle and --destination");
  console.log(JSON.stringify(await restoreWorkAssets(JSON.parse(await readFile(resolve(values.bundle),"utf8")),resolve(values.destination)),null,2));
} else if(command === "read-assets") {
  if(!values.destination || !values.project)throw Error("read-assets requires --destination and --project");
  console.log(JSON.stringify(await readRestoredAssets(resolve(values.destination),values.project),null,2));
} else if(command === "serve") {
  if(!values.state || !values.config || !values["host-home"])throw Error("serve requires --state, --config and --host-home");
  const state=resolve(values.state);await mkdir(state,{recursive:true,mode:0o700});
  const storage=openServerDatabase(state),identity=new Identity(storage.db),events=new ServerEvents(storage.db);
  const continuity=new ContinuityService(storage.db,identity,events,gatewayFactory({url:values["host-url"] ?? "http://127.0.0.1:4173",homeDirectory:resolve(values["host-home"])}));
  const ownerFile=join(state,"owner.json");let owner:{id:string;display_name:string};
  try{owner=JSON.parse(await readFile(ownerFile,"utf8"));if(!storage.db.prepare("SELECT 1 FROM mw_members WHERE id=?").get(owner.id))throw Error("owner record does not match server database");}
  catch(error){if(!(error && typeof error === "object" && "code" in error && error.code === "ENOENT"))throw error;owner=identity.createMember(values.name ?? "我");await writeFile(ownerFile,JSON.stringify(owner),{mode:0o600,flag:"wx"});}
  const config:unknown=JSON.parse(await readFile(resolve(values.config),"utf8"));
  if(!config || typeof config!=="object" || !("projects" in config) || !Array.isArray(config.projects))throw Error("config.projects must list explicitly selected project/goal/artifact references");
  const configuredProjects=config.projects;
  transaction(storage.db,()=>{
    const allowed=new Set<string>();
    for(const project of configuredProjects){continuity.registerProject(project as ProjectScope,owner.id);allowed.add((project as ProjectScope).id);}
    // Configuration is the current transport allowlist, not an append-only registry.
    // Keep receipts/history, but removed projects cannot be reached through old devices or invitations.
    const previous=storage.db.prepare("SELECT id FROM mw_projects").all() as {id:string}[];
    for(const project of previous)if(!allowed.has(project.id)){
      storage.db.prepare("DELETE FROM mw_access WHERE project_id=?").run(project.id);
      storage.db.prepare("UPDATE mw_codes SET consumed=1 WHERE project_id=? AND kind='invite'").run(project.id);
    }
  });
  const bootstrap=identity.code("bootstrap",owner.id);await writeFile(join(state,"connect.json"),JSON.stringify(bootstrap,null,2),{mode:0o600});
  const tls=values.cert && values.key ? {cert:await readFile(resolve(values.cert),"utf8"),key:await readFile(resolve(values.key),"utf8")} : undefined;
  const running=await startServer({identity,continuity,events,im:createImDomain({db:storage.db,identity,events}),port:Number(values.port ?? 4187),hostname:values.hostname,
    publicOrigin:values.origin,tls,imAssets:{html:renderImPage({embedded:false}),css:IM_STYLES,script:IM_CLIENT_SCRIPT}});
  console.log(`Molis Work Server: ${running.origin}/continuity\nOwner pairing code: ${join(state,"connect.json")} (10 minutes)\nHost action client: ${memberClientId(owner.id)}`);
  console.log(`Required action grants: ${CONTINUITY_ACTIONS.map(a=>a.capability_id+"@"+a.version).join(", ")}`);
  const close=async()=>{await running.close();storage.close();process.exit(0);};process.once("SIGINT",close);process.once("SIGTERM",close);
} else console.log("serve --state DIR --config FILE --host-home DIR [--host-url http://127.0.0.1:4173] [--port 4187]\nFor LAN add --hostname ADDRESS --origin https://ADDRESS:PORT --cert FILE --key FILE\nauthorize --state DIR --member ID --project ID --control-token-file FILE [--host-url URL] [--revoke]\nmembers --state DIR\nrestore --bundle FILE --destination DIR\nread-assets --destination DIR --project SOURCE_PROJECT_ID");
