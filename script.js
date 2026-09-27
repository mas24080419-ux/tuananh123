const $=(s,c=document)=>c.querySelector(s);const $$=(s,c=document)=>[...c.querySelectorAll(s)];

const nav=$('.navbar');
window.addEventListener('scroll',()=>nav.classList.toggle('scrolled',window.scrollY>40),{passive:true});

const toggle=$('.menu-toggle');const menu=$('.nav-menu');
toggle?.addEventListener('click',()=>{const open=menu.classList.toggle('open');toggle.setAttribute('aria-expanded',open);document.body.classList.toggle('menu-open',open)});
$$('.nav-menu a').forEach(a=>a.addEventListener('click',()=>{menu.classList.remove('open');toggle?.setAttribute('aria-expanded','false');document.body.classList.remove('menu-open')}));

const io=new IntersectionObserver(entries=>entries.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible')}),{threshold:.12});
$$('.reveal').forEach(el=>io.observe(el));

const counterObserver=new IntersectionObserver(entries=>entries.forEach(entry=>{if(!entry.isIntersecting)return;const el=entry.target;if(el.dataset.done)return;el.dataset.done='1';const target=Number(el.dataset.target||0);const start=performance.now();const duration=900;const tick=t=>{const p=Math.min(1,(t-start)/duration);const eased=1-Math.pow(1-p,3);el.textContent=Math.round(target*eased);if(p<1)requestAnimationFrame(tick)};requestAnimationFrame(tick)}),{threshold:.8});
$$('.counter').forEach(el=>counterObserver.observe(el));

const glow=$('.cursor-glow');
window.addEventListener('mousemove',e=>{if(!glow)return;glow.style.left=e.clientX+'px';glow.style.top=e.clientY+'px';glow.style.opacity='1'},{passive:true});
window.addEventListener('mouseleave',()=>{if(glow)glow.style.opacity='0'});

const tabs=$$('.chart-tabs button');
const line=$('.line-path');const area=$('.area-path');
const solarLine='M0 185 C80 185 110 182 150 160 C200 130 215 78 265 45 C315 12 366 18 410 60 C458 105 492 145 545 163 C585 177 610 184 640 185';
const solarArea=solarLine+' L640 210 L0 210Z';
const loadLine='M0 142 C52 128 92 135 140 122 C188 108 210 132 265 118 C312 105 350 126 394 110 C444 92 477 110 515 74 C553 38 594 58 640 82';
const loadArea=loadLine+' L640 210 L0 210Z';
tabs.forEach(btn=>btn.addEventListener('click',()=>{tabs.forEach(x=>x.classList.remove('active'));btn.classList.add('active');const solar=btn.dataset.series==='solar';line?.setAttribute('d',solar?solarLine:loadLine);area?.setAttribute('d',solar?solarArea:loadArea);if(line)line.style.stroke=solar?'#c8ff62':'#6fb6ff'}));

const advisorBtn=$('#advisor-btn');
advisorBtn?.addEventListener('click',()=>{advisorBtn.disabled=true;advisorBtn.innerHTML='Đang tối ưu…';setTimeout(()=>{advisorBtn.innerHTML='Đã tạo lịch tối ưu ✓';advisorBtn.style.background='#ffffff';advisorBtn.style.color='#0a2b20';showToast('Lịch năng lượng đã sẵn sàng','Demo đã tối ưu lịch Solar · Battery · EV cho hôm nay.');advisorBtn.disabled=false},650)});

const consumption=$('#consumption');const solarSize=$('#solar-size');
function updateCalc(){if(!consumption||!solarSize)return;const c=Number(consumption.value);const s=Number(solarSize.value);const gen=Math.round(s*113.5);const coverage=Math.max(0,Math.min(100,Math.round(gen/c*100)));const grid=Math.max(0,c-gen);const co2=Math.round(gen*.716);$('#consumption-value').textContent=c.toLocaleString('vi-VN');$('#solar-value').textContent=s;$('#generation').textContent=gen.toLocaleString('vi-VN')+' kWh';$('#grid-use').textContent=grid.toLocaleString('vi-VN')+' kWh';$('#coverage').textContent=coverage+'%';$('#co2').textContent=co2.toLocaleString('vi-VN')+' kg';const ring=$('.ring-progress');if(ring)ring.style.strokeDashoffset=308-(308*coverage/100)}
consumption?.addEventListener('input',updateCalc);solarSize?.addEventListener('input',updateCalc);updateCalc();

let toastTimer;function showToast(title,subtitle){const toast=$('#toast');if(!toast)return;$('strong',toast).textContent=title;$('span',toast).textContent=subtitle;toast.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toast.classList.remove('show'),3200)}

$('#contact-form')?.addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget;const btn=$('button[type="submit"]',form);const old=btn.innerHTML;btn.innerHTML='Đang gửi…';btn.disabled=true;setTimeout(()=>{showToast('Đã nhận yêu cầu!','Đây là bản demo giao diện. Form backend sẽ được kết nối ở bước tiếp theo.');form.reset();btn.innerHTML=old;btn.disabled=false},550)});

$$('.dash-sidebar button').forEach(btn=>btn.addEventListener('click',()=>{$$('.dash-sidebar button').forEach(x=>x.classList.remove('active'));btn.classList.add('active')}));
