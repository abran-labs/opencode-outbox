// A standalone, hand-authored GUI entry: Git installs need no build or install scripts.
const {Plugin, CodeBlock} = require("@opencode/plugin/gui");
const {onCleanup} = require("solid-js");
const contract = {id:"outbox", methods:{get:{},change:{}}, events:{}};
const sheets = `
.oc-outbox{border:1px solid var(--border-weak-base,#8885);border-radius:14px;padding:16px;background:var(--surface-base,#242424);color:var(--text-base,inherit);font:inherit;display:grid;gap:10px;min-width:0}
.oc-outbox header,.oc-outbox footer{display:flex;align-items:center;gap:8px}.oc-outbox header{font-size:12px;opacity:.8}.oc-outbox strong{font-size:16px}.oc-outbox .field{border-bottom:1px solid #8883;padding-bottom:5px;overflow-wrap:anywhere}
.oc-outbox textarea{box-sizing:border-box;width:100%;min-height:100px;resize:vertical;field-sizing:content;background:transparent;color:inherit;border:1px solid transparent;border-radius:6px;padding:6px;font:inherit;line-height:1.55}.oc-outbox textarea:focus{outline:1px solid currentColor}
.oc-outbox footer{justify-content:flex-end}.oc-outbox button{cursor:pointer;padding:5px 12px;border-radius:16px}.oc-outbox button:disabled{opacity:.5;cursor:default}.oc-outbox .primary{background:var(--text-strong,#eee);color:var(--background-base,#222)}
.oc-outbox small{opacity:.8}.oc-outbox .spin{display:inline-block;width:12px;height:12px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:outbox-rotate .8s linear infinite}@keyframes outbox-rotate{to{transform:rotate(360deg)}}
[data-component="markdown-code"][data-language="outbox"]:has(.oc-outbox) > [data-slot="markdown-code-toolbar"] [data-slot="markdown-copy-button"]{display:none}
.oc-outbox{--wash:color-mix(in srgb,currentColor 8%,transparent);gap:5px;border-radius:20px;padding:16px}
.oc-outbox header{margin-bottom:6px}.oc-outbox .field{display:flex;align-items:center;gap:8px;font-size:14px;padding:4px 0}.oc-outbox .field span{opacity:.65}
.oc-outbox input{background:transparent;color:inherit;min-width:0;width:100%;border:0;border-radius:6px;padding:5px;font:inherit}
.oc-outbox input.subject{font-weight:600}.oc-outbox .editor{position:relative;border-radius:8px;margin:7px 0}
.oc-outbox .editor:hover,.oc-outbox .editor:focus-within,.oc-outbox input:hover,.oc-outbox input:focus{background:var(--wash)}
.oc-outbox input:focus,.oc-outbox textarea:focus{outline:none}.oc-outbox textarea{resize:none;display:block;border:0;padding:9px 40px 9px 8px;line-height:1.55;min-height:5.5em;max-height:60vh}
.oc-outbox .body-copy{position:absolute;right:5px;top:5px;padding:4px 6px;border-radius:5px;opacity:0}
.oc-outbox .editor:hover .body-copy,.oc-outbox .editor:focus-within .body-copy,.oc-outbox .body-copy.copied{opacity:1}
.oc-outbox .body-copy.copied:before{content:"Copied";position:absolute;right:0;bottom:100%;background:var(--surface-base,#242424);padding:3px 6px;border-radius:4px;font-size:12px;box-shadow:0 2px 6px #0004}
.oc-outbox footer{position:relative}.oc-outbox .split{display:inline-flex;border-radius:24px;background:var(--text-strong,#eee);color:var(--background-base,#222);overflow:hidden}
.oc-outbox .split button{background:transparent;color:inherit;border-radius:0}.oc-outbox button:hover:not(:disabled){background:var(--wash)}
.oc-outbox .menu{position:absolute;bottom:calc(100% + 5px);right:0;z-index:3;background:var(--surface-base,#242424);border:1px solid #8885;border-radius:10px;padding:4px;box-shadow:0 4px 16px #0003}
.oc-outbox .menu button{display:block;width:100%;text-align:left}.oc-outbox small:empty{display:none}`;

const node = (tag,text,cls) => {
  const el=document.createElement(tag);
  if(text!==undefined)el.textContent=text;
  if(cls)el.className=cls;
  return el;
};

function renderCard(ctx, session, id) {
  const ref={id,sessionID:session.id}, opt={location:{directory:session.directory}};
  const rpc=()=>session.server.client.rpc(contract);
  const root=node("section",undefined,"oc-outbox");
  const channel=`outbox:${session.key}:${id}`;
  let card, timer, feedback, input, fields={}, busy=false, closed=false, dirty=false, tail=Promise.resolve();
  const snapshot=()=>Object.fromEntries(Object.entries(fields).map(([k,el])=>[k,el.value]));
  const status=node("small"); status.setAttribute("role","status");
  const error=e=>{if(!closed)status.textContent=e?.message||"Request failed. Reopen the card to reload.";};
  function commit(action,values) {
    const task=tail.then(async()=>{
      if(!card || card.state!=="draft")throw Error("This draft is closed.");
      if(action==="edit" && Object.entries(values).every(([k,v])=>v===(card[k]??"")))return;
      const next=await rpc().change({...ref,revision:card.revision,action,...values},opt);
      card=next;
      dirty=Object.entries(snapshot()).some(([k,v])=>v!==(next[k]??""));
      window.dispatchEvent(new CustomEvent(channel,{detail:next}));
    });
    tail=task.catch(error);
    return task;
  }
  function draw(){
    if(closed)return;
    root.replaceChildren(node("style",sheets));
    if(!card){root.append(status);return;}
    const title=card.service||"Message";
    if(card.state!=="draft"){
      const outcome={discarded:"Discarded",requested:"Send requested",unconfirmed:"Send request unconfirmed"};
      root.append(node("small",[title,outcome[card.state],card.to].filter(Boolean).join(" · ")));
      return;
    }
    root.append(node("header",`✉  ${title}`));
    const mail=/^(?:e-?mail|gmail|mail)$/i.test(title),send=!!card.delivery;
    fields={};
    function field(k,label,placeholder){
      const el=node("input");fields[k]=el;el.value=card[k]||"";el.maxLength=1024;el.placeholder=placeholder;el.setAttribute("aria-label",label);
      el.oninput=edited;
      if(k==="subject"){el.className="subject";root.append(el);return;}
      const line=node("label",undefined,"field");line.append(node("span",label),el);root.append(line);
    }
    if(mail||card.subject)field("subject","Subject","Subject");
    for(const [k,label,hint] of [["from","From","Default account"],["to","To",mail?"name@example.com":"Recipient"],["cc","Cc","name@example.com"],["bcc","Bcc","name@example.com"]])
      if(card[k]||(mail&&k!=="bcc")||(send&&k==="to"))field(k,label,hint);
    input=node("textarea");input.setAttribute("aria-label","Message body");input.maxLength=100000;input.value=card.body;
    fields.body=input;input.oninput=edited;
    const editor=node("div",undefined,"editor"),copy=node("button","⧉","body-copy"),footer=node("footer"), discard=node("button","Discard");
    copy.setAttribute("aria-label","Copy message");copy.title="Copy message";
    const split=node("div",undefined,"split"),primary=node("button",send?"Send":"Copy"),arrow=node("button","⌄"),menu=node("div",undefined,"menu");
    arrow.setAttribute("aria-label","Send options");arrow.setAttribute("aria-expanded","false");menu.hidden=true;
    const enabled=()=>{primary.disabled=busy||!input.value.trim()||(send&&!fields.to?.value.trim());primary.title=send&&!fields.to?.value.trim()?"Enter a recipient to send":"";};
    function edited(){
      dirty=true;status.textContent="";enabled();clearTimeout(timer);
      timer=setTimeout(()=>commit("edit",snapshot()).catch(()=>{}),200);
    }
    function closeMenu(){menu.hidden=true;arrow.setAttribute("aria-expanded","false");}
    arrow.onclick=()=>{menu.hidden=!menu.hidden;arrow.setAttribute("aria-expanded",String(!menu.hidden));if(!menu.hidden)menu.firstChild.focus();};
    footer.onkeydown=e=>{if(e.key==="Escape"&&!menu.hidden){closeMenu();arrow.focus();}};
    footer.onfocusout=e=>{if(!footer.contains(e.relatedTarget))closeMenu();};
    const copyInstead=node("button","Copy message instead");copyInstead.onclick=()=>{closeMenu();copy.focus();act("copy");};menu.append(copyInstead);
    async function act(action){
      if(busy)return;
      busy=true;clearTimeout(timer);for(const el of [...Object.values(fields),discard,primary,arrow,copy])el.disabled=true;
      const values=snapshot();
      if(action==="send"){primary.replaceChildren(node("span",undefined,"spin"));primary.setAttribute("aria-label","Requesting send");}
      try{
        if(action==="copy"){
          await ctx.system.copy(values.body);copy.textContent="✓";copy.classList.add("copied");copy.setAttribute("aria-label","Copied");copy.title="Copied";
          clearTimeout(feedback);feedback=setTimeout(()=>{copy.textContent="⧉";copy.classList.remove("copied");copy.setAttribute("aria-label","Copy message");copy.title="Copy message";},1600);
          await commit("edit",values);
        } else {await commit(action,values);draw();}
      }catch(e){error(e);}
      finally{busy=false;for(const el of [...Object.values(fields),discard,arrow,copy])el.disabled=false;enabled();primary.textContent=send?"Send":"Copy";primary.removeAttribute("aria-label");}
    }
    enabled();primary.onclick=()=>act(send?"send":"copy");discard.onclick=()=>act("discard");copy.onclick=()=>act("copy");
    editor.append(input,copy);split.append(primary);if(send)split.append(arrow);footer.append(discard,split,menu);root.append(editor,status,footer);
  }
  function update(e){
    const next=e.detail;
    if(!card || next.revision<=card.revision)return;
    if(dirty && next.state==="draft"){status.textContent="Draft changed elsewhere. Copy unsaved edits before reopening.";return;}
    card=next;draw();
  }
  window.addEventListener(channel,update);
  onCleanup(()=>{
    closed=true;clearTimeout(timer);clearTimeout(feedback);window.removeEventListener(channel,update);
    if(dirty && !busy && card?.state==="draft")commit("edit",snapshot()).catch(()=>{});
  });
  status.textContent="Loading draft…"; draw();
  rpc().get(ref,opt).then(row=>{card=row;status.textContent="";draw();}).catch(error);
  return root;
}
exports.default=Plugin.define({setup(ctx){
  ctx.add(CodeBlock,{languages:["outbox"],render:props=>{
    const id=props.code.trim();
    if(props.session && /^[0-9a-f-]{36}$/.test(id))return renderCard(ctx,props.session,id);
  }});
}});
