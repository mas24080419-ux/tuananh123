const PHONE_AUTH_BASE='https://energyguard-auth.onrender.com';
const PHONE_SESSION_KEY='energyguard_session_v1';
const PHONE_USER_KEY='energyguard_user_v1';
let phoneSupabase=null;
let pendingPhone='';
let resendTimer=null;

function phoneSetStatus(text,type=''){
  const el=document.querySelector('#login-status');
  if(!el)return;
  el.textContent=text;
  el.className='status'+(type?` ${type}`:'');
}
function phoneFriendlyError(err){
  const m=String(err?.message||err||'Không thể xử lý OTP.');
  if(/unsupported phone provider|sms provider|provider.*not.*enabled|phone provider/i.test(m))return'Phone Auth chưa được cấu hình nhà cung cấp SMS trong Supabase.';
  if(/rate limit|too many|seconds/i.test(m))return'Bạn vừa yêu cầu OTP. Vui lòng chờ trước khi gửi lại mã.';
  if(/invalid.*otp|token.*invalid|expired/i.test(m))return'Mã OTP không đúng hoặc đã hết hạn.';
  if(/phone.*invalid|invalid.*phone/i.test(m))return'Số điện thoại chưa đúng định dạng.';
  return m;
}
function normalizeVietnamPhone(raw){
  let s=String(raw||'').trim().replace(/[\s().-]/g,'');
  if(s.startsWith('+')){
    if(!/^\+[1-9]\d{7,14}$/.test(s))throw new Error('Số điện thoại chưa đúng định dạng quốc tế.');
    return s;
  }
  s=s.replace(/\D/g,'');
  if(s.startsWith('84'))s='+'+s;
  else if(s.startsWith('0'))s='+84'+s.slice(1);
  else s='+84'+s;
  if(!/^\+84\d{9,10}$/.test(s))throw new Error('Số điện thoại Việt Nam chưa đúng định dạng.');
  return s;
}
function maskedPhone(phone){
  if(phone.length<8)return phone;
  return phone.slice(0,5)+' *** '+phone.slice(-3);
}
function loginNextPhone(){
  const raw=new URLSearchParams(location.search).get('next')||'dashboard.html';
  const allowed=new Set(['dashboard.html','account.html','history.html','analytics.html','index.html']);
  return allowed.has(raw)?raw:'dashboard.html';
}
async function phoneAuthFetch(path,options={}){
  const r=await fetch(PHONE_AUTH_BASE+path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);
  return d;
}
async function getPhoneSupabase(){
  if(phoneSupabase)return phoneSupabase;
  const cfg=await phoneAuthFetch('/config');
  if(!cfg.supabaseEnabled||!cfg.supabaseUrl||!cfg.supabasePublishableKey)throw new Error('Supabase Auth chưa được cấu hình.');
  const started=Date.now();
  while(!window.supabase?.createClient){
    if(Date.now()-started>8000)throw new Error('Không tải được Supabase Auth.');
    await new Promise(r=>setTimeout(r,100));
  }
  phoneSupabase=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,storageKey:'energyguard-phone-auth'}});
  return phoneSupabase;
}
async function exchangePhoneSession(session){
  if(!session?.access_token)throw new Error('Không nhận được access token sau khi xác minh OTP.');
  const out=await phoneAuthFetch('/supabase/session',{method:'POST',body:JSON.stringify({accessToken:session.access_token})});
  localStorage.setItem(PHONE_SESSION_KEY,out.sessionToken);
  localStorage.setItem(PHONE_USER_KEY,JSON.stringify(out.user));
  try{await phoneSupabase.auth.signOut({scope:'local'})}catch{}
  phoneSetStatus('Xác minh OTP thành công. Đang mở EnergyGuard…','ok');
  setTimeout(()=>location.href=loginNextPhone(),350);
}
function startResendCountdown(seconds=60){
  const btn=document.querySelector('#resend-otp-btn');
  if(!btn)return;
  clearInterval(resendTimer);
  let left=seconds;
  btn.disabled=true;
  btn.textContent=`Gửi lại mã sau ${left}s`;
  resendTimer=setInterval(()=>{
    left-=1;
    if(left<=0){clearInterval(resendTimer);btn.disabled=false;btn.textContent='Gửi lại mã OTP';return}
    btn.textContent=`Gửi lại mã sau ${left}s`;
  },1000);
}
async function sendPhoneOtp(phone){
  const sb=await getPhoneSupabase();
  const {error}=await sb.auth.signInWithOtp({phone,options:{shouldCreateUser:true}});
  if(error)throw error;
  pendingPhone=phone;
  document.querySelector('#phone-send-form').hidden=true;
  document.querySelector('#phone-verify-form').hidden=false;
  const label=document.querySelector('#otp-phone-label');if(label)label.textContent=`Mã đã gửi tới ${maskedPhone(phone)}`;
  const otp=document.querySelector('#auth-otp');if(otp){otp.value='';setTimeout(()=>otp.focus(),100)}
  phoneSetStatus('Đã yêu cầu gửi mã OTP. Kiểm tra SMS trên điện thoại.','ok');
  startResendCountdown(60);
}
async function initPhoneOtp(){
  const panel=document.querySelector('#phone-auth-panel');
  if(!panel)return;
  const sendForm=document.querySelector('#phone-send-form');
  const verifyForm=document.querySelector('#phone-verify-form');
  const phoneInput=document.querySelector('#auth-phone');
  const otpInput=document.querySelector('#auth-otp');
  const sendBtn=document.querySelector('#send-otp-btn');
  const verifyBtn=document.querySelector('#verify-otp-btn');
  const resendBtn=document.querySelector('#resend-otp-btn');
  const changeBtn=document.querySelector('#change-phone-btn');

  document.querySelectorAll('[data-login-method="phone"]').forEach(btn=>btn.addEventListener('click',()=>phoneSetStatus('Nhập số điện thoại để nhận mã OTP qua SMS.','')));

  sendForm?.addEventListener('submit',async e=>{
    e.preventDefault();
    sendBtn.disabled=true;const old=sendBtn.textContent;sendBtn.textContent='Đang gửi OTP…';
    try{const phone=normalizeVietnamPhone(phoneInput.value);await sendPhoneOtp(phone)}catch(err){phoneSetStatus(phoneFriendlyError(err),'warn')}finally{sendBtn.disabled=false;sendBtn.textContent=old}
  });

  verifyForm?.addEventListener('submit',async e=>{
    e.preventDefault();
    const token=String(otpInput.value||'').replace(/\D/g,'');
    if(!pendingPhone){phoneSetStatus('Hãy yêu cầu mã OTP trước.','warn');return}
    if(!/^\d{6}$/.test(token)){phoneSetStatus('Vui lòng nhập đủ mã OTP 6 số.','warn');return}
    verifyBtn.disabled=true;const old=verifyBtn.textContent;verifyBtn.textContent='Đang xác minh…';
    try{
      const sb=await getPhoneSupabase();
      const {data,error}=await sb.auth.verifyOtp({phone:pendingPhone,token,type:'sms'});
      if(error)throw error;
      await exchangePhoneSession(data.session);
    }catch(err){phoneSetStatus(phoneFriendlyError(err),'warn')}finally{verifyBtn.disabled=false;verifyBtn.textContent=old}
  });

  resendBtn?.addEventListener('click',async()=>{
    if(!pendingPhone)return;
    resendBtn.disabled=true;
    try{await sendPhoneOtp(pendingPhone)}catch(err){phoneSetStatus(phoneFriendlyError(err),'warn');resendBtn.disabled=false;resendBtn.textContent='Gửi lại mã OTP'}
  });

  changeBtn?.addEventListener('click',()=>{
    clearInterval(resendTimer);pendingPhone='';
    verifyForm.hidden=true;sendForm.hidden=false;
    phoneSetStatus('Nhập số điện thoại mới để nhận OTP.','');
    setTimeout(()=>phoneInput?.focus(),100);
  });
}

document.addEventListener('DOMContentLoaded',initPhoneOtp);
