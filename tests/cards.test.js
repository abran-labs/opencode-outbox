import test from "node:test";
import assert from "node:assert/strict";
import {makeCards} from "../src/cards.js";

function fixture(fail=false) {
  const rows=new Map(), notices=[];
  const cards=makeCards({get:k=>structuredClone(rows.get(k)),set:(k,v)=>rows.set(k,structuredClone(v))},async notice=>{
    notices.push(notice);
    if(fail) throw Error("lost response");
  });
  return {cards,notices};
}
test("one click admission freezes the latest body; competing clicks cannot enqueue twice",async()=>{
  const {cards,notices}=fixture();
  const card=await cards.create("ses_a",{body:"rough",to:"user123",service:"Chat",delivery:"chat.send"});
  const args={sessionID:"ses_a",id:card.id,revision:0,body:"final\n✉️",action:"send"};
  const results=await Promise.allSettled([cards.change(args),cards.change(args)]);
  assert.equal(results.filter(x=>x.status==="fulfilled").length,1);
  assert.equal(notices.length,1);
  assert.equal(JSON.parse(notices[0].text.split("\n").at(-1)).body,args.body);
  assert.equal((await cards.get(args)).state,"requested");
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
