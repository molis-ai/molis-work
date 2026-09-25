import type { BoundActionClient } from "@molis-ai/molis-work-contracts/platform/actions";
import { ActionError } from "@molis-ai/molis-work-contracts/platform/actions";
import { imagesActions } from "./actions.js";
export interface ImagesRouteResult { status:number; body?:unknown; image?:{bytes:Uint8Array;mime:string;filename:string} }
/** Transport-only adapter; project authority belongs to the bound action client. */
export async function handleImagesRoute(actions:BoundActionClient,input:{method:string;pathname:string;body:Record<string,unknown>;projectId:string}):Promise<ImagesRouteResult>{
  const path=input.pathname.slice('/api/images'.length).split('/').filter(Boolean).map(decodeURIComponent);
  const {project_id,...body}=input.body;
  if(project_id!==undefined&&project_id!==input.projectId)throw new ActionError('actions.scope_mismatch','图片项目与当前项目不一致');
  const {method}=input;
  if(path.length===1&&path[0]==='connections'){
    if(method==='GET')return {status:200,body:await actions.invoke(imagesActions.connections,{})};
    if(method==='POST')return {status:200,body:await actions.invoke(imagesActions.saveConnection,body as never)};
  }
  if(path.length===2&&path[0]==='connections'&&method==='DELETE')return {status:200,body:await actions.invoke(imagesActions.deleteConnection,{id:path[1]!})};
  if(path[0]==='jobs'){
    if(path.length===1&&method==='GET')return {status:200,body:input.projectId?await actions.invoke(imagesActions.list,{}):{jobs:[]}};
    if(path.length===1&&method==='POST')return {status:202,body:await actions.invoke(imagesActions.start,body as never)};
    if(path.length===2&&method==='GET')return {status:200,body:await actions.invoke(imagesActions.get,{id:path[1]!})};
    if(path.length===2&&method==='DELETE')return {status:200,body:await actions.invoke(imagesActions.delete,{id:path[1]!})};
    if(path.length===3&&path[2]==='cancel'&&method==='POST')return {status:200,body:await actions.invoke(imagesActions.cancel,{id:path[1]!})};
    if(path.length===4&&path[2]==='images'&&method==='GET'){
      const image=await actions.invoke(imagesActions.image,{id:path[1]!,image_id:path[3]!});
      return {status:200,image:{bytes:Buffer.from(image.base64,'base64'),mime:image.mime_type,filename:image.filename}};
    }
  }
  return {status:['GET','POST','DELETE'].includes(method)?404:405,body:{error:'找不到图片操作或请求方法不支持'}};
}
