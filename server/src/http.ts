import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createSecureServer } from "node:https";
import { readFile } from "node:fs/promises";
import { Identity, type Session } from "./identity.js";
import { ImError, textInput } from "./errors.js";
import { ContinuityService, progressInput } from "./continuity/service.js";
import { ServerEvents } from "./events.js";

export interface ImDomain {
  handleImRequest(input: {request:IncomingMessage;response:ServerResponse;url:URL;session:Session}): Promise<boolean>;
  assertRoomMember(roomId: string, memberId: string): void;
}
export interface ServerOptions {
  identity: Identity; continuity: ContinuityService; events: ServerEvents;
  hostname?: string; port?: number; publicOrigin?: string; tls?: {key:string;cert:string};
  im?: ImDomain; imAssets?: {html:string;css:string;script:string};
}
export function json(response: ServerResponse, body: unknown, status = 200): void {
  response.writeHead(status,{"content-type":"application/json; charset=utf-8"}); response.end(JSON.stringify(body));
}
export async function body(request: IncomingMessage): Promise<Record<string,unknown>> {
  if (!request.headers["content-type"]?.startsWith("application/json")) throw new ImError("server.content_type","请使用 JSON 请求",415);
  const buffers: Buffer[] = []; let size = 0;
  for await (const chunk of request) {size += chunk.length;if (size > 65536) throw new ImError("server.too_large","请求内容过长",413);buffers.push(chunk);}
  try {const value:unknown=JSON.parse(Buffer.concat(buffers).toString());if (!value || typeof value!=="object" || Array.isArray(value)) throw Error();return value as Record<string,unknown>;}
  catch {throw new ImError("server.invalid_json","请求内容不是有效 JSON");}
}

export async function startServer(options: ServerOptions) {
  const {events} = options;
  const hostname = options.hostname ?? "127.0.0.1", port = options.port ?? 4187;
  if (!["127.0.0.1","::1"].includes(hostname) && (!options.tls || !options.publicOrigin)) throw new ImError("server.https_required","局域网入口必须显式配置 HTTPS 证书和 publicOrigin");
  if (options.publicOrigin && new URL(options.publicOrigin).origin !== options.publicOrigin) throw new ImError("server.invalid_origin","publicOrigin 必须是完整 origin，不带路径");
  if (options.publicOrigin && new URL(options.publicOrigin).protocol !== (options.tls ? "https:" : "http:")) throw new ImError("server.invalid_origin","publicOrigin 的协议必须与实际服务一致");
  let origin = options.publicOrigin ?? "";
  const listener = createServerRequestHandler(options,()=>origin);
  const server = options.tls ? createSecureServer(options.tls,listener) : createServer(listener);
  await new Promise<void>((resolve,reject) => {server.once("error",reject);server.listen(port,hostname,()=>{server.removeListener("error",reject);resolve();});});
  const address = server.address();
  if (!origin && address && typeof address === "object") origin = `${options.tls ? "https" : "http"}://${hostname === "::1" ? "[::1]" : hostname}:${address.port}`;
  return {server,origin,close:async()=>{events.close();server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}};
}
/** Same protected routes for standalone and same-origin desktop embedding. */
export function createServerRequestHandler(options: ServerOptions, getOrigin: () => string) {
  const {identity,continuity,events} = options;
  return async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader("cache-control","no-store"); response.setHeader("x-content-type-options","nosniff");
    response.setHeader("referrer-policy","no-referrer"); response.setHeader("content-security-policy","default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'self'; form-action 'self'");
    try {
      const origin = getOrigin();
      const url = new URL(request.url ?? "/",origin);
      if (request.headers.host !== new URL(origin).host || url.origin !== origin) throw new ImError("server.host_denied","服务地址不匹配",403);
      if (!["GET","POST"].includes(request.method ?? "")) throw new ImError("server.method_denied","不支持此请求方式",405);
      if (request.method === "POST" && request.headers.origin !== origin) throw new ImError("server.origin_denied","请求必须来自当前工作台",403);
      if (request.headers["sec-fetch-site"] === "cross-site") throw new ImError("server.origin_denied","不接受跨站请求",403);
      const path = url.pathname;
      if (request.method === "GET") {
        const files:Record<string,[string,string]> = {"/continuity":["continuity.html","text/html"],"/continuity/":["continuity.html","text/html"],"/continuity/style.css":["style.css","text/css"],"/continuity/client.js":["client.js","text/javascript"]};
        if (files[path]) {const [file,mime]=files[path]!;response.setHeader("content-type",mime+"; charset=utf-8");response.end(await readFile(new URL("../public/"+file,import.meta.url)));return;}
        if (path === "/") {response.writeHead(302,{location:"/continuity"});response.end();return;}
        const imFiles:Record<string,[string|undefined,string]>={"/im":[options.imAssets?.html,"text/html"],"/im/styles.css":[options.imAssets?.css,"text/css"],"/im/client.js":[options.imAssets?.script,"text/javascript"]};
        if (imFiles[path]?.[0] !== undefined) {response.setHeader("content-type",imFiles[path]![1]+"; charset=utf-8");response.end(imFiles[path]![0]);return;}
      }
      if (path === "/continuity/api/connect" && request.method === "POST") {
        const value = await body(request);
        const session = identity.connect({code:value.code,display_name:value.display_name,device_label:value.device_label},request,response,!!options.tls);
        json(response,{member:identity.member(session)});events.notify();return;
      }
      if (path === "/continuity/api/session" && request.method === "GET") {
        const session = identity.session(request);
        json(response,session?.member_id ? {member:identity.member(session),projects:continuity.projects(session),devices:identity.devices(session)} : {member:null,projects:[],devices:[]});return;
      }
      if (path.startsWith("/im/api/") && options.im) {
        const session = path === "/im/api/session" ? identity.ensure(request,response,!!options.tls) : identity.require(request);
        const stream = path.match(/^\/im\/api\/rooms\/([^/]+)\/events$/);
        if (stream && request.method === "GET") {
          const roomId = decodeURIComponent(stream[1]!);
          events.open(response,"room",roomId,eventCursor(request,url),() => {identity.requireMember(session);options.im!.assertRoomMember(roomId,session.member_id!);});return;
        }
        if (await options.im.handleImRequest({request,response,url,session})) return;
      }
      if (!path.startsWith("/continuity/api/")) throw new ImError("server.not_found","找不到此入口",404);
      const session = identity.require(request);
      if (path === "/continuity/api/pair" && request.method === "POST") {await body(request);json(response,identity.code("pair",session.member_id!,{session}));return;}
      if (path === "/continuity/api/logout" && request.method === "POST") {
        await body(request);identity.revokeDevice(session,session.id);continuity.deviceRevoked(session.id);json(response,{ok:true});return;
      }
      if (path === "/continuity/api/devices/revoke" && request.method === "POST") {
        const input = await body(request), id = textInput(input.device_id,"设备",128);
        if (!identity.revokeDevice(session,id)) throw new ImError("identity.device_denied","无法断开不属于你的设备",403);
        continuity.deviceRevoked(id);json(response,{ok:true});return;
      }
      const match = path.match(/^\/continuity\/api\/projects\/([^/]+)(?:\/(progress|invite|revoke|assets|events))?$/);
      if (!match) throw new ImError("server.not_found","找不到此入口",404);
      const projectId = decodeURIComponent(match[1]!), operation = match[2];
      if (!operation && request.method === "GET") {json(response,await continuity.read(session,projectId));return;}
      if (operation === "assets" && request.method === "GET") {json(response,await continuity.assets(session,projectId));return;}
      if (operation === "events" && request.method === "GET") {events.open(response,"project",projectId,eventCursor(request,url),()=>identity.access(session,projectId));return;}
      if (request.method !== "POST") throw new ImError("server.method_denied","不支持此请求方式",405);
      const value = await body(request);
      if (operation === "progress") {json(response,await continuity.progress(session,progressInput(value,projectId)));return;}
      if (operation === "invite") {json(response,await continuity.invite(session,projectId,value.role));return;}
      if (operation === "revoke") {continuity.revoke(session,projectId,textInput(value.member_id,"成员",128));json(response,{ok:true});return;}
      throw new ImError("server.not_found","找不到此入口",404);
    } catch (error) {
      if (response.headersSent) {response.end();return;}
      if (error instanceof ImError) {json(response,{code:error.code,error:error.message},error.status);return;}
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "server.unavailable";
      // The injected IM domain owns its error class; translate known access failures without leaking arbitrary messages.
      if (code === "im.forbidden" || code === "im.unauthenticated") {
        json(response,{code,error:code === "im.forbidden" ? "你没有这个群的访问权限" : "请重新连接设备"},code === "im.forbidden" ? 403 : 401);return;
      }
      // Host failures can include local paths; return an actionable boundary message only.
      json(response,{code,error:"桌面服务暂不可用或尚未授权此成员。请在桌面检查连接和动作授权，再核对重试。"},503);
    }
  };
}
function eventCursor(request: IncomingMessage,url: URL): number {
  const value = Number(request.headers["last-event-id"] ?? url.searchParams.get("after") ?? 0);
  if (!Number.isSafeInteger(value) || value < 0) throw new ImError("server.cursor_invalid","事件游标无效");
  return value;
}
