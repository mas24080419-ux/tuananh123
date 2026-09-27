const AUTH_BASE='https://energyguard-auth.onrender.com';
const SESSION_KEY='energyguard_session_v1';
const USER_KEY='energyguard_user_v1';
const LEGACY_SYSTEM_KEY='energyguard_system_v1';
const SYSTEMS_KEY='energyguard_systems_v2';
const ACTIVE_SYSTEM_KEY='energyguard_active_system_v2';
const HISTORY_KEY='energyguard_forecast_history_v1';

async function authFetch(path,options={}){const r=await fetch(AUTH_BASE+path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d}
function getSession(){return localStorage.getItem(SESSION_KEY)||''}
function getUser(){try{return JSON.parse(localStorage.getItem(USER_KEY)||'null')}catch{return null}}
function setSession(token,user){localStorage.setItem(SESSION_KEY,token);localStorage.setItem(USER_KEY,JSON.stringify(user))}
function clearSession(){localStorage.removeItem(SESSION_KEY);localStorage.removeItem(USER_KEY)}
async function getMe(){const token=getSession();if(!token)return null;try{return await authFetch('/me',{headers:{Authorization:`Bearer ${token}`}})}catch{clearSession();return null}}
function uid(){return crypto.randomUUID?crypto.randomUUID():`eg-${Date.now()}-${Math.random().toString(16).slice(2)}`}
function defaultSystem(){return{id:uid(),name:'Hệ thống chính',lat:21.0285,lon:105.8542,dailyConsumptionKwh:20,solarKwp:5,batteryKwh:10,initialSocPct:60,evBatteryKwh:60,evTargetPct:80}}
function migrateLegacy(){try{const existing=JSON.parse(localStorage.getItem(SYSTEMS_KEY)||'null');if(Array.isArray(existing)&&existing.length)return existing;const old=JSON.parse(localStorage.getItem(LEGACY_SYSTEM_KEY)||'null');const first={...defaultSystem(),...(old||{})};localStorage.setItem(SYSTEMS_KEY,JSON.stringify([first]));localStorage.setItem(ACTIVE_SYSTEM_KEY,first.id);localStorage.setItem(LEGACY_SYSTEM_KEY,JSON.stringify(first));return[first]}catch{const d=defaultSystem();return[d]}}
function getSystems(){try{const arr=JSON.parse(localStorage.getItem(SYSTEMS_KEY)||'null');return Array.isArray(arr)&&arr.length?arr:migrateLegacy()}catch{return migrateLegacy()}}
function saveSystems(list){localStorage.setItem(SYSTEMS_KEY,JSON.stringify(list.slice(0,20)))}
function getActiveSystem(){const list=getSystems();const id=localStorage.getItem(ACTIVE_SYSTEM_KEY);const found=list.find(x=>x.id===id)||list[0];if(found){localStorage.setItem(ACTIVE_SYSTEM_KEY,found.id);localStorage.setItem(LEGACY_SYSTEM_KEY,JSON.stringify(found))}return found||defaultSystem()}
function setActiveSystem(id){const list=getSystems();const found=list.find(x=>x.id===id);if(found){localStorage.setItem(ACTIVE_SYSTEM_KEY,found.id);localStorage.setItem(LEGACY_SYSTEM_KEY,JSON.stringify(found));localStorage.setItem('energyguard-dashboard-config',JSON.stringify({lat:found.lat,lon:found.lon,dailyLoad:found.dailyConsumptionKwh,solarKwp:found.solarKwp,batteryKwh:found.batteryKwh,soc:found.initialSocPct}))}return found}
function saveSystem(v){const list=getSystems();const id=v.id||localStorage.getItem(ACTIVE_SYSTEM_KEY)||uid();const item={...defaultSystem(),...v,id,name:String(v.name||'Hệ thống').trim()||'Hệ thống'};const idx=list.findIndex(x=>x.id===id);if(idx>=0)list[idx]=item;else list.push(item);saveSystems(list);setActiveSystem(id);return item}
function deleteSystem(id){let list=getSystems().filter(x=>x.id!==id);if(!list.length)list=[defaultSystem()];saveSystems(list);setActiveSystem(list[0].id);return list}
function loadSystem(){return getActiveSystem()}
function localHistory(){try{const h=JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]');return Array.isArray(h)?h:[]}catch{return[]}}
function addLocalHistory(run){const next=[{id:run.id||uid(),createdAt:run.createdAt||new Date().toISOString(),...run},...localHistory()].slice(0,100);localStorage.setItem(HISTORY_KEY,JSON.stringify(next));return next[0]}
function clearLocalHistory(){localStorage.removeItem(HISTORY_KEY)}
async function authed(path,options={}){const token=getSession();if(!token)throw new Error('Chưa đăng nhập');return authFetch(path,{...options,headers:{Authorization:`Bearer ${token}`,...(options.headers||{})}})}
async function storageStatus(){try{return await authFetch('/storage/status')}catch{return{persistent:false,mode:'offline'}}}
async function syncSystem(item){if(!getSession())return null;try{return await authed('/systems',{method:'POST',body:JSON.stringify(item)})}catch{return null}}
async function pushForecastRun(run){addLocalHistory(run);if(!getSession())return{local:true};try{return await authed('/forecast-runs',{method:'POST',body:JSON.stringify(run)})}catch{return{local:true}}}
async function getForecastHistory(){const local=localHistory();if(!getSession())return{runs:local,persistent:false,source:'local'};try{const remote=await authed('/forecast-runs?limit=100');const map=new Map();[...remote.runs,...local].forEach(x=>map.set(x.id||`${x.createdAt}-${x.systemId}`,x));return{runs:[...map.values()].sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt))),persistent:Boolean(remote.persistent),source:remote.persistent?'database':'server-memory + local'}}catch{return{runs:local,persistent:false,source:'local'}}}

async function initLogin(){
  const status=document.querySelector('#login-status');const shell=document.querySelector('#google-button');const guest=document.querySelector('#guest-btn');
  if(getSession()){const me=await getMe();if(me?.ok){location.href='account.html';return}}
  guest?.addEventListener('click',()=>location.href='dashboard.html');
  try{
    const cfg=await authFetch('/config');
    if(!cfg.googleEnabled||!cfg.googleClientId){status.textContent='Google Login chưa được kích hoạt cho EnergyGuard.';status.className='status warn';shell.innerHTML='<button class="secondary-btn" disabled>Google Login đang chờ cấu hình OAuth</button>';return}
    status.textContent='Xác thực Google đã sẵn sàng.';status.className='status ok';
    const boot=()=>{if(!window.google?.accounts?.id)return setTimeout(boot,150);google.accounts.id.initialize({client_id:cfg.googleClientId,callback:async resp=>{try{status.textContent='Đang xác minh tài khoản Google…';const out=await authFetch('/google',{method:'POST',body:JSON.stringify({credential:resp.credential})});setSession(out.sessionToken,out.user);status.textContent='Đăng nhập thành công.';status.className='status ok';location.href='account.html'}catch(e){status.textContent=e.message;status.className='status warn'}},use_fedcm_for_prompt:true});google.accounts.id.renderButton(shell,{theme:'filled_black',size:'large',shape:'pill',text:'continue_with',width:320})};boot();
  }catch(e){status.textContent='Auth service chưa sẵn sàng: '+e.message;status.className='status warn'}
}

function fillSystemForm(sys){for(const [k,v] of Object.entries(sys||{})){const el=document.querySelector(`[name="${k}"]`);if(el)el.value=v??''}}
function renderSystems(){const wrap=document.querySelector('#systems-list');if(!wrap)return;const active=getActiveSystem();wrap.innerHTML='';getSystems().forEach(sys=>{const el=document.createElement('article');el.className='system-item'+(sys.id===active.id?' active':'');el.innerHTML=`<div><strong>${sys.name}</strong><small>${sys.solarKwp} kWp solar · ${sys.batteryKwh} kWh battery · ${sys.dailyConsumptionKwh} kWh/day</small></div><div class="system-actions"><button data-open="${sys.id}">Mở</button><button data-delete="${sys.id}" class="danger">Xóa</button></div>`;wrap.appendChild(el)});wrap.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>{setActiveSystem(b.dataset.open);fillSystemForm(getActiveSystem());renderSystems()});wrap.querySelectorAll('[data-delete]').forEach(b=>b.onclick=()=>{if(getSystems().length<=1)return;deleteSystem(b.dataset.delete);fillSystemForm(getActiveSystem());renderSystems()})}

async function initAccount(){
  const me=await getMe();if(!me?.ok){location.href='login.html';return}
  const u=me.user;document.querySelector('#profile-name').textContent=u.name||'EnergyGuard User';document.querySelector('#profile-email').textContent=u.email||'';document.querySelector('#profile-sub').textContent=u.sub||'';document.querySelector('#profile-exp').textContent=new Date(me.expiresAt).toLocaleString('vi-VN');
  const avatar=document.querySelector('#profile-avatar');if(u.picture){avatar.innerHTML=`<img src="${u.picture}" alt="Ảnh đại diện">`}else avatar.textContent=(u.name||'E').slice(0,1).toUpperCase();
  fillSystemForm(getActiveSystem());renderSystems();
  const st=await storageStatus();const storage=document.querySelector('#storage-state');if(storage){storage.textContent=st.persistent?'PostgreSQL persistence đang hoạt động.':'Chế độ fallback cục bộ/server-memory; Postgres chưa được gắn DATABASE_URL.';storage.className='status '+(st.persistent?'ok':'warn')}
  document.querySelector('#new-system-btn')?.addEventListener('click',()=>{const d=defaultSystem();d.name=`Hệ thống ${getSystems().length+1}`;const saved=saveSystem(d);fillSystemForm(saved);renderSystems()});
  document.querySelector('#system-form')?.addEventListener('submit',async e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const current=getActiveSystem();const next={id:current.id,name:String(fd.get('name')||current.name),lat:Number(fd.get('lat')),lon:Number(fd.get('lon')),dailyConsumptionKwh:Number(fd.get('dailyConsumptionKwh')),solarKwp:Number(fd.get('solarKwp')),batteryKwh:Number(fd.get('batteryKwh')),initialSocPct:Number(fd.get('initialSocPct')),evBatteryKwh:Number(fd.get('evBatteryKwh')),evTargetPct:Number(fd.get('evTargetPct'))};const saved=saveSystem(next);await syncSystem(saved);renderSystems();const msg=document.querySelector('#save-msg');msg.textContent=st.persistent?'Đã lưu và đồng bộ database.':'Đã lưu trên thiết bị; API sync đã nhận cấu trúc nhưng storage server hiện chưa persistent.';msg.className='status '+(st.persistent?'ok':'warn')});
  document.querySelector('#logout-btn')?.addEventListener('click',async()=>{try{await authed('/logout',{method:'POST'})}catch{}clearSession();location.href='login.html'});
}

window.EnergyGuardAuth={getSession,getUser,getMe,loadSystem,saveSystem,getSystems,getActiveSystem,setActiveSystem,deleteSystem,pushForecastRun,getForecastHistory,addLocalHistory,clearLocalHistory,storageStatus,authed};
if(document.body.dataset.page==='login')initLogin();
if(document.body.dataset.page==='account')initAccount();
