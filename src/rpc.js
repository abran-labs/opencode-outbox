import { Rpc } from "@opencode/plugin/rpc";
const str = {type:"string"};
const object = (properties, required) => ({type:"object",properties,required,additionalProperties:false});
const key = {sessionID:str,id:str};
const method = input => ({input,output:{type:"object"},errors:{}});
export const Outbox = Rpc.define({id:"outbox",events:{},methods:{
  get:method(object(key,["sessionID","id"])),
  change:method(object({...key,revision:{type:"integer",minimum:0},body:str,subject:str,from:str,to:str,cc:str,bcc:str,action:{enum:["edit","discard","send"]}},["sessionID","id","revision","action"])),
  rule:method(object({...key,mode:{enum:["recipient","approval","agent"]}},["sessionID","id","mode"]))
}});
