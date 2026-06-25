const express=require('express');
const session=require('express-session');
const path=require('path');
const fs=require('fs');
const data=require('./data');
const { screen, RECLABEL, STATUSES, suggestion } = require('./screening');

const app=express();
app.set('trust proxy', 1); // secure cookies work behind a host's HTTPS proxy (Render/Railway)
const PORT=process.env.PORT||3000;
const ADMIN_PASSWORD=process.env.ADMIN_PASSWORD||'gower';
const SESSION_SECRET=process.env.SESSION_SECRET||'change-me-in-production';
if(ADMIN_PASSWORD==='gower') console.warn('[warn] Using default admin password "gower". Set ADMIN_PASSWORD before going live.');

// Email alerts (Resend). Set RESEND_API_KEY in the environment to enable.
const RESEND_API_KEY=process.env.RESEND_API_KEY||'';
const MAIL_TO=process.env.MAIL_TO||'mail@gowercapitalgroup.com';
const MAIL_FROM=process.env.MAIL_FROM||'Gower Applications <onboarding@resend.dev>';
const PUBLIC_URL=process.env.PUBLIC_URL||'https://gower-websites.onrender.com';

async function notifyNewApplication(rec){
  if(!RESEND_API_KEY){ console.log('[email] RESEND_API_KEY not set — skipping alert'); return; }
  const sug=suggestion(rec.verdict);
  const name=((rec.firstName||'')+' '+(rec.lastName||'')).trim()||'Unknown applicant';
  const esc=v=>String(v==null?'':v).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  const reasons=(rec.reasons||[]).map(x=>'• '+esc(x)).join('<br>');
  const flags=(rec.flags||[]).map(x=>'⚠ '+esc(x)).join('<br>');
  const colour={ACCEPT:'#2E7D52',MAYBE:'#B97A0B',REJECT:'#C0392B'}[sug]||'#1E3A53';
  const rows=[
    ['Suggestion', sug+' ('+(RECLABEL[rec.verdict]||rec.verdict)+')'],
    ['Age', rec.age==null?'?':rec.age],
    ['Benefits', (rec.benefit||[]).join(', ')+(rec.pip?' — on PIP':'')],
    ['Situation', rec.situation||''],
    ['Phone', rec.phone||''],['Email', rec.email||'']
  ].map(([k,v])=>`<tr><td style="padding:3px 12px 3px 0;color:#5b6770">${k}</td><td style="padding:3px 0"><b>${esc(v)}</b></td></tr>`).join('');
  const html=`<div style="font-family:Arial,Helvetica,sans-serif;color:#0A1D2E">
    <p style="font-size:13px;color:#5b6770;margin:0 0 4px">New housing application</p>
    <h2 style="margin:0 0 2px">${esc(name)}</h2>
    <p style="margin:0 0 14px"><span style="background:${colour};color:#fff;border-radius:999px;padding:3px 12px;font-weight:700">${sug}</span> &nbsp;<span style="color:#5b6770">${esc(rec.site||'')} · ${new Date(rec.created_at).toLocaleString('en-GB')}</span></p>
    <table style="font-size:14px;border-collapse:collapse">${rows}</table>
    ${reasons?`<p style="font-size:14px"><b>Why:</b><br>${reasons}</p>`:''}
    ${flags?`<p style="font-size:14px;color:#b00"><b>Flags:</b><br>${flags}</p>`:''}
    <p style="font-size:14px"><a href="${PUBLIC_URL}/admin">Open the admin dashboard →</a></p>
  </div>`;
  const res=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{'Authorization':'Bearer '+RESEND_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({from:MAIL_FROM,to:[MAIL_TO],subject:`New application: ${name} — ${sug}`,html})
  });
  if(!res.ok){ throw new Error('Resend '+res.status+' '+(await res.text()).slice(0,200)); }
  console.log('[email] alert sent for', name, '->', sug);
}

const PUB=path.join(__dirname,'public');

app.use(express.json({limit:'2mb'})); // 2mb so the on-screen signature image fits
app.use(express.urlencoded({extended:true}));
app.use(session({
  name:'gower.sid',
  secret:SESSION_SECRET,
  resave:false,
  saveUninitialized:false,
  cookie:{ httpOnly:true, sameSite:'lax', secure:process.env.NODE_ENV==='production', maxAge:1000*60*60*8 }
}));

// ---- brand detection ----
function brandFromHost(host){
  return /gowercapital|capitalgroup/i.test(host||'') ? 'capital' : 'living';
}
const BRAND={
  living:{ name:'Gower Living', logo:'gower-living-wordmark-navy.svg', theme:'theme-living' },
  capital:{ name:'Gower Capital Group', logo:'gower-capital-wordmark-cream.svg', theme:'theme-capital' }
};

function renderApply(brand, homeHref){
  const b=BRAND[brand];
  let html=fs.readFileSync(path.join(PUB,'_apply.html'),'utf8');
  return html
    .replace(/{{THEME}}/g,b.theme)
    .replace(/{{LOGO}}/g,'/assets/svg/'+b.logo)
    .replace(/{{SITE}}/g,b.name)
    .replace(/{{HOME}}/g,homeHref);
}

// static assets (css, js, /assets/*) — but not index files at '/'
app.use(express.static(PUB,{index:false,redirect:false}));

// ---- public site routes ----
app.get('/',(req,res)=>{ const brand=brandFromHost(req.hostname); res.sendFile(path.join(PUB,brand,'index.html')); });
app.get('/apply',(req,res)=>{ const brand=brandFromHost(req.hostname); res.type('html').send(renderApply(brand,'/')); });

// local preview of both brands without DNS
app.get('/living',(req,res)=>res.sendFile(path.join(PUB,'living','index.html')));
app.get('/living/apply',(req,res)=>res.type('html').send(renderApply('living','/living')));
app.get('/capital',(req,res)=>res.sendFile(path.join(PUB,'capital','index.html')));
app.get('/capital/apply',(req,res)=>res.type('html').send(renderApply('capital','/capital')));

// ---- application intake ----
app.post('/api/apply',(req,res)=>{
  const r=req.body||{};
  const required=['firstName','lastName','dob','phone','email','situation','why','mptl','arrears','evicted','hasConv','probation','drug'];
  for(const k of required){ if(!r[k]||(''+r[k]).trim()===''){ return res.status(400).json({ok:false,error:'Missing field: '+k}); } }
  if(!r.consent1||!r.consent2) return res.status(400).json({ok:false,error:'Consent required'});
  const benefit=Array.isArray(r.benefit)?r.benefit:(r.benefit?[r.benefit]:[]);
  if(!benefit.length) return res.status(400).json({ok:false,error:'Select at least one benefit option'});
  const s=screen(r);
  const rec=Object.assign({},r,{
    benefit,
    site:r.site||BRAND[brandFromHost(req.hostname)].name,
    status:'New',
    verdict:s.rec, reasons:s.reasons, flags:s.flags, age:s.age, pip:s.pip, tempMonths:s.tempMonths
  });
  delete rec.password;
  data.add(rec);
  res.json({ok:true});
  notifyNewApplication(rec).catch(e=>console.error('[email] failed:', e.message));
});

// ---- auth ----
function requireAuth(req,res,next){ if(req.session&&req.session.auth) return next(); res.status(401).json({ok:false,error:'Not signed in'}); }
app.get('/api/me',(req,res)=>res.json({auth:!!(req.session&&req.session.auth)}));
app.post('/api/login',(req,res)=>{
  if((req.body.password||'')===ADMIN_PASSWORD){ req.session.auth=true; return res.json({ok:true}); }
  res.status(401).json({ok:false,error:'Wrong passcode'});
});
app.post('/api/logout',(req,res)=>{ req.session.destroy(()=>res.json({ok:true})); });

// ---- admin api ----
app.get('/api/applications',requireAuth,(req,res)=>{
  const rows=data.list().map(r=>{
    const s=screen(r); // recompute so rule tweaks always reflect
    return Object.assign({},r,{verdict:s.rec,reasons:s.reasons,flags:s.flags,age:s.age,pip:s.pip,tempMonths:s.tempMonths,status:r.status||'New'});
  });
  res.json({ok:true,rows});
});
app.patch('/api/applications/:id',requireAuth,(req,res)=>{
  const allowed=req.body.status;
  if(!STATUSES.includes(allowed)) return res.status(400).json({ok:false,error:'Bad status'});
  const updated=data.update(req.params.id,{status:allowed});
  if(!updated) return res.status(404).json({ok:false});
  res.json({ok:true});
});
app.get('/api/applications.csv',requireAuth,(req,res)=>{
  const cols=['created_at','site','status','firstName','lastName','dob','age','phone','email','ni','situation','tempProvider','tempSince','benefit','pip','ucHousing','income','mptl','arrears','evicted','hasConv','convCount','probation','drug','careLeaver','verdict'];
  const esc=v=>{ v=Array.isArray(v)?v.join('; '):(v==null?'':String(v)); v=v.replace(/"/g,'""'); return /[",\n]/.test(v)?`"${v}"`:v; };
  const rows=data.list().map(r=>{ const s=screen(r); const o=Object.assign({},r,{age:s.age,pip:s.pip,verdict:RECLABEL[s.rec]}); return cols.map(c=>esc(o[c])).join(','); });
  res.type('text/csv').attachment('gower-applications.csv').send(cols.join(',')+'\n'+rows.join('\n'));
});

// privacy policy (shared)
app.get('/privacy',(req,res)=>res.sendFile(path.join(PUB,'privacy.html')));

// admin page
app.get('/admin',(req,res)=>res.sendFile(path.join(PUB,'admin.html')));

// ---- Create New Tenancy (staff form + pack generator + email) ----
require('./tenancy')(app, { requireAuth, data, PUB });

app.listen(PORT,()=>{
  console.log('Gower sites running on http://localhost:'+PORT);
  console.log('  Gower Living  → http://localhost:'+PORT+'/living');
  console.log('  Capital Group → http://localhost:'+PORT+'/capital');
  console.log('  Admin         → http://localhost:'+PORT+'/admin  (passcode: '+ADMIN_PASSWORD+')');
});
