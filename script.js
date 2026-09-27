const $=(s,c=document)=>c.querySelector(s);const $$=(s,c=document)=>[...c.querySelectorAll(s)];
const API_BASE='https://energyguard-api.onrender.com';
const DEFAULT_SYSTEM={lat:21.0285,lon:105.8542,solarKwp:5,batteryKwh:10,dailyConsumptionKwh:20,initialSocPct:60};
const liveState={weather:null,load:[],solar:[],optimization:null};

async function api(path,options={}){const r=await fetch(API_BASE+path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});const data=await r.json().catch(()=>({}));if(!r.ok)throw new Error(data.error||`HTTP ${r.status}`);return data}
function fmt(v,d=2){return Number(v||0).toLocaleString('vi-VN',{maximumFractionDigits:d})}

const nav=$('.navbar');
window.addEventListener('scroll',()=>nav?.classList.toggle('scrolled',window.scrollY>40),{passive:true});

const toggle=$('.menu-toggle');const menu=$('.nav-menu');
toggle?.addEventListener('click',()=>{const open=menu.classList.toggle('open');toggle.setAttribute('aria-expanded',open);document.body.classList.toggle('menu-open',open)});
$$('.nav-menu a').forEach(a=>a.addEventListener('click',()=>{menu?.classList.remove('open');toggle?.setAttribute('aria-expanded','false');document.body.classList.remove('menu-open')}));

const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible')}),{threshold:.12});
$$('.reveal').forEach(el=>io.observe(el));

const counterObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(!entry.isIntersecting)return;const el=entry.target;if(el.dataset.done)return;el.dataset.done='1';const target=Number(el.dataset.target||0);const start=performance.now();const duration=900;const tick=t=>{const p=Math.min(1,(t-start)/duration);const eased=1-Math.pow(1-p,3);el.textContent=Math.round(target*eased);if(p<1)requestAnimationFrame(tick)};requestAnimationFrame(tick)}),{threshold:.8});
$$('.counter').forEach(el=>counterObserver.observe(el));

const glow=$('.cursor-glow');
window.addEventListener('mousemove',e=>{if(!glow)return;glow.style.left=e.clientX+'px';glow.style.top=e.clientY+'px';glow.style.opacity='1'},{passive:true});
window.addEventListener('mouseleave',()=>{if(glow)glow.style.opacity='0'});

const tabs=$$('.chart-tabs button');
const line=$('.line-path');const area=$('.area-path');
const staticSolarLine='M0 185 C80 185 110 182 150 160 C200 130 215 78 265 45 C315 12 366 18 410 60 C458 105 492 145 545 163 C585 177 610 184 640 185';
const staticLoadLine='M0 142 C52 128 92 135 140 122 C188 108 210 132 265 118 C312 105 350 126 394 110 C444 92 477 110 515 74 C553 38 594 58 640 82';
function seriesPath(values){if(!values?.length)return '';const arr=values.slice(0,24);const max=Math.max(...arr,1);const min=Math.min(...arr,0);const range=Math.max(.2,max-min);return arr.map((v,i)=>`${i?'L':'M'}${(i/(arr.length-1||1)*640).toFixed(1)} ${(190-((v-min)/range)*155).toFixed(1)}`).join(' ')}
function setChart(series){const values=series==='solar'?liveState.solar:liveState.load;const fallback=series==='solar'?staticSolarLine:staticLoadLine;const p=values?.length?seriesPath(values):fallback;line?.setAttribute('d',p);area?.setAttribute('d',p+' L640 210 L0 210Z');if(line)line.style.stroke=series==='solar'?'#c8ff62':'#6fb6ff'}
tabs.forEach(btn=>btn.addEventListener('click',()=>{tabs.forEach(x=>x.classList.remove('active'));btn.classList.add('active');setChart(btn.dataset.series==='solar'?'solar':'load')}));

let toastTimer;function showToast(title,subtitle){const toast=$('#toast');if(!toast)return;$('strong',toast).textContent=title;$('span',toast).textContent=subtitle;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),4200)}

function currentHourIndex(times,currentTime){if(!times?.length)return 0;const key=String(currentTime||'').slice(0,13);let idx=key?times.findIndex(t=>String(t).slice(0,13)===key):-1;if(idx<0&&key)idx=times.findIndex(t=>String(t).slice(0,13)>key);return idx<0?0:idx}
function updateDashboard(){const metrics=$$('.dash-metrics .metric');if(metrics.length<4||!liveState.weather||!liveState.optimization)return;const idx=0;const solar=liveState.solar[idx]||0;const load=liveState.load[idx]||0;const step=liveState.optimization.schedule?.[idx]||{};
  const solarStrong=$('strong',metrics[0]);if(solarStrong)solarStrong.innerHTML=`${fmt(solar)} <em>kW</em>`;const solarSpan=$('span',metrics[0]);if(solarSpan)solarSpan.textContent='Open-Meteo live forecast';
  const loadStrong=$('strong',metrics[1]);if(loadStrong)loadStrong.innerHTML=`${fmt(load)} <em>kW</em>`;const loadSpan=$('span',metrics[1]);if(loadSpan)loadSpan.textContent='Baseline forecast';
  const battStrong=$('strong',metrics[2]);if(battStrong)battStrong.innerHTML=`${fmt(step.socPct,1)} <em>%</em>`;const battSpan=$('span',metrics[2]);if(battSpan)battSpan.textContent=step.chargeKw>0?`Charging +${fmt(step.chargeKw)} kW`:step.dischargeKw>0?`Discharging ${fmt(step.dischargeKw)} kW`:'Holding';
  const gridStrong=$('strong',metrics[3]);if(gridStrong)gridStrong.innerHTML=`${fmt(step.gridImportKw||step.gridExportKw)} <em>kW</em>`;const gridSpan=$('span',metrics[3]);if(gridSpan){gridSpan.textContent=step.gridExportKw>0?'Exporting':step.gridImportKw>0?'Importing':'Grid neutral';gridSpan.classList.toggle('up',step.gridExportKw>0)}
  setChart($('.chart-tabs button.active')?.dataset.series||'solar');
}

async function hydrateLiveEnergy(){try{
  const weather=await api(`/api/weather?lat=${DEFAULT_SYSTEM.lat}&lon=${DEFAULT_SYSTEM.lon}&days=2&capacity_kwp=${DEFAULT_SYSTEM.solarKwp}`);liveState.weather=weather;
  const start=currentHourIndex(weather.hourly.time,weather.current?.time);const rows=weather.hourly.time.slice(start,start+24).map((t,i)=>{const j=start+i;return{hour:Number(String(t).slice(11,13)),temperatureC:weather.hourly.temperatureC[j],humidityPct:weather.hourly.humidityPct[j],weekday:new Date(String(t).slice(0,10)+'T12:00:00').getDay()}});
  const loadResp=await api('/api/predict/load',{method:'POST',body:JSON.stringify({baseLoadKw:DEFAULT_SYSTEM.dailyConsumptionKwh/24,hours:rows})});
  liveState.load=loadResp.forecast.map(x=>x.predictedLoadKw);liveState.solar=weather.hourly.estimatedSolarKw.slice(start,start+24);
  liveState.optimization=await api('/api/optimize/bess',{method:'POST',body:JSON.stringify({solarKw:liveState.solar,loadKw:liveState.load,batteryCapacityKwh:DEFAULT_SYSTEM.batteryKwh,initialSocPct:DEFAULT_SYSTEM.initialSocPct,minSocPct:15,maxSocPct:95,maxChargeKw:5,maxDischargeKw:5,roundTripEfficiency:.90})});
  updateDashboard();
  const status=$('.dash-status');if(status)status.innerHTML='<span></span> Live API · Open-Meteo connected';
}catch(err){console.warn('Live EnergyGuard data unavailable:',err);const status=$('.dash-status');if(status)status.innerHTML='<span></span> Demo mode · API warming up';}}

const advisorBtn=$('#advisor-btn');
advisorBtn?.addEventListener('click',async()=>{const old=advisorBtn.innerHTML;advisorBtn.disabled=true;advisorBtn.innerHTML='Đang phân tích…';try{if(!liveState.load.length)await hydrateLiveEnergy();const result=await api('/api/advisor',{method:'POST',body:JSON.stringify({solarKw:liveState.solar,loadKw:liveState.load,initialSocPct:liveState.optimization?.schedule?.[0]?.socPct||DEFAULT_SYSTEM.initialSocPct})});const first=result.recommendations?.[0];advisorBtn.innerHTML='Đã tạo khuyến nghị ✓';showToast(first?.title||'AI Energy Advisor',first?.message||'Đã phân tích hồ sơ năng lượng.')}catch(err){advisorBtn.innerHTML='Thử lại';showToast('Không thể gọi Energy Advisor',err.message)}finally{setTimeout(()=>{advisorBtn.innerHTML=old;advisorBtn.disabled=false},1800)}});

const consumption=$('#consumption');const solarSize=$('#solar-size');
function updateCalc(){if(!consumption||!solarSize)return;const c=Number(consumption.value);const s=Number(solarSize.value);const gen=Math.round(s*113.5);const coverage=Math.max(0,Math.min(100,Math.round(gen/c*100)));const grid=Math.max(0,c-gen);const co2=Math.round(gen*.716);$('#consumption-value').textContent=c.toLocaleString('vi-VN');$('#solar-value').textContent=s;$('#generation').textContent=gen.toLocaleString('vi-VN')+' kWh';$('#grid-use').textContent=grid.toLocaleString('vi-VN')+' kWh';$('#coverage').textContent=coverage+'%';$('#co2').textContent=co2.toLocaleString('vi-VN')+' kg';const ring=$('.ring-progress');if(ring)ring.style.strokeDashoffset=308-(308*coverage/100)}
consumption?.addEventListener('input',updateCalc);solarSize?.addEventListener('input',updateCalc);updateCalc();

$('#contact-form')?.addEventListener('submit',async e=>{e.preventDefault();const form=e.currentTarget;const btn=$('button[type="submit"]',form);const old=btn.innerHTML;btn.innerHTML='Đang gửi…';btn.disabled=true;const fd=new FormData(form);const message=[fd.get('message')||'','SĐT: '+(fd.get('phone')||'Không cung cấp'),'Loại dự án: '+(fd.get('type')||'Khác')].join('\n');try{const result=await api('/api/contact',{method:'POST',body:JSON.stringify({name:fd.get('name'),email:fd.get('email'),message})});showToast('Đã nhận yêu cầu!',`Mã yêu cầu: ${result.id}`);form.reset()}catch(err){showToast('Gửi yêu cầu chưa thành công',err.message)}finally{btn.innerHTML=old;btn.disabled=false}});

$$('.dash-sidebar button').forEach(btn=>btn.addEventListener('click',()=>{$$('.dash-sidebar button').forEach(x=>x.classList.remove('active'));btn.classList.add('active')}));

hydrateLiveEnergy();
