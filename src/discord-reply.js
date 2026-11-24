const snowflake="[0-9]{17,20}";
const exactId=new RegExp(`^${snowflake}$`);
const labeledChannel=new RegExp(`^[^\\r\\n]+[ \\t]+\\((${snowflake})\\)$`);
const authorMax=128,excerptMax=500;

export const replySchema={
  type:"object",additionalProperties:false,required:["channel_id","message_id","author","excerpt"],
  properties:{
    channel_id:{type:"string",pattern:exactId.source,description:"Channel ID of both the replied-to message and the card recipient."},
    message_id:{type:"string",pattern:exactId.source,description:"Discord ID of the message to reply to."},
    author:{type:"string",minLength:1,maxLength:authorMax,pattern:"\\S",description:"Display name of the replied-to author; preview only."},
    excerpt:{type:"string",maxLength:excerptMax,description:"Snippet of the replied-to message; may be empty, preview only."},
    ping_on_reply:{type:"boolean",default:true,description:"Whether Discord should ping the replied-to author."}
  }
};

export function normalizeReply(input,card) {
  if(input===undefined)return;
  if(typeof card?.service!=="string" || card.service.trim().toLowerCase()!=="discord")
    throw Error("Reply metadata requires a Discord card.");
  if(!input || typeof input!=="object" || Array.isArray(input) ||
    replySchema.required.some(field=>!Object.hasOwn(input,field)) ||
    Object.keys(input).some(field=>!Object.hasOwn(replySchema.properties,field)))
    throw Error("Invalid Discord reply metadata.");
  const {channel_id,message_id,author,excerpt,ping_on_reply=true}=input;
  if(typeof channel_id!=="string" || !exactId.test(channel_id) ||
    typeof message_id!=="string" || !exactId.test(message_id))
    throw Error("Discord reply requires valid channel and message IDs.");
  const to=typeof card.to==="string"?card.to.trim():"";
  if((exactId.test(to)?to:labeledChannel.exec(to)?.[1])!==channel_id)
    throw Error("Discord reply channel must match the card recipient's channel ID.");
  if(typeof author!=="string" || !author.trim() || [...author].length>authorMax ||
    typeof excerpt!=="string" || [...excerpt].length>excerptMax || typeof ping_on_reply!=="boolean")
    throw Error("Invalid Discord reply preview or ping setting.");
  return {channel_id,message_id,author:author.trim(),excerpt:excerpt.trim(),ping_on_reply};
}
