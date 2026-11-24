// CHROMIUM_PATH=/usr/bin/chromium node tests/desktop.smoke.js
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {chromium} from "playwright-core";
import {makeCards} from "../src/cards.js";
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
try {
  const page=await browser.newPage(), rows=new Map(), notices=[];
  const store=makeCards({get:k=>structuredClone(rows.get(k)),set:(k,v)=>rows.set(k,structuredClone(v))},async n=>notices.push(n));
  const sessionID="ses_smoke";
  await page.exposeFunction("fetchDraft",args=>store.get(args));
  await page.exposeFunction("changeDraft",args=>store.change(args));
  await page.exposeFunction("setRule",args=>store.rule(args));
  await page.setContent("<main></main>");
  await page.evaluate(()=>{
    window.exports={};
    window.require=name=>name==="solid-js"?{onCleanup:f=>window.clean=f,getOwner:()=>null,createSignal:v=>[()=>v,next=>{v=next;}]}:name==="solid-js/web"?{render:(fn,el)=>{el.append(...fn());return ()=>el.replaceChildren();}}:{Plugin:{define:x=>x},CodeBlock:"code"};
  });
  await page.addScriptTag({content:await readFile(new URL("../src/gui.cjs",import.meta.url),"utf8")});
  await page.evaluate(()=>{
    window.exports.default.setup({
      add:(_,x)=>window.render=x.render,system:{copy:async t=>{window.copied=t}},ui:{Tooltip:props=>{const el=document.createElement("span");el.dataset.tooltip=props.value;el.append(props.children);return el;}}
    });
  });
  async function mount(fields) {
    const row=await store.create(sessionID,fields);
    await page.evaluate(({id,sessionID})=>{
      window.clean?.();
      window.placement=code=>window.render({code,session:{
        id:sessionID,key:sessionID,directory:"/",server:{client:{session:{prompt:async req=>{(window.rewrites??=[]).push(req);}},rpc:()=>({get:window.fetchDraft,change:window.changeDraft,rule:window.setRule,events:{on:(_,fn)=>{window.onRevision=fn;return ()=>{delete window.onRevision;};}}})}}
      }});
      document.querySelector("main").replaceChildren(window.placement(id));
    },row);
    return row;
  }
  const marks=new Set();
  for(const service of ["Matrix","Signal","Facebook Messenger","Telegram","WhatsApp","Twitter / X","Instagram","Slack","Microsoft Teams","Google Chat","iMessage","LINE","WeChat","Viber","Element","Mastodon","Bluesky"]){
    await mount({service,body:"original"});
    const path=page.locator("header svg path");
    assert.equal(await path.getAttribute("fill"),"currentColor",service);
    marks.add(await path.getAttribute("d"));
  }
  for(const [service,title] of [["Grokbot","Grok Bot"],["Claude Cowork","Claude Code"],["ChatGPT Dots","dots"],["Meta Muse","Muse"]]){
    await mount({service,body:"agent draft"});
    const path=page.locator("header svg path");
    assert.equal(await path.getAttribute("fill"),"currentColor",service);
    assert.equal(await page.locator("header").innerText(),title);
    const d=await path.getAttribute("d");
    marks.add(d);
    await page.getByRole("button",{name:"Discard"}).click();
    assert.equal(await page.locator(".receipt svg path").getAttribute("d"),d);
    assert.equal(await page.locator(".receipt-label").innerText(),title);
  }
  assert.equal(marks.size,21);
  for(const service of ["Discord","Mail"]){
    const row=await mount({service,body:"Original wording",to:"fixture",delivery:"recording.record"});
    await page.getByLabel("Message body").waitFor();
    const rewrite=page.getByRole("button",{name:"Rewrite",exact:true});
    await page.mouse.move(0,0);
    const actions=page.locator(".editor-actions");
    assert.equal(await actions.evaluate(el=>getComputedStyle(el).opacity),"0");
    await page.getByLabel("Message body").hover();
    assert.equal(await actions.evaluate(el=>getComputedStyle(el).opacity),"1");
    assert.equal(await rewrite.innerText(),"");
    assert.equal(await rewrite.locator("svg").count(),1);
    assert.equal(await rewrite.evaluate(el=>el.closest("[data-tooltip]")?.dataset.tooltip),"Rewrite");
    const body=service==="Mail"?"Unsent manual edit":"Original wording";
    if(service==="Mail")await page.getByLabel("Message body").fill(body);
    await rewrite.click();
    await page.getByRole("status").getByText("Rewrite requested.").waitFor();
    const req=await page.evaluate(()=>window.rewrites.at(-1));
    assert.equal(req.sessionID,sessionID);
    assert.ok(req.text.includes(row.id)&&req.text.includes(JSON.stringify(body))&&req.text.includes("edit_message_card"));
    assert.equal((await store.get(row)).body,body);
    assert.equal(notices.length,0);
  }
  const original=await mount({service:"Support chat",body:"original"});
  assert.equal(await page.locator("header").innerText(),"Support chat");
  assert.equal(await page.getByRole("button",{name:"Send",exact:true}).count(),0);
  await page.getByRole("textbox").waitFor();
  await store.revise({sessionID,id:original.id,append:" + correction"});
  await page.evaluate(row=>window.onRevision({data:row}),original);
  assert.equal(await page.getByRole("textbox").count(),0);
  await page.evaluate(id=>document.querySelector("main").append(window.placement(`${id} 1`)),original.id);
  assert.equal(await page.getByRole("textbox").inputValue(),"original + correction");
  await store.revise({sessionID,id:original.id,append:"!"});
  await page.evaluate(row=>window.onRevision({data:row}),original);
  // Reopen history with all three fences. Only the newest reply owns the editor.
  await page.evaluate(id=>document.querySelector("main").replaceChildren(...[id,`${id} 1`,`${id} 2`].map(window.placement)),original.id);
  await page.locator("main > :last-child textarea").waitFor();
  assert.equal(await page.getByRole("textbox").inputValue(),"original + correction!");
  assert.equal(await page.locator(".oc-outbox:visible").count(),1);
  await page.getByRole("textbox").fill("edited copy");
  await page.getByRole("button",{name:"Copy",exact:true}).click();
  await page.getByRole("button",{name:"Copied",exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.copied),"edited copy");
  await page.getByRole("button",{name:"Discard"}).click();
  await page.getByText("Support chat Discarded",{exact:true}).waitFor({timeout:2000});
  const discord=await mount({body:"original",from:"Sender (@sender) (123456789012345678)",to:"Fixture (@fixture) (223456789012345678)",service:"Discord",delivery:"recording.record"});
  assert.equal(await page.getByLabel("From",{exact:true}).inputValue(),"Sender (@sender)");
  assert.equal(await page.getByLabel("To",{exact:true}).inputValue(),"Fixture (@fixture)");
  await page.getByRole("textbox",{name:"Message body"}).fill("edited send");
  await page.getByRole("button",{name:"Send",exact:true}).click();
  await page.getByRole("button",{name:"Sending",exact:true}).waitFor();
  assert.equal(await page.getByRole("textbox",{name:"Message body"}).evaluate(el=>el.readOnly),true);
  assert.equal(await page.locator("header svg path").getAttribute("fill"),"currentColor");
  await store.report({...discord,outcome:"sent"});
  await page.evaluate(row=>window.onRevision({data:row}),discord);
  await page.getByText("Discord Sent · Fixture (@fixture)",{exact:true}).waitFor();
  assert.equal(await page.locator(".oc-outbox svg path").getAttribute("fill"),"currentColor");
  assert.equal(JSON.parse(notices[0].text.split("\n").at(-1)).to,discord.to);
  assert.equal(JSON.parse(notices[0].text.split("\n").at(-1)).body,"edited send");
  await mount({body:"Mail draft",service:"Mail",delivery:"test.send_mail"});
  const send=page.getByRole("button",{name:"Send",exact:true});
  await send.click();
  assert.equal(await page.getByLabel("To",{exact:true}).evaluate(el=>document.activeElement===el),true);
  assert.equal(notices.length,1);
  await page.getByRole("textbox",{name:"Subject",exact:true}).fill("Edited subject");
  await page.getByRole("textbox",{name:"From",exact:true}).fill("sender@example.test");
  await page.getByRole("textbox",{name:"To",exact:true}).fill("fixture@example.test");
  await page.getByRole("textbox",{name:"Cc",exact:true}).fill("cc@example.test");
  await page.getByRole("button",{name:"Send options"}).click();
  await page.getByRole("button",{name:/Allow recipient/}).click();
  await page.getByRole("button",{name:"Send options"}).click();
  assert.equal(await page.getByRole("button",{name:/Allow recipient/}).getAttribute("aria-pressed"),"true");
  await page.keyboard.press("Escape");
  await page.setViewportSize({width:320,height:600});
  for(const label of await page.locator(".oc-outbox .field span").all()){
    assert.ok(await label.evaluate(el=>{const r=new Range();r.selectNodeContents(el);return r.getClientRects().length===1;}),"field label should fit on one line");
  }
  assert.equal(notices.length,1);
  await send.click();
  await page.getByRole("button",{name:"Sending",exact:true}).waitFor();
  const envelope=JSON.parse(notices[1].text.split("\n").at(-1));
  assert.equal(envelope.subject,"Edited subject");
  assert.equal(envelope.to,"fixture@example.test");
  assert.equal(envelope.cc,"cc@example.test");
  console.log("Chromium: edited copy, discard receipt and edited send handoff passed.");
} finally {await browser.close();}
