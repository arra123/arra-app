import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeConversations } from '../src/ara/conversations-merge.js';
const chat=(id,text='a',updatedAt=10)=>({id,title:id,updatedAt,messages:[{id:id+':m',role:'assistant',text,at:10,updatedAt}]});
test('PC, laptop and phone histories merge without replacing absent conversations',()=>{
 const data=mergeConversations({chats:[chat('pc'),chat('shared')]},{chats:[chat('laptop'),chat('shared','longer',11)]});
 const result=mergeConversations(data,{chats:[chat('phone')]});
 assert.equal(result.chats.length,4);assert.equal(result.chats.find(c=>c.id==='shared').messages[0].text,'longer');
});
test('stale replicas cannot truncate a newer streamed answer',()=>{
 const current={chats:[chat('a','complete answer',30)]};
 const merged=mergeConversations(current,{chats:[chat('a','comp',20)]});
 assert.equal(merged.chats[0].messages[0].text,'complete answer');
 assert.equal(mergeConversations(current,current).chats[0].messages.length,1);
});
test('explicit chat and message deletions do not resurrect on reconnect',()=>{
 const original={chats:[chat('a'),chat('b')]};
 const removed=mergeConversations(original,{chats:[{...chat('b'),messages:[],deletedMessages:{'b:m':40}}],deleted:{a:40}});
 const result=mergeConversations(removed,original);
 assert.deepEqual(result.chats.map(c=>c.id),['b']);assert.equal(result.chats[0].messages.length,0);
});
test('legacy desktop message IDs are stable while an answer grows',()=>{
 const legacy={id:'c123',updated:10,messages:[{role:'user',text:'question'},{role:'assistant',text:'start'}]};
 const next={...legacy,updated:20,messages:[legacy.messages[0],{role:'assistant',text:'start and finish'}]};
 const merged=mergeConversations({chats:[legacy]},{chats:[next]});
 assert.equal(merged.chats[0].messages.length,2);assert.equal(merged.chats[0].messages[1].text,'start and finish');
});
