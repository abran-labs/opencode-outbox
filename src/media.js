import {constants,createReadStream} from "node:fs";
import {chmod,copyFile,mkdir,open,readFile,rm,stat} from "node:fs/promises";
import {createHash,randomUUID} from "node:crypto";
import {basename,join,isAbsolute} from "node:path";
import {homedir} from "node:os";
import {execFile} from "node:child_process";
import {promisify} from "node:util";
const exec=promisify(execFile);
const root=join(process.env.XDG_DATA_HOME||join(homedir(),".local/share"),"opencode-outbox","media");
const chunk=192*1024, max=1024**3;
const uuid=/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i;
const transfers=new Map();
function dir(c,id){
  if(!/^ses_[\w-]+$/.test(c.sessionID)||!uuid.test(c.id)||!uuid.test(id))throw Error("Invalid attachment reference.");
  return join(root,c.sessionID,c.id,id);
}
function safeName(name){
  if(!name||name==="."||name===".."||name!==basename(name)||/[\\/\x00-\x1f]/.test(name)||Buffer.byteLength(name)>200)throw Error("Invalid attachment filename.");
  return name;
}
export const mediaPath=(c,a)=>join(dir(c,a.id),safeName(a.name));
export const removeMedia=(c,a)=>rm(dir(c,a.id),{recursive:true,force:true});
function typeOf(b){
  const s=b.toString("latin1");
  if(s.startsWith("\x89PNG\r\n\x1a\n"))return ["image/png","png_pipe"];
  if(s.startsWith("\xff\xd8\xff"))return ["image/jpeg","jpeg_pipe"];
  if(/^GIF8[79]a/.test(s))return ["image/gif","gif"];
  if(s.startsWith("RIFF")&&s.slice(8,12)==="WEBP")return ["image/webp","webp_pipe"];
  if(s.slice(4,8)==="ftyp"){
    if(/avif|avis/.test(s.slice(8,32)))return ["image/avif","mov"];
    if(/heic|heix|heif|mif1/.test(s.slice(8,32)))return ["image/heic","mov"];
    return [s.slice(8,12)==="qt  "?"video/quicktime":"video/mp4","mov"];
  }
  if(s.startsWith("\x1a\x45\xdf\xa3"))return ["video/webm","matroska"];
  throw Error("Choose a PNG, JPEG, GIF, WebP, AVIF, HEIC, MP4, MOV or WebM file.");
}
async function metadata(c,id,name){
  const path=mediaPath(c,{id,name}),file=await open(path,"r");let mime,format,size;
  try{size=(await file.stat()).size;if(!size||size>max)throw Error("Outbox stages files up to 1 GiB each.");
    const head=Buffer.alloc(64);await file.read(head,0,64,0);[mime,format]=typeOf(head);
  }finally{await file.close();}
  const hash=createHash("sha256");for await(const part of createReadStream(path))hash.update(part);
  const a={id,name,mime,size,sha256:hash.digest("hex")};
  const input=["-protocol_whitelist","file","-f",format,"-i",path];
  try{
    const {stdout}=await exec("ffmpeg",["-nostdin","-v","error","-max_alloc","134217728","-threads","1",...input,"-map","0:v:0","-frames:v","1","-vf","scale=320:200:force_original_aspect_ratio=decrease","-threads","1","-c:v","mjpeg","-f","image2pipe","pipe:1"],{encoding:"buffer",timeout:10000,maxBuffer:256*1024});
    if(stdout.length)a.thumbnail="data:image/jpeg;base64,"+stdout.toString("base64");
  }catch{if(mime.startsWith("image/")&&size<=192*1024)a.thumbnail=`data:${mime};base64,`+(await readFile(path)).toString("base64");}
  if(mime.startsWith("video/"))try{
    const {stdout}=await exec("ffprobe",["-v","error","-show_entries","format=duration","-of","csv=p=0",...input],{timeout:4000});
    const seconds=Number(stdout);if(Number.isFinite(seconds)&&seconds>0)a.duration=seconds;
  }catch{/* Thumbnail and duration are optional; preserve the original file. */}
  return a;
}
async function allocate(c,name){
  safeName(name);const id=randomUUID(),folder=dir(c,id);
  await mkdir(folder,{mode:0o700,recursive:true});return {id,name};
}
export async function stagePaths(c,paths=[]){
  const made=[];
  try{
    for(const source of paths){
      if(!isAbsolute(source))throw Error("Attachment paths must be absolute.");
      const s=await stat(source);if(!s.isFile()||!s.size||s.size>max)throw Error("Choose a non-empty regular file up to 1 GiB.");
      const a=await allocate(c,basename(source));made.push(a);
      const dest=mediaPath(c,a);await copyFile(source,dest,constants.COPYFILE_EXCL);await chmod(dest,0o600);
      Object.assign(a,await metadata(c,a.id,a.name));
    }
    return made;
  }catch(e){await Promise.all(made.map(a=>removeMedia(c,a)));throw e;}
}
function expire(c,t){
  clearTimeout(t.timer);t.timer=setTimeout(()=>{transfers.delete(t.id);removeMedia(c,t).catch(()=>{});},10*60*1000);t.timer.unref?.();
}
export async function uploadPart(c,r){
  if(!r.upload_id){
    if(!Number.isSafeInteger(r.total)||r.total<1||r.total>max)throw Error("Outbox stages files up to 1 GiB each.");
    if([...transfers.values()].filter(t=>t.card===c.id).length>=8)throw Error("Too many unfinished transfers.");
    const t={...await allocate(c,r.name),session:c.sessionID,card:c.id,total:r.total,offset:0};
    transfers.set(t.id,t);expire(c,t);return {upload_id:t.id};
  }
  const t=transfers.get(r.upload_id);
  if(!t||t.session!==c.sessionID||t.card!==c.id)throw Error("Upload expired or belongs to another draft.");
  try{
    if(r.cancel){clearTimeout(t.timer);transfers.delete(t.id);await removeMedia(c,t);return {};}
    const buf=Buffer.from(r.data||"","base64");
    if(t.offset!==r.offset||!buf.length||buf.length>chunk||t.offset+buf.length>t.total)throw Error("Invalid upload chunk.");
    const f=await open(mediaPath(c,t),t.offset===0?"wx":"a",0o600);try{await f.writeFile(buf);}finally{await f.close();}
    t.offset+=buf.length;expire(c,t);if(t.offset<t.total)return {offset:t.offset};
    const result=await metadata(c,t.id,t.name);clearTimeout(t.timer);transfers.delete(t.id);return {attachment:result};
  }catch(e){clearTimeout(t.timer);transfers.delete(t.id);await removeMedia(c,t);throw e;}
}
export function attachmentWarnings(c){
  const list=c.attachments||[],limit=c.media_limit,warnings={};
  if(!limit)return warnings;
  const total=list.reduce((sum,a)=>sum+a.size,0);
  for(const a of list){
    if(limit.max_bytes&&(!limit.kind||a.mime.startsWith(limit.kind+"/"))&&a.size>limit.max_bytes)warnings[a.id]=`${a.size.toLocaleString()} bytes exceeds the ${limit.max_bytes.toLocaleString()}-byte file limit (${limit.source}).`;
    else if(limit.total_bytes&&total>limit.total_bytes)warnings[a.id]=`Attachments total ${total.toLocaleString()} bytes; limit ${limit.total_bytes.toLocaleString()} bytes (${limit.source}).`;
    else if(limit.max_files&&list.length>limit.max_files)warnings[a.id]=`${list.length} attachments; limit ${limit.max_files} (${limit.source}).`;
  }
  return warnings;
}
