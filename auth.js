const AUTH_BASE='https://energyguard-auth.onrender.com';
const SESSION_KEY='energyguard_session_v1';
const USER_KEY='energyguard_user_v1';
const SYSTEM_KEY='energyguard_system_v1';

async function authFetch(path,options={}){const r=await fetch(AUTH_BASE+path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});const d=await r.json().catch(()=>({}));if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);return d}
function getSession(){return localStorage.getItem(SESSION_KEY)||''}
function getUser(){try{return JSON.parse(localStorage.getItem(USER_KEY)||'null')}catch{return null}}
function setSession(token,user){localStorage.setItem(SESSION_KEY,token);localStorage.setItem(USER_KEY,JSON.stringify(user))}
function clearSession(){localStorage.removeItem(SESSION_KEY);localStorage.removeItem(USER_KEY)}
async function getMe(){const token=getSession();if(!token)return null;try{return await authFetch('/me',{headers:{Authorization:`Bearer ${token}`}})}catch{clearSession();return null}}
function defaultSystem(){return{lat:21.0285,lon:105.8542,dailyConsumptionKwh:20,solarKwp:5,batteryKwh:10,initialSocPct:60,evBatteryKwh:60,evTargetPct:80}}
function loadSystem(){try{return{...defaultSystem(),...JSON.parse(localStorage.getItem(SYSTEM_KEY)||'{}')}}catch{return defaultSystem()}}
function saveSystem(v){localStorage.setItem(SYSTEM_KEY,JSON.stringify(v))}

async function initLogin(){
  const status=document.querySelector('#login-status');const shell=document.querySelector('#google-button');const guest=document.querySelector('#guest-btn');
  if(getSession()){const me=await getMe();if(me?.ok){location.href='account.html';return}}
  guest?.addEventListener('click',()=>location.href='dashboard.html');
  try{
    const cfg=await authFetch('/config');
    if(!cfg.googleEnabled||!cfg.googleClientId){status.textContent='Google Login chưa được kích hoạt cho EnergyGuard.';status.className='status warn';shell.innerHTML='<button class="secondary-btn" disabled>Google Login đang chờ cấu hình OAuth</button>';return}
    status.textContent='Xác thực Google đã sẵn sàng.';status.className='status ok';
    const boot=()=>{
      if(!window.google?.accounts?.id)return setTimeout(boot,150);
      google.accounts.id.initialize({client_id:cfg.googleClientId,callback:async resp=>{
        try{status.textContent='Đang xác minh tài khoản Google…';const out=await authFetch('/google',{method:'POST',body:JSON.stringify({credential:resp.credential})});setSession(out.sessionToken,out.user);status.textContent='Đăng nhập thành công.';status.className='status ok';location.href='account.html'}catch(e){status.textContent=e.message;status.className='status warn'}
      },use_fedcm_for_prompt:true});
      google.accounts.id.renderButton(shell,{theme:'filled_black',size:'large',shape:'pill',text:'continue_with',width:320});
    };boot();
  }catch(e){status.textContent='Auth service chưa sẵn sàng: '+e.message;status.className='status warn'}
}

async function initAccount(){
  const me=await getMe();if(!me?.ok){location.href='login.html';return}
  const u=me.user;document.querySelector('#profile-name').textContent=u.name||'EnergyGuard User';document.querySelector('#profile-email').textContent=u.email||'';document.querySelector('#profile-sub').textContent=u.sub||'';document.querySelector('#profile-exp').textContent=new Date(me.expiresAt).toLocaleString('vi-VN');
  const avatar=document.querySelector('#profile-avatar');if(u.picture){avatar.innerHTML=`<img src="${u.picture}" alt="Ảnh đại diện">`}else avatar.textContent=(u.name||'E').slice(0,1).toUpperCase();
  const sys=loadSystem();for(const [k,v] of Object.entries(sys)){const el=document.querySelector(`[name="${k}"]`);if(el)el.value=v}
  document.querySelector('#system-form')?.addEventListener('submit',e=>{e.preventDefault();const fd=new FormData(e.currentTarget);const next={lat:Number(fd.get('lat')),lon:Number(fd.get('lon')),dailyConsumptionKwh:Number(fd.get('dailyConsumptionKwh')),solarKwp:Number(fd.get('solarKwp')),batteryKwh:Number(fd.get('batteryKwh')),initialSocPct:Number(fd.get('initialSocPct')),evBatteryKwh:Number(fd.get('evBatteryKwh')),evTargetPct:Number(fd.get('evTargetPct'))};saveSystem(next);const msg=document.querySelector('#save-msg');msg.textContent='Đã lưu cấu hình trên thiết bị này.';msg.className='status ok'});
  document.querySelector('#logout-btn')?.addEventListener('click',async()=>{try{await authFetch('/logout',{method:'POST',headers:{Authorization:`Bearer ${getSession()}`}})}catch{}clearSession();location.href='login.html'});
}

window.EnergyGuardAuth={getSession,getUser,getMe,loadSystem,saveSystem};
if(document.body.dataset.page==='login')initLogin();
if(document.body.dataset.page==='account')initAccount();
