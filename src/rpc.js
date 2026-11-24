import { Rpc } from "@opencode/plugin/rpc";
const str = {type:"string"};
const object = (properties, required) => ({type:"object",properties,required,additionalProperties:false});
const key = {sessionID:str,id:str};
const method = input => ({input,output:{type:"object"},errors:{}});
const rev={type:"integer",minimum:0};
export const Outbox = Rpc.define({id:"outbox",events:{revised:{schema:object(key,["sessionID","id"])}},methods:{
  get:method(object(key,["sessionID","id"])),
  change:method(object({...key,revision:rev,body:str,subject:str,from:str,to:str,cc:str,bcc:str,ping_on_reply:{type:"boolean"},remove_attachments:{type:"array",items:str,maxItems:32},action:{enum:["edit","discard","send"]}},["sessionID","id","revision","action"])),
  upload:method(object({...key,revision:rev,name:{type:"string",maxLength:200},total:rev,upload_id:str,offset:rev,cancel:{type:"boolean"},data:{type:"string",maxLength:262144}},["sessionID","id","revision"])),
  rule:method(object({...key,mode:{enum:["recipient","approval","agent","global"]}},["sessionID","id","mode"]))
}});
