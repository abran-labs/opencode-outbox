import {Plugin} from "@opencode/plugin";
import {makeCards} from "./cards.js";
import {Outbox} from "./rpc.js";
const field = description => ({type:"string",maxLength:1024,description});
const slackMentions={type:"array",maxItems:100,description:"Labels for Slack user mentions in the body. Resolve each user in the destination workspace through the connector. Write <@USER_ID> in body and supply the matching ID and display name here. Never invent IDs. Leave ordinary @text unlinked.",items:{type:"object",additionalProperties:false,required:["id","name"],properties:{id:{type:"string",pattern:"^[UW][A-Z0-9]+$"},name:{type:"string",minLength:1,maxLength:128}}}};
export default Plugin.define({id:"outbox", async setup(ctx) {
  const cards = makeCards(ctx.storage, notice=>ctx.session.synthetic(notice),async()=>{
    // Old recipient-less mail drafts may lack a tool hint. Only infer an unambiguous mail sender.
    const senders=(await ctx.tool.list()).filter(t=>/send/i.test(t.name) && /mail/i.test(t.id) && t.input?.properties?.to && t.input?.properties?.subject && t.input?.properties?.body);
    return senders.length===1?senders[0].id:undefined;
  },async sessionID=>(await ctx.session.get({sessionID})).agent);
  const registration=await ctx.rpc.register(Outbox,{get:cards.get,change:cards.change,rule:cards.rule});
  await ctx.session.hook("context", event=>{
    if(event.tools.create_message_card)event.system.push({type:"text",text:"For a requested Slack mention, resolve the person with the destination workspace's connector, put <@USER_ID> in the body and supply slack_mentions for display. Ask if identity is ambiguous. On delivery preserve those exact tokens using Slack mention-capable text."});
    if(event.tools.create_message_card) event.system.push({type:"text",text:"Resolve Discord identities through the connector. When the account or DM listing lacks a display name, use the connector's user lookup by user ID before falling back to @username. Put the display name first and the @username in parentheses, then retain the exact routing ID: From Display Name (@username) (user ID), To Display Name (@username) (DM channel ID). The card hides routing IDs. For guild channels use #channel (channel ID); for mail use ordinary email addresses. Never invent names or IDs."});
    if(event.tools.edit_message_card) event.system.push({type:"text",text:"For follow-up corrections, additions or rewrites, use edit_message_card with the UUID (first token) from the existing draft's outbox fence. End your reply with the newly returned fence verbatim to move that same card to the bottom of the chat. Never create another card for an edit."});
    if(event.tools.create_message_card) event.system.push({type:"text",text:
      "For message requests, use create_message_card instead of drafting in prose or sending directly. Set intent to send only when the user explicitly requests delivery; this asks for Outbox review unless a saved rule applies. For explicit draft requests, omit intent or use draft, even if a send rule is enabled. Include the appropriate delivery tool, exact recipient addresses or stable IDs, and the sender account if known. For mail, include the tool even without a known recipient so the user can fill in To. Never guess an address or account. Repeat the returned outbox fence verbatim. Use a remote draft only when specifically requested. An Outbox synthetic send request is a delivery handoff: use the normal connector under its approval requirements, not create_message_card again."});
  });
  await ctx.tool.transform(editor=>editor.add({
    name:"create_message_card",
    description:"Create an editable Outbox draft in chat, or request delivery when the user explicitly asked to send. Send intent skips Outbox review only under a saved rule; connector approvals still apply. Include the appropriate available messaging tool as delivery, even for mail without a recipient; the user can fill in To. Omit delivery for copy-only drafts. Show the returned fenced block verbatim.",
    input:{type:"object",additionalProperties:false,required:["body"],properties:{
      slack_mentions:slackMentions,intent:{enum:["draft","send"],description:"Use send only for an explicit user request to deliver. Defaults to draft."},
      body:{type:"string",minLength:1,maxLength:100000},service:field("Display name, e.g. Discord, Mail, or any custom destination name. For manual copy/paste use its name or Custom and omit delivery."),
      to:field("Email address, Display Name (@username) (DM channel ID), or #channel (channel ID). Resolve names and IDs through the connector."),
      from:field("Email address or alias; for Discord use Display Name (@username) (user ID) from connector metadata."),cc:field("Cc addresses"),bcc:field("Bcc addresses"),subject:field("Message subject"),
      delivery:field("Name(s) of available delivery tool(s). A hint to the session agent, never executed as code.")
    }},options:{codemode:false},execute:async(input,invocation)=>{
      const card = await cards.create(invocation.sessionID,input,invocation.agent);
      const outcome = card.state==="sending" ? "\nSend handed off to the originating session, not confirmed delivered. Do not send separately." :
        card.state==="unconfirmed" ? "\nSend handoff unconfirmed. Do not retry or send separately." : "";
      return {content:`\`\`\`outbox\n${card.id}\n\`\`\`${outcome}`};
    }
  }));
  await ctx.tool.transform(editor=>editor.add({
    name:"report_message_delivery",description:"Finish an Outbox send handoff with the actual messaging connector result. Use sent only for confirmed delivery, failed for definite non-delivery, uncertain for unknown outcome. Never sends a message.",
    input:{type:"object",additionalProperties:false,required:["id","outcome"],properties:{
      id:field("UUID from the send handoff"),outcome:{enum:["sent","failed","uncertain"]},detail:{type:"string",maxLength:512,description:"Short failure reason or confirmation reference"}
    }},options:{codemode:false},execute:async(input,invocation)=>{
      const sessionID=invocation.sessionID;
      const card=await cards.report({...input,sessionID});
      await registration.events.emit("revised",{sessionID,id:card.id});
      return {content:"Delivery status recorded. Do not send again."};
    }
  }));
  await ctx.tool.transform(editor=>editor.add({
    name:"edit_message_card",
    description:"Edit an existing unsent Outbox card and move it to your latest reply. Use the UUID (first token) from its earlier fence. Append exact text (including spacing), replace one unique literal passage using old_text/new_text, or change named envelope fields. For a complete rewrite use the previous full body as old_text. End your reply with the returned fence verbatim. Never sends or creates a second draft.",
    input:{type:"object",additionalProperties:false,required:["id"],properties:{
      slack_mentions:slackMentions,id:field("Existing card UUID"),append:{type:"string",maxLength:100000},
      old_text:{type:"string",minLength:1,maxLength:100000},new_text:{type:"string",maxLength:100000},
      subject:field("Replacement subject"),from:field("Replacement sender"),to:field("Replacement recipient"),cc:field("Replacement Cc"),bcc:field("Replacement Bcc")
    }},options:{codemode:false},execute:async(input,invocation)=>{
      const sessionID=invocation.sessionID;
      const card=await cards.revise({...input,sessionID});
      try {await registration.events.emit("revised",{sessionID,id:card.id});}
      catch {/* The new placement reads the persisted draft even if the update event was missed. */}
      return {content:`\`\`\`outbox\n${card.id} ${card.position}\n\`\`\``};
    }
  }));
}});
