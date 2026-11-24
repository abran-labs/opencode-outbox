import test from "node:test";
import assert from "node:assert/strict";
import {normalizeReply, replySchema} from "../src/discord-reply.js";

const channel="100000000000000001";
const message="100000000000000002";
const other="100000000000000003";
const card={service:"Discord",to:`Fictional Mira (@mira) (${channel})`};
const reply={channel_id:channel,message_id:message,author:"Fictional Mira",excerpt:"The moon garden is open."};

test("binds reply to a bare channel ID, DM label, or guild channel label",()=>{
  for(const to of [channel,card.to,`#moon-garden (${channel})`,`  Mira (${channel})  `]){
    assert.deepEqual(normalizeReply({...reply,ping_on_reply:false},{...card,to}),{
      channel_id:channel,message_id:message,author:"Fictional Mira",excerpt:"The moon garden is open.",ping_on_reply:false
    });
  }
});

test("normalizes preview whitespace and defaults ping to the connector default",()=>{
  assert.deepEqual(normalizeReply({...reply,author:" Fictional Mira ",excerpt:" \n "},card),{
    channel_id:channel,message_id:message,author:"Fictional Mira",excerpt:"",ping_on_reply:true
  });
  assert.equal(normalizeReply(undefined,card),undefined);
});

test("rejects unresolved, malformed, or changed reply destinations",()=>{
  for(const to of [undefined,"Fictional Mira",other,`#moon-garden (${other})`,`Mira (${channel}) extra`,`(${channel})`,`Mira (${channel})\n#garden (${other})`]){
    assert.throws(()=>normalizeReply(reply,{...card,to}),/channel/i);
  }
  assert.throws(()=>normalizeReply(reply,{...card,service:"Slack"}),/Discord/);
});

test("rejects malformed reply metadata instead of dropping the reply",()=>{
  for(const input of [null,[],{}, {...reply,channel_id:` ${channel}`},{...reply,message_id:42},
    {...reply,message_id:`${message}\n`},{...reply,author:" "},{...reply,excerpt:null},
    {...reply,ping_on_reply:"false"},{...reply,ping_on_reply:null},{...reply,content:"not reply metadata"}]){
    assert.throws(()=>normalizeReply(input,card));
  }
  for(const field of replySchema.required){
    const input={...reply};
    delete input[field];
    assert.throws(()=>normalizeReply(input,card));
  }
  for(const field of ["author","excerpt"]){
    assert.throws(()=>normalizeReply({...reply,[field]:"x".repeat(replySchema.properties[field].maxLength+1)},card));
  }
});
