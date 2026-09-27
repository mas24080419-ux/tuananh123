const $=(s,c=document)=>c.querySelector(s);const $$=(s,c=document)=>[...c.querySelectorAll(s)];
const API_BASE='https://energyguard-api.onrender.com';
const ML_BASE='https://energyguard-model.onrender.com';
const DEFAULT_SYSTEM={lat:21.0285,lon:105.8542,solarKwp:5,batteryKwh:10,dailyConsumptionKwh:20,initialSocPct:60};
const liveState={weather:null,load:[],solar:[],optimization:null,loadModel:'transparent-baseline-v1',loadBenchmark:null};

async function jsonFetch(url,options={},timeoutMs=18000){const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);try{const r=await fetch(url,{...options,signal:controller.signal,headers:{'Content-Type':'application/json',...(options.headers||{})}});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||`HTTP ${r.status}`);return data}finally{clearTimeout(timer)}}
const api=(path,options={})=>jsonFetch(API_BASE+path,options);
const mlApi=(path,options={})=>jsonFetch(ML_BASE+path,options,25000);
function fmt(v,d=2){return Number(v||0).toLocaleString('vi-VN',{maximumFractionDigits:d})}
function clamp(v,min,max){return Math.min(max,Math.max(min,v))}
function estimatePvOutput(ghi,temp,capacityKwp=DEFAULT_SYSTEM.solarKwp,derate=.82){const irradiance=clamp(Number(ghi||0)/1000,0,1.25);const tempPenalty=Number(temp)>25?clamp(1-(Number(temp)-25)*.004,.82,1):1;return Math.round(capacityKwp*irradiance*derate*tempPenalty*1000)/1000}

async function getLiveWeather(){
  try{
    const u=new URL('https://api.open-meteo.com/v1/forecast');
    u.searchParams.set('latitude',DEFAULT_SYSTEM.lat);u.searchParams.set('longitude',DEFAULT_SYSTEM.lon);u.searchParams.set('forecast_days','2');u.searchParams.set('timezone','auto');
    u.searchParams.set('current','temperature_2m,relative_humidity_2m,cloud_cover,wind_speed_10m');
    u.searchParams.set('hourly','temperature_2m,relative_humidity_2m,cloud_cover,precipitation,shortwave_radiation,direct_normal_irradiance,diffuse_radiation,wind_speed_10m');
    const r=await fetch(u);if(!r.ok)throw new Error(`Open-Meteo HTTP ${r.status}`);const d=await r.json();const h=d.hourly||{};
    return{source:'Open-Meteo direct',coordinates:{latitude:d.latitude,longitude:d.longitude},timezone:d.timezone,capacityKwp:DEFAULT_SYSTEM.solarKwp,derate:.82,current:d.current,hourly:{time:h.time||[],temperatureC:h.temperature_2m||[],humidityPct:h.relative_humidity_2m||[],cloudCoverPct:h.cloud_cover||[],precipitationMm:h.precipitation||[],ghiWm2:h.shortwave_radiation||[],dniWm2:h.direct_normal_irradiance||[],diffuseWm2:h.diffuse_radiation||[],windSpeedKmh:h.wind_speed_10m||[],estimatedSolarKw:(h.time||[]).map((_,i)=>estimatePvOutput(h.shortwave_radiation?.[i],h.temperature_2m?.[i]))},methodology:'Direct browser Open-Meteo weather with transparent PV engineering estimate.'}
  }catch(directErr){
    console.warn('Direct Open-Meteo unavailable; using EnergyGuard proxy.',directErr);
    return await api(`/api/weather?lat=${DEFAULT_SYSTEM.lat}&lon=${DEFAULT_SYSTEM.lon}&days=2&capacity_kwp=${DEFAULT_SYSTEM.solarKwp}`);
  }
}

const nav=$('.navbar');window.addEventListener('scroll',()=>nav?.classList.toggle('scrolled',window.scrollY>40),{passive:true});
const toggle=$('.menu-toggle');const menu=$('.nav-menu');toggle?.addEventListener('click',()=>{const open=menu.classList.toggle('open');toggle.setAttribute('aria-expanded',open);document.body.classList.toggle('menu-open',open)});$$('.nav-menu a').forEach(a=>a.addEventListener('click',()=>{menu?.classList.remove('open');toggle?.setAttribute('aria-expanded','false');document.body.classList.remove('menu-open')}));
const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible')}),{threshold:.12});$$('.reveal').forEach(el=>io.observe(el));
const counterObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(!entry.isIntersecting)return;const el=entry.target;if(el.dataset.done)return;el.dataset.done='1';const target=Number(el.dataset.target||0);const start=performance.now();const duration=900;const tick=t=>{const p=Math.min(1,(t-start)/duration);const eased=1-Math.pow(1-p,3);el.textContent=Math.round(target*eased);if(p<1)requestAnimationFrame(tick)};requestAnimationFrame(tick)}),{threshold:.8});$$('.counter').forEach(el=>counterObserver.observe(el));
const glow=$('.cursor-glow');window.addEventListener('mousemove',e=>{if(!glow)return;glow.style.left=e.clientX+'px';glow.style.top=e.clientY+'px';glow.style.opacity='1'},{passive:true});window.addEventListener('mouseleave',()=>{if(glow)glow.style.opacity='0'});

const tabs=$$('.chart-tabs button');const line=$('.line-path');const area=$('.area-path');
const staticSolarLine='M0 185 C80 185 110 182 150 160 C200 130 215 78 265 45 C315 12 366 18 410 60 C458 105 492 145 545 163 C585 177 610 184 640 185';const staticLoadLine='M0 142 C52 128 92 135 140 122 C188 108 210 132 265 118 C312 105 350 126 394 110 C444 92 477 110 515 74 C553 38 594 58 640 82';
function seriesPath(values){if(!values?.length)return '';const arr=values.slice(0,24);const max=Math.max(...arr,1);const min=Math.min(...arr,0);const range=Math.max(.2,max-min);return arr.map((v,i)=>`${i?'L':'M'}${(i/(arr.length-1||1)*640).toFixed(1)} ${(190-((v-min)/range)*155).toFixed(1)}`).join(' ')}
function setChart(series){const values=series==='solar'?liveState.solar:liveState.load;const fallback=series==='solar'?staticSolarLine:staticLoadLine;const p=values?.length?seriesPath(values):fallback;line?.setAttribute('d',p);area?.setAttribute('d',p+' L640 210 L0 210Z');if(line)line.style.stroke=series==='solar'?'#c8ff62':'#6fb6ff'}tabs.forEach(btn=>btn.addEventListener('click',()=>{tabs.forEach(x=>x.classList.remove('active'));btn.classList.add('active');setChart(btn.dataset.series==='solar'?'solar':'load')}));
let toastTimer;function showToast(title,subtitle){const toast=$('#toast');if(!toast)return;$('strong',toast).textContent=title;$('span',toast).textContent=subtitle;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),4200)}
function currentHourIndex(times,currentTime){if(!times?.length)return 0;const key=String(currentTime||'').slice(0,13);let idx=key?times.findIndex(t=>String(t).slice(0,13)===key):-1;if(idx<0&&key)idx=times.findIndex(t=>String(t).slice(0,13)>key);return idx<0?0:idx}
function updateDashboard(){const metrics=$$('.dash-metrics .metric');if(metrics.length<4||!liveState.weather||!liveState.optimization)return;const solar=liveState.solar[0]||0;const load=liveState.load[0]||0;const step=liveState.optimization.schedule?.[0]||{};const solarStrong=$('strong',metrics[0]);if(solarStrong)solarStrong.innerHTML=`${fmt(solar)} <em>kW</em>`;const solarSpan=$('span',metrics[0]);if(solarSpan)solarSpan.textContent=liveState.weather.source||'Live forecast';const loadStrong=$('strong',metrics[1]);if(loadStrong)loadStrong.innerHTML=`${fmt(load)} <em>kW</em>`;const loadSpan=$('span',metrics[1]);if(loadSpan)loadSpan.textContent=liveState.loadModel==='transparent-baseline-v1'?'Fallback baseline':`${liveState.loadModel} · trained UCI`;const battStrong=$('strong',metrics[2]);if(battStrong)battStrong.innerHTML=`${fmt(step.socPct,1)} <em>%</em>`;const battSpan=$('span',metrics[2]);if(battSpan)battSpan.textContent=step.chargeKw>0?`Charging +${fmt(step.chargeKw)} kW`:step.dischargeKw>0?`Discharging ${fmt(step.dischargeKw)} kW`:'Holding';const gridStrong=$('strong',metrics[3]);if(gridStrong)gridStrong.innerHTML=`${fmt(step.gridImportKw||step.gridExportKw)} <em>kW</em>`;const gridSpan=$('span',metrics[3]);if(gridSpan){gridSpan.textContent=step.gridExportKw>0?'Exporting':step.gridImportKw>0?'Importing':'Grid neutral';gridSpan.classList.toggle('up',step.gridExportKw>0)}setChart($('.chart-tabs button.active')?.dataset.series||'solar')}

async function hydrateLiveEnergy(){try{
  const weather=await getLiveWeather();liveState.weather=weather;const h=weather.hourly||{};const start=currentHourIndex(h.time,weather.current?.time);
  const rows=(h.time||[]).slice(start,start+24).map((t,i)=>{const j=start+i;return{hour:Number(String(t).slice(11,13)),weekday:new Date(String(t).slice(0,10)+'T12:00:00').getDay(),month:Number(String(t).slice(5,7)),temperatureC:h.temperatureC?.[j],humidityPct:h.humidityPct?.[j],windSpeedKmh:h.windSpeedKmh?.[j]??weather.current?.wind_speed_10m,ghiWm2:h.ghiWm2?.[j],diffuseWm2:h.diffuseWm2?.[j]}});
  let loadResp;
  try{loadResp=await mlApi('/predict',{method:'POST',body:JSON.stringify({baseLoadKw:DEFAULT_SYSTEM.dailyConsumptionKwh/24,hours:rows})});liveState.loadModel=loadResp.algorithm||loadResp.model||'trained-ml';liveState.loadBenchmark=loadResp.benchmark||null}
  catch(mlErr){console.warn('ML service unavailable; using transparent baseline.',mlErr);loadResp=await api('/api/predict/load',{method:'POST',body:JSON.stringify({baseLoadKw:DEFAULT_SYSTEM.dailyConsumptionKwh/24,hours:rows})});liveState.loadModel=loadResp.model||'transparent-baseline-v1';liveState.loadBenchmark=null}
  liveState.load=loadResp.forecast.map(x=>x.predictedLoadKw);liveState.solar=(h.estimatedSolarKw||[]).slice(start,start+24);
  liveState.optimization=await api('/api/optimize/bess',{method:'POST',body:JSON.stringify({solarKw:liveState.solar,loadKw:liveState.load,batteryCapacityKwh:DEFAULT_SYSTEM.batteryKwh,initialSocPct:DEFAULT_SYSTEM.initialSocPct,minSocPct:15,maxSocPct:95,maxChargeKw:5,maxDischargeKw:5,roundTripEfficiency:.90})});
  updateDashboard();const status=$('.dash-status');if(status)status.innerHTML=`<span></span> Live · ${weather.source||'weather'} · ${liveState.loadModel}`
}catch(err){console.warn('Live EnergyGuard data unavailable:',err);const status=$('.dash-status');if(status)status.innerHTML='<span></span> Demo mode · live data unavailable'}}

const advisorBtn=$('#advisor-btn');advisorBtn?.addEventListener('click',async()=>{const old=advisorBtn.innerHTML;advisorBtn.disabled=true;advisorBtn.innerHTML='Đang phân tích…';try{if(!liveState.load.length)await hydrateLiveEnergy();const result=await api('/api/advisor',{method:'POST',body:JSON.stringify({solarKw:liveState.solar,loadKw:liveState.load,initialSocPct:liveState.optimization?.schedule?.[0]?.socPct||DEFAULT_SYSTEM.initialSocPct})});const first=result.recommendations?.[0];advisorBtn.innerHTML='Đã tạo khuyến nghị ✓';showToast(first?.title||'AI Energy Advisor',first?.message||'Đã phân tích hồ sơ năng lượng.')}catch(err){advisorBtn.innerHTML='Thử lại';showToast('Không thể gọi Energy Advisor',err.message)}finally{setTimeout(()=>{advisorBtn.innerHTML=old;advisorBtn.disabled=false},1800)}});

const consumption=$('#consumption');const solarSize=$('#solar-size');function updateCalc(){if(!consumption||!solarSize)return;const c=Number(consumption.value);const s=Number(solarSize.value);const gen=Math.round(s*113.5);const coverage=Math.max(0,Math.min(100,Math.round(gen/c*100)));const grid=Math.max(0,c-gen);const co2=Math.round(gen*.716);$('#consumption-value').textContent=c.toLocaleString('vi-VN');$('#solar-value').textContent=s;$('#generation').textContent=gen.toLocaleString('vi-VN')+' kWh';$('#grid-use').textContent=grid.toLocaleString('vi-VN')+' kWh';$('#coverage').textContent=coverage+'%';$('#co2').textContent=co2.toLocaleString('vi-VN')+' kg';const ring=$('.ring-progress');if(ring)ring.style.strokeDashoffset=308-(308*coverage/100)}consumption?.addEventListener('input',updateCalc);solarSize?.addEventListener('input',updateCalc);updateCalc();
$('#contact-form')?.addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;const btn=$('button[type="submit"]',form);const old=btn.innerHTML;btn.innerHTML='Đang gửi…';btn.disabled=true;const fd=new FormData(form);const message=[fd.get('message')||'','SĐT: '+(fd.get('phone')||'Không cung cấp'),'Loại dự án: '+(fd.get('type')||'Khác')].join('\n');try{const result=await api('/api/contact',{method:'POST',body:JSON.stringify({name:fd.get('name'),email:fd.get('email'),message})});showToast('Đã nhận yêu cầu!',`Mã yêu cầu: ${result.id}`);form.reset()}catch(err){showToast('Gửi yêu cầu chưa thành công',err.message)}finally{btn.innerHTML=old;btn.disabled=false}});
$$('.dash-sidebar button').forEach(btn=>btn.addEventListener('click',()=>{$$('.dash-sidebar button').forEach(x=>x.classList.remove('active'));btn.classList.add('active')}));hydrateLiveEnergy();

// Homepage authentication/account control.
(function initHomepageAccountMenu(){
  const navMenu=document.querySelector('.nav-menu');
  if(!navMenu||document.querySelector('.nav-account-wrap'))return;
  const SESSION_KEY='energyguard_session_v1';
  const USER_KEY='energyguard_user_v1';
  const AUTH_BASE='https://energyguard-auth.onrender.com';
  const style=document.createElement('style');
  style.textContent=`
    .nav-account-wrap{position:relative;display:flex;align-items:center;margin-left:2px}
    .nav-login-link,.nav-user-btn{min-height:42px;padding:0 16px;border-radius:999px;border:1px solid rgba(255,255,255,.13);background:rgba(255,255,255,.055);color:#f3f8f4!important;display:inline-flex;align-items:center;gap:9px;text-decoration:none!important;font:700 13px/1 DM Sans,sans-serif;white-space:nowrap;transition:.2s ease;cursor:pointer}
    .nav-login-link:hover,.nav-user-btn:hover{border-color:rgba(200,255,98,.5);background:rgba(200,255,98,.09);color:#dfffad!important}
    .nav-user-btn{font-family:inherit}.nav-user-avatar{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:#c8ff62;color:#0b2517;font-size:11px;font-weight:900;overflow:hidden}.nav-user-avatar img{width:100%;height:100%;object-fit:cover}.nav-chevron{font-size:10px;opacity:.65;transition:transform .2s}.nav-account-wrap.open .nav-chevron{transform:rotate(180deg)}
    .nav-account-menu{position:absolute;top:calc(100% + 12px);right:0;width:210px;padding:8px;background:#0b2017;border:1px solid rgba(255,255,255,.1);border-radius:16px;box-shadow:0 18px 50px rgba(0,0,0,.38);display:none;z-index:100}.nav-account-wrap.open .nav-account-menu{display:grid}.nav-account-menu a,.nav-account-menu button{width:100%;border:0;background:transparent;color:#e9f4ed!important;text-align:left;padding:11px 12px;border-radius:10px;text-decoration:none!important;font:600 13px/1.2 DM Sans,sans-serif;cursor:pointer}.nav-account-menu a:hover,.nav-account-menu button:hover{background:rgba(255,255,255,.07)}.nav-account-menu .logout{color:#ffb6b6!important;border-top:1px solid rgba(255,255,255,.07);margin-top:4px;padding-top:12px}
    @media(max-width:980px){.nav-account-wrap{width:100%;display:block;margin:8px 0 0}.nav-login-link,.nav-user-btn{width:100%;justify-content:center;min-height:46px}.nav-account-menu{position:static;width:100%;margin-top:8px;box-shadow:none;background:rgba(255,255,255,.035)}.nav-account-wrap.open .nav-account-menu{display:grid}}
  `;
  document.head.appendChild(style);
  const wrap=document.createElement('div');wrap.className='nav-account-wrap';navMenu.appendChild(wrap);
  let user=null;try{user=JSON.parse(localStorage.getItem(USER_KEY)||'null')}catch{}
  const token=localStorage.getItem(SESSION_KEY)||'';
  const renderLoggedOut=()=>{wrap.classList.remove('open');wrap.innerHTML='<a class="nav-login-link" href="login.html" aria-label="Đăng nhập EnergyGuard"><span>👤</span><span>Đăng nhập</span></a>'};
  const renderLoggedIn=u=>{
    const display=String(u?.name||u?.email||'Tài khoản').trim();const first=display.split(/\s+/)[0]||'Tài khoản';
    const avatar=u?.picture?`<span class="nav-user-avatar"><img src="${String(u.picture).replace(/"/g,'&quot;')}" alt=""></span>`:`<span class="nav-user-avatar">${first.slice(0,1).toUpperCase()}</span>`;
    wrap.innerHTML=`<button class="nav-user-btn" type="button" aria-expanded="false">${avatar}<span>${first}</span><span class="nav-chevron">▼</span></button><div class="nav-account-menu"><a href="dashboard.html">Dashboard</a><a href="account.html">Tài khoản</a><a href="history.html">Lịch sử dự báo</a><a href="analytics.html">Energy Analytics</a><button class="logout" type="button">Đăng xuất</button></div>`;
    const btn=wrap.querySelector('.nav-user-btn');btn?.addEventListener('click',e=>{e.stopPropagation();const open=wrap.classList.toggle('open');btn.setAttribute('aria-expanded',String(open))});
    wrap.querySelector('.logout')?.addEventListener('click',async()=>{try{await fetch(AUTH_BASE+'/logout',{method:'POST',headers:{Authorization:`Bearer ${localStorage.getItem(SESSION_KEY)||''}`}})}catch{}localStorage.removeItem(SESSION_KEY);localStorage.removeItem(USER_KEY);renderLoggedOut()});
  };
  document.addEventListener('click',e=>{if(!wrap.contains(e.target))wrap.classList.remove('open')});
  if(!token){renderLoggedOut();return}
  if(user)renderLoggedIn(user);else renderLoggedOut();
  fetch(AUTH_BASE+'/me',{headers:{Authorization:`Bearer ${token}`}}).then(async r=>{if(!r.ok)throw new Error('invalid session');return r.json()}).then(me=>{if(me?.user){localStorage.setItem(USER_KEY,JSON.stringify(me.user));renderLoggedIn(me.user)}}).catch(()=>{localStorage.removeItem(SESSION_KEY);localStorage.removeItem(USER_KEY);renderLoggedOut()});
})();
