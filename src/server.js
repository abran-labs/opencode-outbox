import {Plugin} from "@opencode/plugin";
import {makeCards} from "./cards.js";
import {Outbox} from "./rpc.js";
const field = description => ({type:"string",maxLength:1024,description});
export default Plugin.define({id:"outbox", async setup(ctx) {
  const cards = makeCards(ctx.storage, notice=>ctx.session.synthetic(notice));
  await ctx.rpc.register(Outbox,{get:cards.get,change:cards.change});
  await ctx.session.hook("context", event=>{
    if(event.tools.create_message_card) event.system.push({type:"text",text:
      "For message-drafting requests, use create_message_card instead of drafting in prose. Include an available messaging tool's name in delivery when the destination is resolved, even when asked only to draft: this enables the human-operated Send button and does not send anything. Repeat the returned outbox fence verbatim for the user. Use a remote draft only when specifically requested. An Outbox Send click is a delivery request, not another drafting request."});
  });
  await ctx.tool.transform(editor=>editor.add({
    name:"create_message_card",
    description:"Create an editable Outbox draft in chat. Creates no remote draft and sends nothing. Use whenever asked to draft a message. Supply delivery only when the session has an appropriate messaging tool and a resolved destination; omit it for Copy. Show the returned fenced block verbatim in your final response instead of repeating the draft.",
    input:{type:"object",additionalProperties:false,required:["body"],properties:{
      body:{type:"string",minLength:1,maxLength:100000},service:field("Display name, e.g. Discord or Mail"),
      to:field("Exact intended destination with address or stable channel/user ID and optional display name"),
      from:field("Sender account or alias"),cc:field("Cc addresses"),bcc:field("Bcc addresses"),subject:field("Message subject"),
      delivery:field("Name(s) of available delivery tool(s). A hint to the session agent, never executed as code.")
    }},options:{codemode:false},execute:async(input,invocation)=>{
      const card = await cards.create(invocation.sessionID,input);
      return {content:`\`\`\`outbox\n${card.id}\n\`\`\``};
    }
  }));
}});
