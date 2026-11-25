import test from "node:test";
import assert from "node:assert/strict";
import plugin from "../src/server.js";

test("only root sessions see card instructions or execute card tools",async()=>{
  const tools={},rows=new Map();let context;
  await plugin.setup({
    storage:{get:k=>rows.get(k),set:(k,v)=>rows.set(k,v)},
    rpc:{register:async()=>({})},
    tool:{transform:async fn=>fn({add:t=>tools[t.name]=t}),list:async()=>[]},
    session:{get:async({sessionID:id})=>id==="ses_root"?{id}:{id,parentID:"ses_root"},hook:async(_,fn)=>context=fn}
  });
  const child={sessionID:"ses_child",tools:{...tools,other:{}},system:[]};
  await context(child);
  assert.deepEqual(Object.keys(child.tools),["other"]);assert.deepEqual(child.system,[]);
  for(const tool of Object.values(tools))
    await assert.rejects(tool.execute({body:"test"},{sessionID:"ses_child",agent:"build",codemode:true}),/primary session/);
  assert.equal(rows.size,0);
  const root={sessionID:"ses_root",tools:{...tools},system:[]};await context(root);
  assert.ok(root.tools.create_message_card&&root.system.length);
  assert.match((await tools.create_message_card.execute({body:"test"},{sessionID:"ses_root",agent:"build"})).content,/```outbox/);
});
