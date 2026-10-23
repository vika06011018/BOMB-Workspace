/* Local prototype data is retained. Server login is enabled explicitly by the Portal home page. */
(function(){
'use strict';
const KEY='bomb-workspace-people-v1',SESSION='bomb-workspace-session-v1';
const permissions=['tasks','request','pickup','returns','emergency','receive','stock','count','master','dispatch','approve'];
const roles={employee:'員工',sm:'SM',executive:'高階主管',admin:'行政'};
function init(){
 if(localStorage.getItem(KEY)!==null)return;
 const definitions=[['AB00001','OG','executive',['HR','ADMIN','WMS'],permissions,true],['DEMO-EMP','員工示範','employee',['HR','WMS'],['tasks','request','pickup','returns','emergency'],false],['DEMO-SM','SM 示範','sm',['WMS'],['tasks','pickup','receive','stock','count','dispatch'],false],['DEMO-ADMIN','行政示範','admin',['ADMIN','WMS'],['tasks','stock','master','approve'],false]];
 const people=definitions.map(([account,name,role,systems,grants,sharedAdmin])=>({id:crypto.randomUUID(),company:'BOMB',employee:account,account,name,role,sharedAdmin,site:'',department:'',employment:'employed',handover:'none',state:'active',landing:role==='executive'?'manager':role==='sm'?'warehouse':'employee',systems,permissions:grants,methods:account==='AB00001'?['MANUAL']:['MANUAL','QR','NFC'],nfc:account==='AB00001'?'':'DEMO-NFC-'+account,qr:account==='AB00001'?'':'DEMO-QR-'+account,logs:[]}));
 localStorage.setItem(KEY,JSON.stringify(people));
}
function all(){const list=JSON.parse(localStorage.getItem(KEY)||'[]');if(!Array.isArray(list)||list.some(p=>!p.id||!Array.isArray(p.systems)||!Array.isArray(p.permissions)))throw Error('人員資料格式有誤，請保留資料並檢查備份。');return list;}
function role(p){return roles[p.role]?p.role:p.landing==='manager'?'executive':p.landing==='warehouse'?'sm':p.systems.includes('ADMIN')&&!p.systems.includes('WMS')?'admin':'employee';}
function isAdmin(p){return p.sharedAdmin===true||(p.sharedAdmin===undefined&&p.company==='BOMB'&&p.account==='AB00001'&&p.name==='OG'&&p.landing==='manager'&&!p.previousAccountHolderId);}
function active(p){return !!p&&p.state==='active'&&(!p.employment||p.employment==='employed');}
function current(){try{const server=serverCurrent();if(server!==undefined)return server;const s=JSON.parse(sessionStorage.getItem(SESSION)||'null');if(!s||Date.now()-s.at>8*3600000)return null;const p=all().find(x=>x.id===s.personId);if(!active(p)||p.company!==s.company||!(p.methods||[]).includes(s.method))return null;if(s.method!=='MANUAL'&&p[s.method==='QR'?'qr':'nfc']!==s.card)return null;return p;}catch{return null;}}
function prototypeLogin({company,method,account,password,code}){
 const norm=v=>String(v||'').trim().toUpperCase();
 let candidates=all().filter(p=>norm(p.company)===norm(company));
 candidates=candidates.filter(p=>method==='MANUAL'?norm(p.account)===norm(account):!!code&&p[method==='QR'?'qr':'nfc']===code.trim());
 candidates=candidates.filter(active);
 if(candidates.length!==1)throw Error('找不到有效人員，請確認企業、識別資料與帳號狀態。');
 const p=candidates[0];if(!(p.methods||[]).includes(method))throw Error('此人員尚未開放這種登入方式。');
 if(method==='MANUAL'&&password!=='BOMB1234')throw Error('測試密碼不正確，請使用 BOMB1234。');
 sessionStorage.setItem(SESSION,JSON.stringify({personId:p.id,company:p.company,at:Date.now(),method,card:method==='MANUAL'?null:code.trim()}));return p;
}
function logout(){const server=readSession()?.source==='SERVER';sessionStorage.removeItem(SESSION);if(server)return apiClient().then(api=>api.logout());}
function guard(system){const p=current();if(!p||(system==='PEOPLE'?!isAdmin(p):!p.systems.includes(system))){location.replace('./index.html');return null;}return p;}
// Server credentials and local prototype records have separate storage keys.
const API_SESSION='bomb-portal-api-session-v1';
const normalize=v=>String(v||'').trim().toUpperCase();
let clientLoading=null;
function readSession(){try{return JSON.parse(sessionStorage.getItem(SESSION)||'null');}catch{return null;}}
function readAPI(){try{return JSON.parse(sessionStorage.getItem(API_SESSION)||'null');}catch{return null;}}
function isDemo(p){return !!p&&normalize(p.account).startsWith('DEMO-');}
function apiClient(){
 if(window.PortalAPI)return Promise.resolve(window.PortalAPI);
 if(clientLoading)return clientLoading;
 clientLoading=new Promise((resolve,reject)=>{
  const script=document.createElement('script');
  script.src=new URL('./assets/workspace-portal-api.js',location.href).href;
  const timer=setTimeout(()=>{script.remove();clientLoading=null;reject(Error('Portal 連線程式載入逾時，請重新整理。'));},20000);
  script.onload=()=>{clearTimeout(timer);if(window.PortalAPI)resolve(window.PortalAPI);else{clientLoading=null;reject(Error('Portal 連線程式未就緒，請重新整理。'));}};
  script.onerror=()=>{clearTimeout(timer);script.remove();clientLoading=null;reject(Error('Portal 連線程式載入失敗，請重新整理。'));};
  document.head.append(script);
 });
 return clientLoading;
}
function serverCurrent(){
 const marker=readSession();
 if(marker?.source!=='SERVER'){
  if(window.PORTAL_SERVER_LOGIN===true&&marker){
   const local=all().find(p=>p.id===marker.personId);
   if(!isDemo(local))return null;
  }
  return undefined;
 }
 const s=readAPI(),p=s?.person;
 if(!p||s.sessionToken!==marker.apiToken||!(Date.parse(s.expiresAt)>Date.now())
   ||p.id!==marker.serverAccountId||!Array.isArray(p.systems)||!Array.isArray(p.methods))return null;
 const locals=all().filter(x=>normalize(x.company)===normalize(p.company)&&normalize(x.account)===normalize(p.account));
 if(locals.length>1)return null;
 const local=locals[0];
 if(local&&!active(local))return null;
 return {
  ...(local||{permissions:[],role:'employee',landing:'employee',logs:[]}),
  id:local?.id||p.id,company:p.company,account:p.account,employee:p.employeeNo,name:p.displayName,
  state:'active',employment:'employed',
  // During migration local restrictions may narrow access, never grant server access.
  systems:p.systems.filter(x=>!local||local.systems.includes(x)),
  sharedAdmin:p.accessManage===true&&(!local||isAdmin(local)),
  methods:p.methods,serverAccountId:p.id,authSource:'SERVER'
 };
}
async function login(input){
 if(window.PORTAL_SERVER_LOGIN!==true){
  const result=prototypeLogin(input);
  // Do not leave a previous server token paired with another local identity.
  if(readAPI())apiClient().then(api=>api.logout()).catch(()=>{});
  return result;
 }
 const method=normalize(input.method),company=normalize(input.company);
 // Explicit demo identities remain local and cannot acquire an HR server session.
 const demoCandidates=all().filter(p=>normalize(p.company)===company&&isDemo(p)).filter(p=>
  method==='MANUAL'?normalize(p.account)===normalize(input.account)
   :!!input.code&&p[method==='QR'?'qr':'nfc']===String(input.code).trim());
 if(demoCandidates.length===1){
  const api=await apiClient();
  await api.logout();
  return prototypeLogin(input);
 }
 const api=await apiClient();
 const s=await api.login(input);
 try{
  sessionStorage.setItem(SESSION,JSON.stringify({source:'SERVER',serverAccountId:s.person.id,
   apiToken:s.sessionToken,company:s.person.company,at:Date.now(),method}));
  const person=current();
  if(!person)throw Error('本機人員資料與 Portal 帳號不一致或已停用，請聯絡管理者。');
  return person;
 }catch(error){sessionStorage.removeItem(SESSION);await api.logout().catch(()=>{});throw error;}
}
async function refresh(){
 if(readSession()?.source!=='SERVER')return current();
 const api=await apiClient();
 try{await api.refresh();return current();}
 catch(error){if(error.status===401)sessionStorage.removeItem(SESSION);throw error;}
}
function usesServer(){return readSession()?.source==='SERVER';}
window.Workspace={init,all,current,login,logout,guard,role,isAdmin,roles,permissions,KEY,refresh,usesServer};
try{init();}catch(e){window.workspaceLoadError=e.message;}
})();

