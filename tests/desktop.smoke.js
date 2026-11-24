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
    window.require=name=>name==="solid-js"?{onCleanup:f=>window.clean=f}:{Plugin:{define:x=>x},CodeBlock:"code"};
  });
  await page.addScriptTag({content:await readFile(new URL("../src/gui.cjs",import.meta.url),"utf8")});
  await page.evaluate(()=>{
    window.exports.default.setup({
      add:(_,x)=>window.render=x.render,system:{copy:async t=>{window.copied=t}}
    });
  });
  async function mount(fields) {
    const row=await store.create(sessionID,fields);
    await page.evaluate(({id,sessionID})=>{
      window.clean?.();
      document.querySelector("main").replaceChildren(window.render({code:id,session:{
        id:sessionID,key:sessionID,directory:"/",server:{client:{rpc:()=>({get:window.fetchDraft,change:window.changeDraft,rule:window.setRule,events:{on:(_,fn)=>{window.onRevision=fn;return ()=>{delete window.onRevision;};}}})}}
      }}));
    },row);
    return row;
  }
  const original=await mount({body:"original"});
  await page.getByRole("textbox").waitFor();
  await store.revise({sessionID,id:original.id,append:" + correction"});
  await page.evaluate(row=>window.onRevision({data:row}),original);
  assert.equal(await page.getByRole("textbox").inputValue(),"original + correction");
  assert.equal(await page.locator(".oc-outbox").count(),1);
  await page.getByRole("textbox").fill("edited copy");
  await page.getByRole("button",{name:"Copy",exact:true}).click();
  await page.getByRole("button",{name:"Copied",exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.copied),"edited copy");
  await page.getByRole("button",{name:"Discard"}).click();
  await page.getByText("Message · Discarded").waitFor();
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
  await page.getByText("Discord · Sent · Fixture (@fixture)",{exact:true}).waitFor();
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
