// A standalone, hand-authored GUI entry: Git installs need no build or install scripts.
const {Plugin, CodeBlock} = require("@opencode/plugin/gui");
const {onCleanup} = require("solid-js");
const contract = {id:"outbox", methods:{get:{},change:{},rule:{}}, events:{revised:{}}};
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
.oc-outbox .menu button{display:block;width:100%;text-align:left}.oc-outbox small:empty{display:none}
.oc-outbox{color:var(--text-strong,#fafafa)}.oc-outbox header{font-weight:600;color:inherit;opacity:1;font-size:14px;gap:9px}
.oc-outbox .glyph{display:inline-grid;place-items:center;width:24px;height:24px;border-radius:7px;background:var(--wash)}
.oc-outbox .field{display:grid;grid-template-columns:max-content minmax(0,1fr);overflow-wrap:normal}
.oc-outbox .field span{white-space:nowrap;word-break:normal;opacity:.64}.oc-outbox input,.oc-outbox textarea{color:inherit}.oc-outbox input::placeholder{color:currentColor;opacity:.45}
.oc-outbox .body-copy{width:30px;height:30px;display:grid;place-items:center;padding:0}
.oc-outbox svg{width:18px;height:18px;display:block;flex:none}
.oc-outbox .menu{width:min(252px,100%);z-index:4;padding:6px}.oc-outbox .menu button{display:grid;grid-template-columns:1fr auto;gap:2px 8px;padding:7px 10px;border-radius:6px;font-size:14px;line-height:1.35}
.oc-outbox .menu button small{grid-column:1/-1;font-size:12px;opacity:.65}`;

const node = (tag,text,cls) => {
  const el=document.createElement(tag);
  if(text!==undefined)el.textContent=text;
  if(cls)el.className=cls;
  return el;
};
function icon(name){
  const ns="http://www.w3.org/2000/svg",svg=document.createElementNS(ns,"svg");
  svg.setAttribute("viewBox","0 0 24 24");svg.setAttribute("aria-hidden","true");
  const p=document.createElementNS(ns,"path");
  if(name==="discord"){
    // Discord mark, via Simple Icons. Match the card text in both themes.
    p.setAttribute("fill","currentColor");
    p.setAttribute("d","M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z");
    svg.append(p);return svg;
  }
  p.setAttribute("d",{mail:"M3 5h18v14H3z M3 6l9 7 9-7",copy:"M9 8h11v13H9z M15 8V3H4v13h5",check:"m4 12 5 5L20 6",arrow:"m7 10 5 5 5-5"}[name]);
  for(const [k,v] of Object.entries({fill:"none",stroke:"currentColor","stroke-width":"1.7","stroke-linecap":"round","stroke-linejoin":"round"}))p.setAttribute(k,v);
  svg.append(p);return svg;
}

function renderCard(ctx, session, id) {
  const ref={id,sessionID:session.id}, opt={location:{directory:session.directory}};
  const rpc=()=>session.server.client.rpc(contract);
  const root=node("section",undefined,"oc-outbox");
  const channel=`outbox:${session.key}:${id}`;
  let card, timer, feedback, input, fields={}, busy=false, closed=false, dirty=false, tail=Promise.resolve();
  const display=(k,value)=>{
    if(!/^discord\b/i.test(card?.service||"")||!["from","to"].includes(k))return value;
    return value.replace(/\s*\((?:(?:DM(?: channel)?|channel|user)(?: ID)?\s*[:#]?\s*)?\d{17,20}\)\s*$/i,"").replace(/^\d{17,20}$/,"");
  };
  const snapshot=()=>Object.fromEntries(Object.entries(fields).map(([k,el])=>{
    const raw=card[k]??"";
    return [k,el.value===display(k,raw)?raw:el.value];
  }));
  const status=node("small"); status.setAttribute("role","status");
  const error=e=>{if(!closed)status.textContent=e?.message||"Request failed. Reopen the card to reload.";};
  function commit(action,values) {
    const task=tail.then(async()=>{
      if(!card || card.state!=="draft")throw Error("This draft is closed.");
      if(action==="edit" && Object.entries(values).every(([k,v])=>v===(card[k]??"")))return;
      const next=await rpc().change({...ref,revision:card.revision,action,...values},opt);
      if(card.revision>next.revision)return;
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
    if(!["draft","sending"].includes(card.state)){
      const outcome={discarded:"Discarded",sent:"Sent",requested:"Delivery not confirmed",unconfirmed:"Delivery not confirmed",uncertain:"Delivery not confirmed",failed:"Not sent"};
      root.append(node("small",[title,outcome[card.state],display("to",card.to||"")].filter(Boolean).join(" · ")));
      if(card.detail&&["failed","uncertain"].includes(card.state))root.append(node("small",card.detail));
      return;
    }
    const header=node("header"),glyph=node("span",undefined,"glyph");glyph.append(icon(/^discord\b/i.test(title.trim())?"discord":"mail"));header.append(glyph,node("span",title));root.append(header);
    const mail=/^(?:e-?mail|gmail|mail)$/i.test(title),send=!!card.delivery;
    fields={};
    function field(k,label,placeholder){
      const el=node("input");fields[k]=el;el.value=display(k,card[k]||"");el.maxLength=1024;el.placeholder=placeholder;el.setAttribute("aria-label",label);
      el.oninput=edited;
      el.spellcheck=k==="subject";
      if(k==="subject"){el.className="subject";root.append(el);return;}
      const line=node("label",undefined,"field");line.append(node("span",label),el);root.append(line);
    }
    if(mail||card.subject)field("subject","Subject","Subject");
    for(const [k,label,hint] of [["from","From","Default account"],["to","To",mail?"name@example.com":"Recipient"],["cc","Cc","name@example.com"],["bcc","Bcc","name@example.com"]])
      if(card[k]||(mail&&k!=="bcc")||(send&&k==="to"))field(k,label,hint);
    input=node("textarea");input.setAttribute("aria-label","Message body");input.maxLength=100000;input.value=card.body;
    fields.body=input;input.oninput=edited;input.spellcheck=true;
    const editor=node("div",undefined,"editor"),copy=node("button",undefined,"body-copy"),footer=node("footer"), discard=node("button","Discard");
    copy.append(icon("copy"));
    copy.setAttribute("aria-label","Copy message");copy.title="Copy message";
    const split=node("div",undefined,"split"),primary=node("button",send?"Send":"Copy"),arrow=node("button"),menu=node("div",undefined,"menu");
    arrow.append(icon("arrow"));
    arrow.setAttribute("aria-label","Send options");arrow.setAttribute("aria-expanded","false");menu.hidden=true;
    const enabled=()=>{primary.disabled=busy||!input.value.trim();primary.title=send&&!fields.to?.value.trim()?"Enter a recipient to send":"";};
    function edited(){
      dirty=true;status.textContent="";enabled();clearTimeout(timer);
      timer=setTimeout(()=>commit("edit",snapshot()).catch(()=>{}),200);
    }
    function closeMenu(){menu.hidden=true;arrow.setAttribute("aria-expanded","false");}
    arrow.onclick=async()=>{
      if(!menu.hidden){closeMenu();return;}
      if(busy)return;
      const before=snapshot();
      try{
        clearTimeout(timer);await commit("edit",before);
        const now=snapshot();
        if(closed||card.state!=="draft"||Object.entries(before).some(([k,v])=>now[k]!==v))return;
        menu.hidden=false;arrow.setAttribute("aria-expanded","true");menuItems();
        menu.querySelector("button:not(:disabled)")?.focus();
      }catch(e){error(e);}
    };
    footer.onkeydown=e=>{if(e.key==="Escape"&&!menu.hidden){closeMenu();arrow.focus();}};
    footer.onfocusout=e=>{if(!footer.contains(e.relatedTarget))closeMenu();};
    function menuItems(){
      menu.replaceChildren();
      for(const [mode,label,hint] of [["recipient","Allow recipient","Skip review for this recipient"],["approval","Needs approval","Review before sending"],["global","Disable drafts","Skip review for send requests across all agents"]]){
        const btn=node("button"),checked=mode===(card.mode||"approval");
        if(mode==="recipient"&&(!fields.to?.value.trim()||!(fields.from?.value||card.from||"").trim())){
          btn.disabled=true;btn.title="Enter From and To to save a recipient rule.";
        }
        btn.append(node("span",label),node("span",checked?"✓":""),node("small",btn.disabled?btn.title:hint));
        btn.setAttribute("aria-pressed",String(checked));
        btn.onclick=async()=>{
          if(busy)return;
          busy=true;closeMenu();clearTimeout(timer);
          const controls=[...Object.values(fields),primary,arrow,copy,discard];
          controls.forEach(el=>el.disabled=true);
          try{await commit("edit",snapshot());card=await rpc().rule({...ref,mode});}
          catch(e){error(e);}
          finally{busy=false;controls.forEach(el=>el.disabled=false);enabled();arrow.focus();}
        };menu.append(btn);
      }
    }
    async function act(action){
      if(busy)return;
      if(action==="send"&&!fields.to?.value.trim()){
        status.textContent="Enter a recipient in To, then click Send.";fields.to?.focus();return;
      }
      busy=true;clearTimeout(timer);for(const el of [...Object.values(fields),discard,primary,arrow,copy])el.disabled=true;
      const values=snapshot();
      if(action==="send"){primary.replaceChildren(node("span",undefined,"spin"));primary.setAttribute("aria-label","Requesting send");}
      try{
        if(action==="copy"){
          await ctx.system.copy(values.body);copy.replaceChildren(icon("check"));copy.classList.add("copied");copy.setAttribute("aria-label","Copied");copy.title="Copied";
          clearTimeout(feedback);feedback=setTimeout(()=>{copy.replaceChildren(icon("copy"));copy.classList.remove("copied");copy.setAttribute("aria-label","Copy message");copy.title="Copy message";},1600);
          await commit("edit",values);
        } else {await commit(action,values);draw();}
      }catch(e){error(e);}
      finally{busy=false;for(const el of [...Object.values(fields),discard,arrow,copy])el.disabled=false;enabled();primary.textContent=send?"Send":"Copy";primary.removeAttribute("aria-label");}
    }
    enabled();primary.onclick=()=>act(send?"send":"copy");discard.onclick=()=>act("discard");copy.onclick=()=>act("copy");
    editor.append(input,copy);split.append(primary);if(send)split.append(arrow);footer.append(discard,split,menu);root.append(editor,status,footer);
    if(card.state==="sending"){
      for(const el of Object.values(fields))el.readOnly=true;
      copy.hidden=true;discard.hidden=true;arrow.hidden=true;
      primary.disabled=true;primary.setAttribute("aria-label","Sending");
      primary.replaceChildren(node("span",undefined,"spin"),document.createTextNode(" Sending…"));
      root.setAttribute("aria-busy","true");
    }else root.removeAttribute("aria-busy");
  }
  function update(e){
    const next=e.detail;
    if(!card || next.revision<=card.revision)return;
    if(dirty && next.state==="draft"){status.textContent="Draft changed elsewhere. Copy unsaved edits before reopening.";return;}
    card=next;draw();
  }
  window.addEventListener(channel,update);
  const refresh=()=>rpc().get(ref,opt).then(row=>{
    if(closed)return;
    if(!card){card=row;status.textContent="";draw();}
    else update({detail:row});
  }).catch(error);
  const stop=rpc().events.on("revised",evt=>{
    if(evt.data.id===id&&evt.data.sessionID===session.id)return refresh();
  });
  window.addEventListener("focus",refresh);
  onCleanup(()=>{
    closed=true;stop();clearTimeout(timer);clearTimeout(feedback);window.removeEventListener(channel,update);window.removeEventListener("focus",refresh);
    if(dirty && !busy && card?.state==="draft")commit("edit",snapshot()).catch(()=>{});
  });
  status.textContent="Loading draft…"; draw();
  refresh();
  return root;
}
exports.default=Plugin.define({setup(ctx){
  ctx.add(CodeBlock,{languages:["outbox"],render:props=>{
    const id=props.code.trim();
    if(props.session && /^[0-9a-f-]{36}$/.test(id))return renderCard(ctx,props.session,id);
  }});
}});
