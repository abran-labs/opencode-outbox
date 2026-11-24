import test from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,writeFile,rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {makeCards} from "../src/cards.js";
import {attachmentWarnings} from "../src/media.js";

test("a total limit flags only files too large on their own; combined overflow belongs to the draft",()=>{
  const card={media_limit:{total_bytes:10*1024**2,source:"fixture"},attachments:[{id:"image",size:10586318},{id:"pdf",size:61338}]};
  assert.deepEqual(Object.keys(attachmentWarnings(card)),["image"]);
  card.attachments[0].size=card.media_limit.total_bytes;
  assert.deepEqual(Object.keys(attachmentWarnings(card)),["total"]);
  card.attachments.pop();assert.deepEqual(attachmentWarnings(card),{});
});

const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aNrkAAAAASUVORK5CYII=","base64");
test("mixed file types keep their exact bytes and viewer paths",async t=>{
  const dir=await mkdtemp(join(tmpdir(),"outbox-files-"));t.after(()=>rm(dir,{recursive:true,force:true}));
  const fixtures=[["brief.pdf","%PDF-1.4\n1 0 obj\n<<>>\nendobj","application/pdf"],["mark.svg",'<svg xmlns="http://www.w3.org/2000/svg"><circle r="1"/></svg>',"image/svg+xml"],["voice.wav",Buffer.from("524946462400000057415645666d74201000000001000100401f0000803e0000020010006461746100000000","hex"),"audio/wav"],["project.blob",Buffer.from([0,255,1,15]),"application/octet-stream"]];
  for(const [name,data] of fixtures)await writeFile(join(dir,name),data);
  const rows=new Map();const cards=makeCards({get:k=>structuredClone(rows.get(k)),set:(k,v)=>rows.set(k,structuredClone(v))},async()=>{});
  const c=await cards.create("ses_files",{attachments:fixtures.map(([name])=>join(dir,name))});
  t.after(()=>cards.change({...c,action:"discard"}));
  const {attachments}=await cards.get(c);
  for(const [i,[name,data,mime]] of fixtures.entries()){
    const a=attachments[i];assert.equal(a.name,name);assert.equal(a.mime,mime);
    assert.deepEqual(await readFile(a.file_path),Buffer.from(data));
  }
});
test("removing media without a connector limit returns the saved draft as valid JSON",async t=>{
  const dir=await mkdtemp(join(tmpdir(),"outbox-remove-test-"));t.after(()=>rm(dir,{recursive:true,force:true}));
  const path=join(dir,"photo.png");await writeFile(path,png);
  const rows=new Map();
  const cards=makeCards({get:k=>rows.has(k)?JSON.parse(rows.get(k)):undefined,set:(k,v)=>rows.set(k,JSON.stringify(v))},async()=>{});
  const card=await cards.create("ses_remove",{service:"Playtest chat",body:"Caption",attachments:[path,path]});
  const ref={id:card.id,sessionID:card.sessionID};
  t.after(async()=>{const latest=await cards.get(ref);await cards.change({...ref,revision:latest.revision,action:"discard"});});
  const result=await cards.change({...ref,revision:0,action:"edit",body:card.body,remove_attachments:[card.attachments[1].id]});
  const saved=await cards.get(ref);
  assert.deepEqual(saved.attachments.map(a=>a.id),[card.attachments[0].id]);
  assert.deepEqual(result,JSON.parse(JSON.stringify(result)));
  assert.deepEqual(result,saved);
});
test("media-only draft freezes selected bytes; edits remove files and rejection preserves the draft",async t=>{
  const dir=await mkdtemp(join(tmpdir(),"outbox-media-test-"));t.after(()=>rm(dir,{recursive:true,force:true}));
  const path=join(dir,"bridge.png");await writeFile(path,png);
  const rows=new Map(),notices=[];
  const cards=makeCards({get:k=>structuredClone(rows.get(k)),set:(k,v)=>rows.set(k,structuredClone(v))},async n=>notices.push(n));
  const card=await cards.create("ses_fixture",{service:"Mail",to:"x@example.test",delivery:"fixture.mail",body:"",attachments:[path]});
  const ref={sessionID:card.sessionID,id:card.id};
  const first=card.attachments[0];assert.equal(first.size,png.length);
  await assert.rejects(cards.deliveryBytes({...ref,attachment_id:first.id}),/pending send/);
  const edited=await cards.revise({...ref,add_attachments:[path],remove_attachments:[first.id]});
  assert.notEqual(edited.attachments[0].id,first.id);
  await writeFile(path,"different bytes");
  await cards.change({...ref,revision:edited.revision,action:"send",body:""});
  const env=JSON.parse(notices[0].text.split("\n").at(-1));
  assert.equal(env.attachments.length,1);assert.deepEqual(await readFile(env.attachments[0].path),png);
  const transfer=await cards.deliveryBytes({...ref,attachment_id:env.attachments[0].id});assert.deepEqual(Buffer.from(transfer.base64,"base64"),png);
  const failed=await cards.report({...ref,outcome:"failed",detail:"Upload rejected"});assert.equal(failed.state,"draft");
  assert.equal(failed.attachments.length,1);
  await cards.change({...ref,revision:failed.revision,action:"discard"});
  await assert.rejects(readFile(env.attachments[0].path),{code:"ENOENT"});
});
test("chunked upload checks ownership, revision, verified limits and destination changes",async()=>{
  const rows=new Map(),notices=[];
  const cards=makeCards({get:k=>structuredClone(rows.get(k)),set:(k,v)=>rows.set(k,structuredClone(v))},async n=>notices.push(n));
  const to={service:"Mail",to:"first@example.test",body:"Caption",delivery:"fixture.mail"};
  const a=await cards.create("ses_upload",{...to,media_limit:{kind:"image",max_bytes:png.length-1,source:"fixture account"}}),b=await cards.create("ses_upload",to);
  const ref={id:a.id,sessionID:a.sessionID,revision:0},start=await cards.upload({...ref,name:"one.png",total:png.length});
  const part={upload_id:start.upload_id,offset:0,data:png.subarray(0,5).toString("base64")};
  await assert.rejects(cards.upload({...ref,...part,id:b.id}),/another draft/);
  await assert.rejects(cards.upload({...ref,...part,revision:8}),/Draft changed/);
  await cards.upload({...ref,...part});
  assert.equal((await cards.get(ref)).attachments?.length||0,0);
  const {card}=await cards.upload({...ref,upload_id:start.upload_id,offset:5,data:png.subarray(5).toString("base64")});
  assert.match(Object.values(card.media_warnings)[0],/fixture account/);
  await assert.rejects(cards.change({...ref,revision:1,action:"send",body:""}),/file limit/);assert.equal(notices.length,0);
  const next=await cards.change({...ref,revision:1,to:"second@example.test",body:"",action:"edit"});
  assert.deepEqual(next.media_warnings,{});
  await cards.change({...ref,revision:2,body:"",action:"send"});
  await cards.report({...ref,outcome:"uncertain"});
  await assert.rejects(cards.revise({...ref,append:"again"}),/closed/);
  await cards.report({...ref,outcome:"sent"});
});
test("Discord reply handoff binds the exact channel, message and ping flag",async()=>{
  const rows=new Map(),notices=[];let strict=false;
  const cards=makeCards({get:k=>structuredClone(rows.get(k)),set:(k,v)=>rows.set(k,structuredClone(v))},async n=>notices.push(n),undefined,undefined,undefined,async()=>strict);
  const channel="111111111111111111",message="222222222222222222";
  const a=await cards.create("ses_reply",{service:"Discord",delivery:"discord.deliver_text",to:`#test (${channel})`,body:"Yes",reply:{channel_id:channel,message_id:message,author:"Fixture",excerpt:"Ready?"}});
  const r={id:a.id,sessionID:a.sessionID,revision:0,body:"Yes",action:"send"};
  await assert.rejects(cards.change({...r,to:"333333333333333333"}),/channel must match/);
  await assert.rejects(cards.change(r),/Update the bridge/);assert.equal(notices.length,0);
  strict=true;await cards.change({...r,ping_on_reply:false});
  const env=JSON.parse(notices[0].text.split("\n").at(-1));assert.equal(env.reply.message_id,message);
  assert.equal(env.reply.ping_on_reply,false);assert.match(env.delivery,/discord\.draft_message/);
});
