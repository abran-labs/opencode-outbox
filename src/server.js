import {Plugin} from "@opencode/plugin";
import {makeCards} from "./cards.js";
import {Outbox} from "./rpc.js";
const field = description => ({type:"string",maxLength:1024,description});
export default Plugin.define({id:"outbox", async setup(ctx) {
  const cards = makeCards(ctx.storage, notice=>ctx.session.synthetic(notice),async()=>{
    // Old recipient-less mail drafts may lack a tool hint. Only infer an unambiguous mail sender.
    const senders=(await ctx.tool.list()).filter(t=>/send/i.test(t.name) && /mail/i.test(t.id) && t.input?.properties?.to && t.input?.properties?.subject && t.input?.properties?.body);
    return senders.length===1?senders[0].id:undefined;
  },async sessionID=>(await ctx.session.get({sessionID})).agent);
  await ctx.rpc.register(Outbox,{get:cards.get,change:cards.change,rule:cards.rule});
  await ctx.session.hook("context", event=>{
    if(event.tools.create_message_card) event.system.push({type:"text",text:
      "For message requests, use create_message_card instead of drafting in prose or sending directly. Set intent to send only when the user explicitly requests delivery; this asks for Outbox review unless a saved rule applies. For explicit draft requests, omit intent or use draft, even if a send rule is enabled. Include the appropriate delivery tool, exact recipient addresses or stable IDs, and the sender account if known. For mail, include the tool even without a known recipient so the user can fill in To. Never guess an address or account. Repeat the returned outbox fence verbatim. Use a remote draft only when specifically requested. An Outbox synthetic send request is a delivery handoff: use the normal connector under its approval requirements, not create_message_card again."});
  });
  await ctx.tool.transform(editor=>editor.add({
    name:"create_message_card",
    description:"Create an editable Outbox draft in chat, or request delivery when the user explicitly asked to send. Send intent skips Outbox review only under a saved rule; connector approvals still apply. Include the appropriate available messaging tool as delivery, even for mail without a recipient; the user can fill in To. Omit delivery for copy-only drafts. Show the returned fenced block verbatim.",
    input:{type:"object",additionalProperties:false,required:["body"],properties:{
      intent:{enum:["draft","send"],description:"Use send only for an explicit user request to deliver. Defaults to draft."},
      body:{type:"string",minLength:1,maxLength:100000},service:field("Display name, e.g. Discord or Mail"),
      to:field("Exact intended destination with address or stable channel/user ID and optional display name"),
      from:field("Sender account or alias"),cc:field("Cc addresses"),bcc:field("Bcc addresses"),subject:field("Message subject"),
      delivery:field("Name(s) of available delivery tool(s). A hint to the session agent, never executed as code.")
    }},options:{codemode:false},execute:async(input,invocation)=>{
      const card = await cards.create(invocation.sessionID,input,invocation.agent);
      const outcome = card.state==="requested" ? "\nSend handed off to the originating session, not confirmed delivered. Do not send separately." :
        card.state==="unconfirmed" ? "\nSend handoff unconfirmed. Do not retry or send separately." : "";
      return {content:`\`\`\`outbox\n${card.id}\n\`\`\`${outcome}`};
    }
  }));
}});
