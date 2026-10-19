/* Browser-local prototype only. Production authentication must be enforced by a server. */
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
function current(){try{const s=JSON.parse(sessionStorage.getItem(SESSION)||'null');if(!s||Date.now()-s.at>8*3600000)return null;const p=all().find(x=>x.id===s.personId);if(!active(p)||p.company!==s.company||!(p.methods||[]).includes(s.method))return null;if(s.method!=='MANUAL'&&p[s.method==='QR'?'qr':'nfc']!==s.card)return null;return p;}catch{return null;}}
function login({company,method,account,password,code}){
 const norm=v=>String(v||'').trim().toUpperCase();
 let candidates=all().filter(p=>norm(p.company)===norm(company));
 candidates=candidates.filter(p=>method==='MANUAL'?norm(p.account)===norm(account):!!code&&p[method==='QR'?'qr':'nfc']===code.trim());
 candidates=candidates.filter(active);
 if(candidates.length!==1)throw Error('找不到有效人員，請確認企業、識別資料與帳號狀態。');
 const p=candidates[0];if(!(p.methods||[]).includes(method))throw Error('此人員尚未開放這種登入方式。');
 if(method==='MANUAL'&&password!=='BOMB1234')throw Error('測試密碼不正確，請使用 BOMB1234。');
 sessionStorage.setItem(SESSION,JSON.stringify({personId:p.id,company:p.company,at:Date.now(),method,card:method==='MANUAL'?null:code.trim()}));return p;
}
function logout(){sessionStorage.removeItem(SESSION);}
function guard(system){const p=current();if(!p||(system==='PEOPLE'?!isAdmin(p):!p.systems.includes(system))){location.replace('./index.html');return null;}return p;}
window.Workspace={init,all,current,login,logout,guard,role,isAdmin,roles,permissions,KEY};
try{init();}catch(e){window.workspaceLoadError=e.message;}
})();
