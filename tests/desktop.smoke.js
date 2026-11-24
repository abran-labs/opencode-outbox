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
  await page.exposeFunction("uploadMedia",args=>store.upload(args));
  await page.exposeFunction("setRule",args=>store.rule(args));
  await page.setContent("<main></main>");
  await page.evaluate(()=>{
    window.exports={};
    window.require=name=>name==="solid-js"?{onCleanup:f=>window.clean=f,getOwner:()=>null,createSignal:v=>[()=>v,next=>{v=next;}]}:name==="solid-js/web"?{render:(fn,el)=>{el.append(...fn());return ()=>el.replaceChildren();}}:{Plugin:{define:x=>x},CodeBlock:"code"};
  });
  await page.addScriptTag({content:await readFile(new URL("../src/gui.cjs",import.meta.url),"utf8")});
  await page.evaluate(()=>{
    window.exports.default.setup({
      add:(_,x)=>window.render=x.render,links:{open:({href})=>{window.openedPath=href;return true;}},system:{copy:async t=>{window.copied=t}},ui:{Icon:({name})=>{const svg=document.createElementNS("http://www.w3.org/2000/svg","svg");svg.dataset.icon=name;return svg;},Markdown:({text})=>{const img=document.createElement("img");img.dataset.nativeMarkdown=text;return img;},Tooltip:props=>{const el=document.createElement("span");el.dataset.tooltip=props.value;el.append(props.children);return el;}}
    });
  });
  async function mount(fields) {
    const row=await store.create(sessionID,fields);
    await page.evaluate(({id,sessionID})=>{
      window.clean?.();
      window.placement=code=>window.render({code,session:{
        id:sessionID,key:sessionID,directory:"/",server:{client:{session:{generate:req=>new Promise((resolve,reject)=>{window.rewriteRequest=req;window.finishRewrite=text=>resolve({text});window.failRewrite=()=>reject(Error("Model unavailable"));})},rpc:()=>({get:window.fetchDraft,change:window.changeDraft,upload:window.uploadMedia,rule:window.setRule,events:{on:(_,fn)=>{window.onRevision=fn;return ()=>{delete window.onRevision;};}}})}}
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
    await page.getByRole("button",{name:"Rewriting"}).waitFor({timeout:2000});
    await page.mouse.move(0,0);
    assert.equal(await actions.evaluate(el=>getComputedStyle(el).opacity),"1");
    await page.waitForFunction(()=>!!window.finishRewrite);
    const req=await page.evaluate(()=>window.rewriteRequest);
    assert.equal(req.sessionID,sessionID);
    assert.ok(req.prompt.includes(JSON.stringify(body)));
    await page.evaluate(()=>{window.finishRewrite("Rewritten wording");delete window.finishRewrite;});
    await page.getByRole("button",{name:"Rewritten"}).waitFor();
    assert.equal(await page.getByRole("status",{includeHidden:true}).textContent(),"");
    assert.equal(await page.getByLabel("Message body").inputValue(),"Rewritten wording");
    const saved=await store.get(row);
    assert.equal(saved.body,"Rewritten wording");assert.equal(saved.position,row.position);
    assert.equal(notices.length,0);
  }
  const concurrent=await mount({body:"First",service:"Chat"});
  await page.getByLabel("Message body").hover();
  await page.getByRole("button",{name:"Rewrite",exact:true}).click();
  await page.waitForFunction(()=>!!window.finishRewrite);
  await store.change({...concurrent,action:"edit",body:"Newer edit in another window"});
  await page.evaluate(()=>window.finishRewrite("Stale rewrite"));
  await page.getByText(/Draft changed\. Reload/).waitFor();
  assert.equal((await store.get(concurrent)).body,"Newer edit in another window");
  assert.ok(await page.getByRole("button",{name:"Rewrite",exact:true}).isEnabled());
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
  const slackText="<@U012MAYA123>, check the invite. @Other is plain text.";
  await mount({service:"Slack",to:"#playtests",body:slackText,slack_mentions:[{id:"U012MAYA123",name:"Maya"}],delivery:"recording.record"});
  await page.getByLabel("Message body").waitFor({state:"attached"});
  assert.equal(await page.locator(".editor mark").allTextContents().then(xs=>xs.join(",")),"@Maya");
  await page.locator(".editor mark").click();
  await page.getByLabel("Message body").fill(slackText+" Thanks!");
  await page.getByLabel("Message body").blur();
  assert.equal(await page.locator(".editor mark").innerText(),"@Maya");
  await send.click();
  await page.getByRole("button",{name:"Sending",exact:true}).waitFor();
  assert.equal(JSON.parse(notices.at(-1).text.split("\n").at(-1)).body,slackText+" Thanks!");
  const mediaCard=await mount({service:"Mail",to:"demo@example.test",body:"Pictures",delivery:"fixture.send",media_limit:{source:"Fixture connector",max_files:2}});
  await page.addStyleTag({content:"main img{margin:1.5rem 0;height:auto;max-width:100%}"});
  const png=Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAACXBIWXMAAAABAAAAAQBPJcTWAAAAEklEQVR4nGP8//8/AwiwMEABADAYAwPK2LRgAAAAAElFTkSuQmCC","base64");
  const [chooser]=await Promise.all([page.waitForEvent("filechooser"),page.getByRole("button",{name:"Add attachments"}).click({position:{x:8,y:8}})]);
  await chooser.setFiles({name:"picked.png",mimeType:"image/png",buffer:png});
  await page.getByRole("button",{name:"Remove picked.png"}).waitFor();
  const staged=(await store.get(mediaCard)).attachments[0];
  assert.equal(await page.evaluate(async thumb=>{
    const img=new Image();img.src=thumb;await img.decode();const ctx=document.createElement("canvas").getContext("2d");ctx.drawImage(img,0,0);
    return ctx.getImageData(0,0,1,1).data[3];
  },staged.thumbnail),0);
  assert.equal(await page.locator(".media-photo").evaluate(el=>getComputedStyle(el).backgroundImage),"none");
  assert.match(await page.locator(".media-photo img").getAttribute("data-native-markdown"),/^!\[picked\.png\]\(<\/.+\/picked\.png>\)$/);
  assert.ok(await page.locator(".media-tile img").evaluate(el=>{
    const image=el.getBoundingClientRect(),tile=el.parentElement.getBoundingClientRect();
    return ["x","y","width","height"].every(k=>Math.abs(image[k]-tile[k])<1);
  }));
  const firstImage=await page.locator(".media-photo img").elementHandle();
  for(const [type,name] of [["drop","drop.png"],["paste","paste.png"]]){
    if(type==="drop")assert.deepEqual(await page.evaluate(()=>{
      const dt=new DataTransfer();dt.items.add(new File(["test"],"test.txt"));
      const card=document.querySelector(".oc-outbox"),inside=card.querySelector("textarea"),outside=document.body;
      const host=document.createElement("div");host.dataset.component="session-dropzone";
      const over=()=>{host.dataset.visible="true";outside.append(host);},leave=e=>{if(!e.relatedTarget)host.remove();};
      document.addEventListener("dragover",over);document.addEventListener("dragleave",leave);
      const drag=(target,type,relatedTarget=null)=>target.dispatchEvent(new DragEvent(type,{dataTransfer:dt,bubbles:true,cancelable:true,relatedTarget}));
      const state=()=>[host.isConnected,card.classList.contains("drop-target")];
      try{drag(outside,"dragover");const a=state();const overlay=card.querySelector(".draft-drop");
        getComputedStyle(overlay).opacity;drag(inside,"dragenter");drag(inside,"dragover");const b=[...state(),getComputedStyle(overlay).opacity];
        const rect=card.getBoundingClientRect();
        inside.dispatchEvent(new DragEvent("dragleave",{bubbles:true,clientX:rect.left+10,clientY:rect.top+10}));
        const childLeave=state();drag(inside,"dragleave",outside);drag(outside,"dragover");const c=state();drag(inside,"dragover");return [a,b,childLeave,c,state()];
      }finally{host.remove();document.removeEventListener("dragover",over);document.removeEventListener("dragleave",leave);}
    }),[[true,false],[false,true,"1"],[false,true],[true,false],[false,true]]);
    await page.evaluate(({type,name,bytes})=>{
      const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(bytes)],name,{type:"image/png"}));
      document.querySelector("textarea").dispatchEvent(type==="drop"?new DragEvent(type,{bubbles:true,cancelable:true,dataTransfer:dt}):new ClipboardEvent(type,{bubbles:true,cancelable:true,clipboardData:dt}));
    },{type,name,bytes:[...png]});
    await page.getByRole("button",{name:`Remove ${name}`}).waitFor();
    assert.ok(await firstImage.evaluate(img=>img.isConnected),"Adding a file must keep existing image previews mounted");
  }
  assert.equal(await page.locator(".bytes.over").count(),0);assert.ok(await send.isDisabled());
  const dropRemove=page.getByRole("button",{name:"Remove drop.png"});
  await page.mouse.move(0,0);
  assert.equal(await page.locator(".batch-warning").innerText(),"⚠ File count");
  await page.waitForFunction(()=>[...document.querySelectorAll(".media-tile button")].every(b=>getComputedStyle(b).opacity==="0"));
  await page.locator(".media-tile").filter({has:dropRemove}).hover();
  await page.waitForFunction(()=>getComputedStyle(document.querySelector('[aria-label="Remove drop.png"]')).opacity==="1");
  assert.equal(await page.getByRole("button",{name:"Remove picked.png"}).evaluate(b=>getComputedStyle(b).opacity),"0");
  await dropRemove.click();
  await page.waitForFunction(()=>document.querySelectorAll(".media-tile").length===2);
  const attachments=(await store.get(mediaCard)).attachments;
  await page.getByLabel("Message body").hover();
  assert.equal(await page.locator(".bytes").first().evaluate(el=>getComputedStyle(el).opacity),"0");
  await page.evaluate(()=>{delete window.finishRewrite;});
  await page.getByRole("button",{name:"Rewrite",exact:true}).click();await page.waitForFunction(()=>!!window.finishRewrite);
  await page.evaluate(()=>window.finishRewrite("Updated caption"));await page.getByRole("button",{name:"Rewritten",exact:true}).waitFor();
  assert.deepEqual((await store.get(mediaCard)).attachments,attachments);
  await page.getByLabel("Message body").fill("");await send.click();await page.getByRole("button",{name:"Sending",exact:true}).waitFor();
  const media=JSON.parse(notices.at(-1).text.split("\n").at(-1));assert.deepEqual(media.attachments.map(a=>a.name),["picked.png","paste.png"]);
  await store.report({sessionID,id:notices.at(-1).text.match(/Outbox card ([0-9a-f-]{36})/)[1],outcome:"sent"});
  const filesCard=await mount({body:"Mixed files",service:"Chat"});
  await page.locator("input[type=file]").setInputFiles([{name:"pages.pdf",mimeType:"application/pdf",buffer:Buffer.from("%PDF-1.4\n")},{name:"logo.svg",mimeType:"image/svg+xml",buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')}]);
  await page.getByRole("button",{name:"Remove logo.svg"}).waitFor();
  await page.getByRole("button",{name:"Open pages.pdf"}).click();
  const mixed=await store.get(filesCard);
  assert.equal(await page.evaluate(()=>window.openedPath),mixed.attachments[0].file_path);
  assert.match(await page.locator(".media-photo img").getAttribute("data-native-markdown"),/\/logo\.svg>\)$/);
  assert.deepEqual(mixed,JSON.parse(JSON.stringify(mixed)));
  await page.getByRole("button",{name:"Discard",exact:true}).click();
  console.log("Chromium: card editing, rewrite, Slack mentions, media picker/drop/paste/removal, cap warnings and media-only send handoff passed.");
} finally {await browser.close();}
