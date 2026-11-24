import test from "node:test";
import assert from "node:assert/strict";
import {makeCards} from "../src/cards.js";

function fixture(fail=false, findAgent) {
  const rows=new Map(), notices=[];
  const storage={get:k=>structuredClone(rows.get(k)),set:(k,v)=>rows.set(k,structuredClone(v))};
  const notify=async notice=>{
    notices.push(notice);
    if(fail) throw Error("lost response");
  };
  const reload=()=>makeCards(storage,notify,undefined,findAgent);
  return {cards:reload(),notices,rows,reload};
}
test("agent edits one existing draft and preserves manual edits outside the targeted text",async()=>{
  const {cards,rows,notices}=fixture();
  const c=await cards.create("ses_a",{body:"Hi. First idea.",to:"someone"});
  const ref={sessionID:"ses_a",id:c.id};
  await cards.change({...ref,revision:0,action:"edit",body:"Hi Sophie. First idea."});
  const edited=await cards.revise({...ref,old_text:"First idea.",new_text:"New idea."});
  assert.equal(edited.id,c.id);
  assert.equal(edited.body,"Hi Sophie. New idea.");
  await assert.rejects(cards.revise({...ref,old_text:"First idea.",new_text:"stale"}));
  await cards.revise({...ref,append:"\n\nThanks!"});
  await assert.rejects(cards.revise({...ref,sessionID:"ses_b",append:"wrong session"}));
  assert.equal((await cards.get(ref)).body,"Hi Sophie. New idea.\n\nThanks!");
  assert.equal(rows.size,1);
  assert.equal(notices.length,0);
  await cards.change({...ref,revision:3,action:"discard"});
  await assert.rejects(cards.revise({...ref,append:"reopen"}));
});
test("one click admission freezes the latest body; competing clicks cannot enqueue twice",async()=>{
  const {cards,notices}=fixture();
  const card=await cards.create("ses_a",{body:"rough",to:"user123",service:"Chat",delivery:"chat.send"});
  const args={sessionID:"ses_a",id:card.id,revision:0,body:"final\n✉️",action:"send"};
  const results=await Promise.allSettled([cards.change(args),cards.change(args)]);
  assert.equal(results.filter(x=>x.status==="fulfilled").length,1);
  assert.equal(notices.length,1);
  assert.equal(JSON.parse(notices[0].text.split("\n").at(-1)).body,args.body);
  assert.equal((await cards.get(args)).state,"sending");
});
test("copy-only draft survives edits; stale revision and foreign session cannot change it",async()=>{
  const {cards,notices}=fixture();
  const c=await cards.create("ses_a",{body:"local"});
  const key={sessionID:"ses_a",id:c.id,revision:0};
  await assert.rejects(cards.get({...key,sessionID:"ses_b"}));
  await assert.rejects(cards.change({...key,action:"send",body:"local"}));
  await cards.change({...key,action:"edit",body:"saved"});
  await assert.rejects(cards.change({...key,action:"discard"}));
  const gone=await cards.change({...key,revision:1,action:"discard"});
  assert.equal(gone.body,"");
  assert.equal(gone.state,"discarded");
  assert.equal(notices.length,0);
});
test("uncertain handoff cannot be re-submitted",async()=>{
  const {cards}=fixture(true);
  const c=await cards.create("ses_a",{body:"hello",to:"1",service:"Chat",delivery:"chat.send"});
  const key={sessionID:"ses_a",id:c.id,revision:0,action:"send",body:"hello"};
  assert.equal((await cards.change(key)).state,"unconfirmed");
  await assert.rejects(cards.change({...key,revision:1}));
});

const message={body:"hello",service:"Mail",delivery:"mail.send",from:"me@example.com",
  to:"a@example.com",cc:"b@example.com",bcc:"c@example.com"};

test("recipient rule persists and uses the saved exact envelope, not the pre-edit envelope",async()=>{
  const {cards,notices,reload}=fixture();
  const card=await cards.create("ses_a",message,"writer");
  const ref={sessionID:"ses_a",id:card.id};
  assert.equal((await cards.get(ref)).mode,"approval");
  const envelope={...message,to:"new@example.com"};
  await cards.change({...ref,revision:0,action:"edit",body:message.body,to:envelope.to});
  assert.equal((await cards.rule({...ref,mode:"recipient"})).mode,"recipient");
  assert.equal((await reload().get(ref)).mode,"recipient");

  const next=await reload().create("ses_b",{...envelope,intent:"send",body:"final",subject:"Subject"},"writer");
  assert.equal(next.state,"sending");
  assert.equal(notices[0].sessionID,"ses_b");
  assert.deepEqual(JSON.parse(notices[0].text.split("\n").at(-1)),{...envelope,body:"final",subject:"Subject"});
  assert.equal((await cards.create("ses_b",{...message,intent:"send"},"writer")).state,"draft");
  assert.equal(notices.length,1);
});

test("recipient rule never widens to a different agent, service, tool, account, To, Cc or Bcc",async()=>{
  const {cards,notices}=fixture();
  const card=await cards.create("ses_a",message,"writer");
  await cards.rule({sessionID:"ses_a",id:card.id,mode:"recipient"});
  assert.equal((await cards.create("ses_b",{...message,intent:"send"},"other")).state,"draft");
  for (const [field,value] of Object.entries({
    service:"Other",delivery:"other.send",from:"other@example.com",to:"other@example.com",
    cc:"",bcc:"c@example.com, other@example.com"
  })) {
    const next=await cards.create("ses_b",{...message,[field]:value,intent:"send"},"writer");
    assert.equal(next.state,"draft",field);
    assert.equal(next.mode,"approval",field);
  }
  const edited=await cards.change({sessionID:card.sessionID,id:card.id,revision:1,action:"edit",body:"still draft",cc:""});
  assert.equal(edited.mode,"approval");
  assert.equal(notices.length,0);
});

test("agent mode only bypasses review for deliverable send intent; approval restores review",async()=>{
  const {cards,notices}=fixture();
  const card=await cards.create("ses_a",message,"writer");
  const ref={sessionID:"ses_a",id:card.id};
  await assert.rejects(cards.rule({...ref,sessionID:"ses_b",mode:"agent"}));
  await cards.rule({...ref,mode:"recipient"});
  assert.equal((await cards.create("ses_b",{...message,intent:"draft"},"writer")).state,"draft");
  assert.equal((await cards.rule({...ref,mode:"agent"})).mode,"agent");
  assert.equal((await cards.create("ses_b",message,"writer")).state,"draft");
  assert.equal((await cards.create("ses_b",{...message,intent:"draft"},"writer")).state,"draft");
  assert.equal((await cards.create("ses_b",{...message,to:"",intent:"send"},"writer")).state,"draft");
  assert.equal((await cards.create("ses_b",{...message,to:"new@example.com",intent:"send"},"other")).state,"draft");
  assert.equal((await cards.create("ses_b",{...message,to:"new@example.com",intent:"send"},"writer")).state,"sending");
  assert.equal((await cards.rule({...ref,mode:"approval"})).mode,"approval");
  assert.equal((await cards.create("ses_b",{...message,intent:"send"},"writer")).state,"draft");
  assert.equal(notices.length,1);
});

test("recipient rule requires a sender account and cannot be set on closed cards",async()=>{
  const {cards}=fixture();
  const card=await cards.create("ses_a",{...message,from:""});
  const ref={sessionID:card.sessionID,id:card.id};
  await assert.rejects(cards.rule({...ref,mode:"recipient"}));
  await cards.change({...ref,revision:0,action:"discard"});
  await assert.rejects(cards.rule({...ref,mode:"agent"}));
});

test("old cards use the session agent or build and pin the agent on a rule change",async()=>{
  let agent="writer";
  const {cards,rows}=fixture(false,sessionID=>sessionID==="ses_old"?agent:undefined);
  for(const [sessionID,owner] of [["ses_old","writer"],["ses_default","build"]]){
    const id=crypto.randomUUID();
    rows.set(`card/${sessionID}/${id}`,{...message,id,sessionID,state:"draft",revision:0});
    const ref={sessionID,id};
    assert.equal((await cards.get(ref)).agent,owner);
    assert.equal((await cards.rule({...ref,mode:"agent"})).mode,"agent");
    agent="other";
    assert.equal((await cards.get(ref)).agent,owner);
    assert.equal((await cards.create("ses_b",{...message,intent:"send"},owner)).state,"sending");
  }
});

test("uncertain rule handoff preserves non-retryable card state",async()=>{
  const {cards,notices}=fixture(true);
  const card=await cards.create("ses_a",message,"writer");
  await cards.rule({sessionID:card.sessionID,id:card.id,mode:"agent"});
  const next=await cards.create("ses_b",{...message,intent:"send"},"writer");
  assert.equal(next.state,"unconfirmed");
  assert.equal((await cards.get(next)).state,"unconfirmed");
  await assert.rejects(cards.change({...next,action:"send"}));
  assert.equal(notices.length,1);
});
