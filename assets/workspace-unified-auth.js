/* HR management sign-in uses the existing HR API. Other modules retain prototype permissions. */
(function(){
'use strict';
const HR='https://bomb-hr.onrender.com',KEY='bomb-portal-hr-session-v1';
const norm=v=>String(v||'').trim().toUpperCase();
const originalLogin=Workspace.login.bind(Workspace),originalLogout=Workspace.logout.bind(Workspace);
let pending=null,loginBusy=false;
function target(company,method,account,code){const rows=Workspace.all().filter(p=>norm(p.company)===norm(company)&&p.state==='active'&&(!p.employment||p.employment==='employed')).filter(p=>method==='MANUAL'?norm(p.account)===norm(account):!!code&&p[method==='QR'?'qr':'nfc']===String(code).trim());return rows.length===1?rows[0]:null;}
function realHR(p){return !!p&&p.systems.includes('HR')&&!norm(p.employee||p.account).startsWith('DEMO-');}
function companyCode(p){return norm(p.hrCompanyCode)||(norm(p.company)==='BOMB'?'ABOMB':norm(p.company));}
function stored(){try{return JSON.parse(sessionStorage.getItem(KEY)||'null');}catch{return null;}}
function matches(p,s){return !!p&&!!s&&s.personId===p.id&&s.employeeNo===norm(p.employee||p.account)&&s.companyCode===companyCode(p)&&typeof s.sessionToken==='string'&&s.sessionToken.length>10&&Date.parse(s.expiresAt)>Date.now();}
async function api(path,options={}){const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);try{const r=await fetch(HR+'/api/v1/admin-auth/'+path,{...options,credentials:'omit',cache:'no-store',signal:controller.signal});let b;try{b=await r.json();}catch{throw Error('HR 回應異常，請稍後重新登入。');}if(!r.ok||!b.success){const e=Error(b.message||'HR 身分驗證失敗，請重新登入。');e.status=r.status;throw e;}return b.data;}catch(e){if(e.name==='AbortError')throw Error('HR 連線逾時，請稍後重新登入。');if(e instanceof TypeError)throw Error('目前無法連接 HR，請確認網路後再試。');throw e;}finally{clearTimeout(timer);}}
async function revoke(s){if(s?.sessionToken)await api('logout',{method:'POST',headers:{Authorization:'Bearer '+s.sessionToken},keepalive:true});}
function clear(){sessionStorage.removeItem(KEY);}
Workspace.login=async function(input){if(loginBusy)throw Error('正在登入，請稍候。');loginBusy=true;let issued=null;try{
 const p=target(input.company,input.method,input.account,input.code);
 if(!realHR(p)){const previous=stored();const result=originalLogin(input);clear();if(previous)revoke(previous).catch(()=>{});return result;}
 if(!(p.methods||[]).includes(input.method))throw Error('此人員尚未開放這種登入方式。');
 if(input.method!=='MANUAL')throw Error('HR 管理帳號請選「帳號密碼」，使用原 HR 管理密碼登入。');
 const data=await api('login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({companyCode:companyCode(p),employeeNo:norm(p.employee||p.account),password:input.password})});
 issued={...data,personId:p.id,companyCode:companyCode(p)};
 if(!matches(p,issued))throw Error('HR 回傳的員工身分不一致，請聯絡管理者。');
 const fresh=target(input.company,input.method,input.account,input.code);
 if(!fresh||fresh.id!==p.id||companyCode(fresh)!==companyCode(p)||norm(fresh.employee||fresh.account)!==issued.employeeNo||!realHR(fresh))throw Error('帳號資料或權限已變更，請重新登入。');
 // Preserve existing prototype data; HR access is still authorized by its server token.
 const result=originalLogin({...input,password:'BOMB1234'});
 try{sessionStorage.setItem(KEY,JSON.stringify(issued));}catch{originalLogout();throw Error('瀏覽器無法保存登入狀態，請允許網站儲存資料。');}
 return result;
 }catch(e){if(issued)revoke(issued).catch(()=>{});throw e;}finally{loginBusy=false;}};
function stop(close){if(!pending)return;clearTimeout(pending.timer);const popup=pending.popup;pending=null;if(close)try{popup.close();}catch{}}
Workspace.logout=async function(){const s=stored();stop(true);clear();originalLogout();try{await revoke(s);}catch(e){if(e.status!==401)throw Error('本機已登出，但 HR 伺服器尚未確認登出；請重新連線後確認。');}};
function samePerson(id){const p=Workspace.current();return !!p&&p.id===id&&p.systems.includes('HR');}
async function verify(p){const s=stored();if(!samePerson(p.id)||!matches(p,s))throw Error('請先登出 Portal，再使用原 HR 管理密碼登入，即可直接開啟 HR。');try{const me=await api('me',{headers:{Authorization:'Bearer '+s.sessionToken}});if(!samePerson(p.id)||stored()?.sessionToken!==s.sessionToken||me.employeeNo!==s.employeeNo)throw Error('登入身分已變更，請重新登入 Portal。');return s;}catch(e){if(e.status===401)clear();throw e;}}
function report(title,message){if(typeof window.modal==='function')window.modal(title,message);else window.alert(message);}
Workspace.openHR=async function(){if(pending)return;const p=Workspace.current();if(!p||!p.systems.includes('HR')){report('無法進入','目前帳號沒有 HR 使用權限。');return;}if(!matches(p,stored())){report('請重新登入 Portal','請先登出 Portal，再以原 HR 管理密碼登入。之後點 HR 即可直接進入，不必再次輸入。');return;}
 const popup=window.open('about:blank','_blank','popup,width=1280,height=900');if(!popup){report('無法開啟 HR','請允許本站開啟彈出式視窗，再點一次 HR。');return;}
 const nonce=crypto.randomUUID(),attempt={popup,nonce,personId:p.id,sent:false,timer:setTimeout(()=>{if(pending!==attempt)return;stop(true);report('HR 連線逾時','請稍後再試；若持續發生，需檢查 HR 接收頁。');},60000)};pending=attempt;
 try{await verify(p);if(pending!==attempt||popup.closed){if(pending===attempt)stop(false);return;}popup.location.replace(HR+'/admin/portal-entry.html#'+nonce);}catch(e){if(pending===attempt){stop(true);report('無法進入 HR',e.message);}}};
window.addEventListener('message',async e=>{const attempt=pending;if(!attempt||e.origin!==HR||e.source!==attempt.popup||e.data?.nonce!==attempt.nonce)return;if(e.data.type==='BOMB_HR_READY'&&!attempt.sent){attempt.sent=true;try{const p=Workspace.current();if(!p||p.id!==attempt.personId)throw Error('Portal 登入已變更，請重新開啟 HR。');const s=await verify(p);if(pending!==attempt)return;attempt.popup.postMessage({type:'BOMB_HR_SESSION',nonce:attempt.nonce,token:s.sessionToken,employeeNo:s.employeeNo,expiresAt:s.expiresAt},HR);}catch(err){if(pending===attempt){stop(true);report('無法進入 HR',err.message);}}}else if(e.data.type==='BOMB_HR_OPENED'){stop(false);}else if(e.data.type==='BOMB_HR_ERROR'){stop(true);report('HR 登入交接失敗','HR 未接受登入資料，請重新登入 Portal 後再試。');}});
window.addEventListener('pagehide',()=>stop(true));
window.addEventListener('storage',()=>{if(pending&&!samePerson(pending.personId))stop(true);});
})();
