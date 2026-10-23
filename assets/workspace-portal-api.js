/* BOMB Portal server API client. Loading this file does not change prototype login. */
(function(){
'use strict';
const BASE='https://bomb-hr.onrender.com/api/v1/portal-auth/';
const KEY='bomb-portal-api-session-v1';
let generation=0,loginBusy=false;
const normalize=value=>typeof value==='string'?value.trim().toUpperCase():'';

function validPerson(p){
 return !!p&&typeof p.id==='string'&&p.id.length>0
  &&typeof p.company==='string'&&p.company.length>0
  &&typeof p.account==='string'&&p.account.length>0
  &&typeof p.employeeNo==='string'&&p.employeeNo.length>0
  &&typeof p.displayName==='string'&&typeof p.accessManage==='boolean'
  &&Array.isArray(p.systems)&&p.systems.every(x=>['HR','WMS','ADMIN'].includes(x))
  &&Array.isArray(p.methods)&&p.methods.every(x=>['MANUAL','NFC','QR'].includes(x));
}
function validSession(s){
 return !!s&&typeof s.sessionToken==='string'&&s.sessionToken.length>=32
  &&s.sessionToken.length<=256&&Date.parse(s.expiresAt)>Date.now()&&validPerson(s.person);
}
function raw(){
 try{return JSON.parse(sessionStorage.getItem(KEY)||'null');}catch{return null;}
}
function snapshot(){
 const s=raw();return validSession(s)?s:null;
}
function clearIf(token){
 if(raw()?.sessionToken===token){sessionStorage.removeItem(KEY);generation++;}
}
function save(s){
 try{sessionStorage.setItem(KEY,JSON.stringify(s));}
 catch{throw Error('瀏覽器無法保存 Portal 登入狀態，請允許網站儲存資料。');}
}

async function request(endpoint,{method='GET',body,token}={}){
 // This client never sends a bearer token to a caller-supplied URL.
 if(!['login','me','logout','hr-handoffs'].includes(endpoint))throw Error('不支援的 Portal API。');
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),60000);
 try{
  const headers={Accept:'application/json'};
  if(body!==undefined)headers['Content-Type']='application/json';
  if(token)headers.Authorization='Bearer '+token;
  const response=await fetch(BASE+endpoint,{
   method,headers,body:body===undefined?undefined:JSON.stringify(body),
   credentials:'omit',cache:'no-store',redirect:'error',signal:controller.signal
  });
  let result;try{result=await response.json();}
  catch{throw Error('Portal 服務回應格式異常，請稍後重試。');}
  if(!response.ok||result?.success!==true){
   const error=Error(typeof result?.message==='string'?result.message:'Portal 連線失敗，請稍後重試。');
   error.status=response.status;error.code=result?.code;throw error;
  }
  return result.data;
 }catch(error){
  if(error.name==='AbortError')throw Error('Portal 服務回應逾時，請稍後重試。');
  if(error instanceof TypeError)throw Error('目前無法連接 Portal 服務，請確認網路後重試。');
  throw error;
 }finally{clearTimeout(timer);}
}
async function revoke(token){
 if(token)await request('logout',{method:'POST',token});
}

async function login({company,method='MANUAL',account,password,code}={}){
 if(loginBusy)throw Error('正在驗證 Portal 身分，請稍候。');
 loginBusy=true;
 const ticket=++generation,previous=raw();
 let issued=null;
 try{
  const companyCode=normalize(company),loginMethod=normalize(method);
  const data=await request('login',{method:'POST',body:{
   companyCode,method:loginMethod,account:normalize(account),password,code
  }});
  issued=data?.sessionToken;
  if(!validSession(data)||data.person.company!==companyCode
    ||!data.person.methods.includes(loginMethod)
    ||(loginMethod==='MANUAL'&&data.person.account!==normalize(account))){
   throw Error('Portal 回傳的登入資料不一致，請重新登入。');
  }
  if(ticket!==generation)throw Error('登入操作已取消，請重新登入。');
  save(data);
  if(previous?.sessionToken&&previous.sessionToken!==issued)revoke(previous.sessionToken).catch(()=>{});
  return snapshot();
 }catch(error){
  if(typeof issued==='string')revoke(issued).catch(()=>{});
  throw error;
 }finally{loginBusy=false;}
}

async function refresh(){
 const s=snapshot();
 if(!s){const error=Error('Portal 登入已到期，請重新登入。');error.status=401;throw error;}
 const ticket=generation;
 try{
  const data=await request('me',{token:s.sessionToken});
  if(ticket!==generation||raw()?.sessionToken!==s.sessionToken)throw Error('登入身分已變更，請重新開啟。');
  if(!validPerson(data?.person)||data.person.id!==s.person.id
    ||data.person.company!==s.person.company||!(Date.parse(data.expiresAt)>Date.now())){
   clearIf(s.sessionToken);throw Error('Portal 身分回應不一致，請重新登入。');
  }
  save({...s,person:data.person,expiresAt:data.expiresAt});
  return snapshot();
 }catch(error){
  if(error.status===401)clearIf(s.sessionToken);
  throw error;
 }
}

// A handoff is issued for the current session and a specific popup nonce.
async function createHRHandoff(nonce){
 if(typeof nonce!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(nonce)){
  throw Error('HR 開啟資料不完整，請重新點選入口。');
 }
 const s=snapshot(),ticket=generation;
 if(!s){const error=Error('Portal 登入已到期，請重新登入。');error.status=401;throw error;}
 try{
  const data=await request('hr-handoffs',{method:'POST',token:s.sessionToken,body:{nonce}});
  if(ticket!==generation||raw()?.sessionToken!==s.sessionToken
   ||!snapshot())throw Error('Portal 登入已變更，請重新開啟 HR。');
  if(typeof data?.code!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(data.code)
   ||!(Date.parse(data.expiresAt)>Date.now()))throw Error('HR 交接回應不完整，請重新開啟。');
  return {code:data.code,expiresAt:data.expiresAt};
 }catch(error){
  if(error.status===401)clearIf(s.sessionToken);
  throw error;
 }
}

async function logout(){
 const s=raw();
 generation++;
 sessionStorage.removeItem(KEY);
 try{await revoke(s?.sessionToken);}
 catch{throw Error('本機已登出；伺服器尚未確認登出，請恢復連線後再確認。');}
}

// A cached person is for display. Protected operations must be checked by the server.
window.PortalAPI=Object.freeze({login,refresh,logout,snapshot,createHRHandoff});
})();
