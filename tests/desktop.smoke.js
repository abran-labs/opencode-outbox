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
        id:sessionID,key:sessionID,directory:"/",server:{client:{rpc:()=>({get:window.fetchDraft,change:window.changeDraft})}}
      }}));
    },row);
    return row;
  }
  await mount({body:"original"});
  await page.getByRole("textbox").fill("edited copy");
  await page.getByRole("button",{name:"Copy",exact:true}).click();
  await page.getByText("Copied",{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.copied),"edited copy");
  await page.getByRole("button",{name:"Discard"}).click();
  await page.getByText("Message · Discarded").waitFor();
  await mount({body:"original",to:"fixture",service:"Chat",delivery:"recording.record"});
  await page.getByRole("textbox").fill("edited send");
  await page.getByRole("button",{name:"Send",exact:true}).click();
  await page.getByText("Chat · Send requested · fixture").waitFor();
  assert.equal(JSON.parse(notices[0].text.split("\n").at(-1)).body,"edited send");
  console.log("Chromium: edited copy, discard receipt and edited send handoff passed.");
} finally {await browser.close();}
