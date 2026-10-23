/* BOMB Portal: open HR using a short-lived, single-use handoff code. */
(function(){
'use strict';
const HR='https://bomb-hr.onrender.com';
let pending=null;
function report(message){
 if(typeof window.modal==='function')window.modal('HR 人力資源',message);
 else window.alert(message);
}
function stop(attempt,close){
 if(pending!==attempt)return;
 clearTimeout(attempt.timer);pending=null;
 if(close)try{attempt.popup.close();}catch{}
}
function currentFor(attempt){
 const p=Workspace.current(),s=window.PortalAPI?.snapshot();
 return !!p&&Workspace.usesServer()&&p.systems.includes('HR')
  &&p.serverAccountId===attempt.accountId&&s?.person.id===attempt.accountId
  &&s.sessionToken===attempt.token;
}
Workspace.openHR=function(){
 if(pending){try{pending.popup.focus();}catch{}return;}
 const p=Workspace.current(),api=window.PortalAPI,s=api?.snapshot();
 if(!p||!p.systems.includes('HR')){report('目前帳號沒有 HR 使用權限。');return;}
 if(!Workspace.usesServer()||!s||s.person.id!==p.serverAccountId){
  report('請使用正式 Portal 帳號登入後開啟 HR；示範帳號無法進入正式 HR 後台。');return;
 }
 if(typeof api.createHRHandoff!=='function'){
  report('HR 連線程式尚未更新，請按 Ctrl＋F5 重新整理後再試。');return;
 }
 const popup=window.open('about:blank','_blank','popup,width=1280,height=900');
 if(!popup){report('請允許本站開啟彈出式視窗，再點一次 HR。');return;}
 const attempt={popup,nonce:crypto.randomUUID(),accountId:s.person.id,token:s.sessionToken,sent:false,timer:null};
 pending=attempt;
 attempt.timer=setTimeout(()=>{
  if(pending!==attempt)return;
  stop(attempt,true);report('HR 連線逾時，請稍後重新開啟。');
 },120000);
 (async()=>{
  try{
   await Workspace.refresh();
   if(pending!==attempt)return;
   if(!currentFor(attempt))throw Error('Portal 登入或 HR 權限已變更，請重新登入。');
   if(popup.closed){stop(attempt,false);return;}
   popup.location.replace(HR+'/admin/portal-entry.html#'+attempt.nonce);
  }catch(error){
   if(pending===attempt){stop(attempt,true);report(error.message||'目前無法開啟 HR，請稍後重試。');}
  }
 })();
};
window.addEventListener('message',async event=>{
 const attempt=pending;
 if(!attempt||event.origin!==HR||event.source!==attempt.popup||event.data?.nonce!==attempt.nonce)return;
 if(event.data.type==='BOMB_HR_READY'&&!attempt.sent){
  attempt.sent=true;
  try{
   if(!currentFor(attempt))throw Error('Portal 登入或 HR 權限已變更，請重新登入。');
   const handoff=await PortalAPI.createHRHandoff(attempt.nonce);
   if(pending!==attempt)return;
   if(!currentFor(attempt))throw Error('Portal 登入已變更，請重新開啟 HR。');
   if(attempt.popup.closed){stop(attempt,false);return;}
   attempt.popup.postMessage({type:'BOMB_HR_HANDOFF',nonce:attempt.nonce,code:handoff.code},HR);
  }catch(error){
   if(pending===attempt){stop(attempt,true);report(error.message||'無法確認 HR 授權，請稍後重試。');}
  }
 }else if(event.data.type==='BOMB_HR_OPENED'&&attempt.sent){
  stop(attempt,false);
 }else if(event.data.type==='BOMB_HR_ERROR'){
  stop(attempt,true);report('HR 登入交接失敗，請從 Portal 重新開啟。');
 }
});
window.addEventListener('pagehide',()=>{if(pending)stop(pending,true);});
window.addEventListener('storage',()=>{if(pending&&!currentFor(pending))stop(pending,true);});
})();
