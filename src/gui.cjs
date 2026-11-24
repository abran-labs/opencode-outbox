// A standalone, hand-authored GUI entry: Git installs need no build or install scripts.
const {Plugin, CodeBlock} = require("@opencode/plugin/gui");
const {onCleanup} = require("solid-js");
const contract = {id:"outbox", methods:{get:{},change:{}}, events:{}};
const sheets = `
.oc-outbox{border:1px solid var(--border-weak-base,#8885);border-radius:14px;padding:16px;background:var(--surface-base,#242424);color:var(--text-base,inherit);font:inherit;display:grid;gap:10px;min-width:0}
.oc-outbox header,.oc-outbox footer{display:flex;align-items:center;gap:8px}.oc-outbox header{font-size:12px;opacity:.8}.oc-outbox strong{font-size:16px}.oc-outbox .field{border-bottom:1px solid #8883;padding-bottom:5px;overflow-wrap:anywhere}
.oc-outbox textarea{box-sizing:border-box;width:100%;min-height:100px;resize:vertical;field-sizing:content;background:transparent;color:inherit;border:1px solid transparent;border-radius:6px;padding:6px;font:inherit;line-height:1.55}.oc-outbox textarea:focus{outline:1px solid currentColor}
.oc-outbox footer{justify-content:flex-end}.oc-outbox button{cursor:pointer;padding:5px 12px;border-radius:16px}.oc-outbox button:disabled{opacity:.5;cursor:default}.oc-outbox .primary{background:var(--text-strong,#eee);color:var(--background-base,#222)}
.oc-outbox small{opacity:.8}.oc-outbox .spin{display:inline-block;width:12px;height:12px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:outbox-rotate .8s linear infinite}@keyframes outbox-rotate{to{transform:rotate(360deg)}}`;

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
  let card, timer, input, busy=false, closed=false, dirty=false, tail=Promise.resolve();
  const status=node("small"); status.setAttribute("role","status");
  const error=e=>{if(!closed)status.textContent=e?.message||"Request failed. Reopen the card to reload.";};
  function commit(action,body) {
    const task=tail.then(async()=>{
      if(!card || card.state!=="draft")throw Error("This draft is closed.");
      if(action==="edit" && body===card.body)return;
      const next=await rpc().change({...ref,revision:card.revision,action,body},opt);
      card=next;
      dirty=input?.value!==next.body;
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
    root.append(node("header",`✉  ${title} · Draft`));
    if(card.subject)root.append(node("strong",card.subject));
    for(const [field,label] of [["from","From"],["to","To"],["cc","Cc"],["bcc","Bcc"]])
      if(card[field])root.append(node("div",`${label}   ${card[field]}`,"field"));
    input=node("textarea");input.setAttribute("aria-label","Message body");input.maxLength=100000;input.value=card.body;
    const footer=node("footer"), discard=node("button","Discard"), send=!!(card.delivery && card.to);
    const primary=node("button",send?"Send":"Copy","primary");
    input.oninput=()=>{
      dirty=true;status.textContent="";primary.disabled=!input.value.trim();clearTimeout(timer);
      timer=setTimeout(()=>commit("edit",input.value).catch(()=>{}),200);
    };
    async function act(action){
      if(busy)return;
      busy=true;clearTimeout(timer);input.disabled=discard.disabled=primary.disabled=true;
      const value=input.value;
      if(action==="send"){primary.replaceChildren(node("span",undefined,"spin"));primary.setAttribute("aria-label","Requesting send");}
      try{
        if(action==="copy"){await ctx.system.copy(value);await commit("edit",value);status.textContent="Copied";}
        else {await commit(action,value);draw();}
      }catch(e){error(e);}
      finally{busy=false;input.disabled=discard.disabled=false;primary.disabled=!value.trim();primary.textContent=send?"Send":"Copy";primary.removeAttribute("aria-label");}
    }
    primary.disabled=!input.value.trim();primary.onclick=()=>act(send?"send":"copy");discard.onclick=()=>act("discard");
    footer.append(discard,primary);root.append(input,status,footer);
  }
  function update(e){
    const next=e.detail;
    if(!card || next.revision<=card.revision)return;
    if(dirty && next.state==="draft"){status.textContent="Draft changed elsewhere. Copy unsaved edits before reopening.";return;}
    card=next;draw();
  }
  window.addEventListener(channel,update);
  onCleanup(()=>{
    closed=true;clearTimeout(timer);window.removeEventListener(channel,update);
    if(dirty && !busy && card?.state==="draft")commit("edit",input.value).catch(()=>{});
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
