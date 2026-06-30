/* ============================================================================
 * portal.js — Gower staff operations portal
 * Mounts the hub sections onto the existing Express app:
 *   /admin/compliance   — property × certificate grid (RAG by expiry) + uploads
 *   /admin/properties    — property list + detail (condition reports + repairs)
 *   /admin/tenants       — tenant roster (created fresh as tenancies are made)
 * Plus JSON APIs and an auth-gated file download endpoint (/admin/dl).
 * Data lives on the persistent disk via store.js; files via storage.js.
 * Pure Node/Express, server-rendered HTML to match tenancy.js — no build step.
 * ========================================================================== */
const fs = require('fs'), path = require('path');
const store = require('./store');
const storage = require('./storage');

const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* ---- canonical compliance items (mirrors the audit tracker A1–A17) ---- */
const ITEMS = [
  ['A1','Building insurance'], ['A2','Gas safety'], ['A3A4','Fire alarm / smoke'],
  ['A5','Electrical (EICR)'], ['A6','Fire risk assessment'], ['A7','HMO licence'],
  ['A8','Legionella'], ['A9','Building cert'], ['A10A11','EPC'], ['A12','PAT'],
  ['A13','Rent Smart Wales'], ['A14','Emergency lighting'], ['A15','Fire extinguisher'],
  ['A16','Fire sprinkler'], ['A17','Asbestos']
];
const ITEM_NAME = Object.fromEntries(ITEMS.map(i => [i[0], i[1]]));

/* ---- seed compliance from the imported audit sheet on first run ---- */
function loadCompliance(){
  let doc = store.getDoc('compliance', null);
  if(doc && doc.props && doc.data) return doc;
  try {
    const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'compliance-seed.json'), 'utf8'));
    store.setDoc('compliance', seed);
    return seed;
  } catch(e){
    const empty = { items: ITEMS.map(i => ({code:i[0], name:i[1]})), props: [], data: {} };
    store.setDoc('compliance', empty);
    return empty;
  }
}

/* ---- RAG status from an expiry date ---- */
function rag(cell){
  if(!cell || cell.state === 'missing' || cell.state == null) return {k:'missing', label:'Missing'};
  if(cell.state === 'na') return {k:'na', label:'N/A'};
  if(cell.state === 'review') return {k:'review', label:(cell.note||'Check')};
  if(cell.state === 'date' && cell.date){
    const days = Math.round((new Date(cell.date) - Date.now())/86400000);
    if(days < 0)   return {k:'expired',  label:'Expired', days};
    if(days <= 60) return {k:'expiring', label:days+'d left', days};
    return {k:'valid', label:fmtDate(cell.date), days};
  }
  return {k:'missing', label:'Missing'};
}
function fmtDate(s){ if(!s) return '—'; const d=new Date(s); return isNaN(d)?esc(s):d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'}); }

/* ---- shared page chrome (dark staff theme, matches /admin) ---- */
function chrome(title, active, body, extraHead){
  const nav = [['/admin','Hub'],['/admin/applications','Applications'],['/admin/tenants','Tenants'],['/admin/properties','Properties'],['/admin/compliance','Compliance']];
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — Gower</title>
<link rel="icon" href="/assets/svg/gower-monogram-navy.svg">
<link rel="stylesheet" href="/brand.css">
<style>
:root{--ok:#2E7D52;--okbg:#e7f3ec;--warn:#B97A0B;--warnbg:#fbf1dd;--bad:#C0392B;--badbg:#fbe7e4;--na:#7c8893;--nabg:#eef1f3}
.pbody{background:var(--harbour);min-height:100vh;color:var(--cream)}
.phead{display:flex;align-items:center;justify-content:space-between;padding:16px 0;border-bottom:1px solid #20384e}
.phead .logo{height:28px}
.pnav{display:flex;gap:6px;flex-wrap:wrap;margin:14px 0 22px}
.pnav a{color:var(--cream);text-decoration:none;font-family:var(--font-display);font-weight:600;font-size:.82rem;padding:7px 14px;border-radius:999px;border:1px solid #2c4a64;background:var(--coastal)}
.pnav a.on{background:var(--gold);color:var(--harbour);border-color:var(--gold)}
.pnav a:hover{border-color:var(--gold)}
h1.ph{font-family:var(--font-display);font-weight:700;font-size:1.5rem;margin:0 0 2px}
.sub{opacity:.8;font-size:.9rem;margin:0 0 18px}
.panel{background:var(--cream);color:var(--harbour);border-radius:14px;padding:18px;margin-bottom:18px}
.pill{display:inline-block;border-radius:999px;padding:3px 10px;font-size:.78rem;font-weight:600;white-space:nowrap}
.pill.valid{background:var(--okbg);color:var(--ok)} .pill.expiring{background:var(--warnbg);color:var(--warn)}
.pill.expired{background:var(--badbg);color:var(--bad)} .pill.missing{background:var(--badbg);color:var(--bad)}
.pill.na{background:var(--nabg);color:var(--na)} .pill.review{background:var(--warnbg);color:var(--warn)}
.btn-sm{font-size:.82rem;padding:.5rem 1rem}
.muted{color:var(--grey)} a.lnk{color:var(--coastal);font-weight:600}
table.grid{width:100%;border-collapse:separate;border-spacing:0;background:var(--cream);color:var(--harbour);border-radius:12px;overflow:hidden;font-size:.82rem}
table.grid th,table.grid td{padding:8px 9px;border-bottom:1px solid var(--stone);text-align:left}
table.grid thead th{background:var(--coastal);color:var(--cream);font-family:var(--font-display);font-weight:600;font-size:.72rem;position:sticky;top:0}
table.grid tbody th{font-weight:600;background:#fbf9f3;position:sticky;left:0;min-width:150px}
.cell{cursor:pointer;text-align:center;min-width:92px}
.cell:hover{background:#f3eee1}
.scrollx{overflow-x:auto;border-radius:12px}
.modal-bg{position:fixed;inset:0;background:rgba(5,18,28,.55);display:none;align-items:center;justify-content:center;z-index:90;padding:18px}
.modal{background:var(--cream);color:var(--harbour);border-radius:14px;max-width:440px;width:100%;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.4)}
.modal h3{margin:0 0 2px} .modal .x{float:right;border:0;background:transparent;font-size:1.4rem;cursor:pointer;line-height:1;color:var(--harbour)}
.modal label{display:block;font-weight:600;font-size:.85rem;margin:12px 0 5px}
.modal input[type=date],.modal input[type=text],.modal input[type=file],.modal textarea,.modal select{width:100%;padding:9px 11px;border:1.5px solid var(--stone);border-radius:9px;font:inherit}
.rowflex{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.tcard{background:var(--coastal);border:1px solid #2c4a64;border-radius:12px;padding:16px;text-decoration:none;color:var(--cream);display:block}
.tcard:hover{border-color:var(--gold)}
.legend{display:flex;gap:14px;flex-wrap:wrap;font-size:.78rem;margin:0 0 14px;opacity:.92}
.legend span{display:inline-flex;align-items:center;gap:5px}
.dot{width:11px;height:11px;border-radius:50%;display:inline-block}
.empty{padding:26px;text-align:center;color:var(--grey)}
.flash{background:#173a2a;border:1px solid #245c41;color:#bdf0d2;border-radius:9px;padding:10px 13px;font-size:.85rem;margin-bottom:14px;display:none}
</style>${extraHead||''}</head>
<body class="pbody"><div class="wrap">
<div class="phead"><img class="logo" src="/assets/svg/gower-capital-wordmark-cream.svg" alt="Gower Capital Group"><a href="/admin" style="color:var(--cream);text-decoration:none;font-size:.8rem;opacity:.8">Sign out via Hub →</a></div>
<nav class="pnav">${nav.map(n=>`<a href="${n[0]}"${n[0]===active?' class="on"':''}>${esc(n[1])}</a>`).join('')}</nav>
${body}
</div></body></html>`;
}

module.exports = function mountPortal(app, deps){
  const { requireAuth, PUB } = deps;

  // page guard: redirect to /admin (hub/login) if not signed in
  function page(req,res,next){ if(req.session && req.session.auth) return next(); res.redirect('/admin'); }

  /* ---------- auth-gated file download (compliance certs, reports, photos) ---------- */
  app.get('/admin/dl', requireAuth, (req,res)=>{
    const ref = String(req.query.ref||'');
    if(!ref || ref.includes('..')){ return res.status(400).send('Bad ref'); }
    const abs = storage.abspath(ref);
    if(!abs.startsWith(storage.FILES) || !fs.existsSync(abs)){ return res.status(404).send('Not found'); }
    res.sendFile(abs);
  });

  /* ===================== COMPLIANCE ===================== */
  app.get('/admin/compliance', page, (req,res)=>{
    const c = loadCompliance();
    const items = (c.items && c.items.length ? c.items : ITEMS.map(i=>({code:i[0],name:i[1]})));
    const props = c.props || [];
    // summary counts
    let counts={expired:0,expiring:0,missing:0,valid:0,na:0,review:0};
    props.forEach(p=>items.forEach(it=>{ const r=rag((c.data[p.id]||{})[it.code]); counts[r.k]=(counts[r.k]||0)+1; }));
    const head = `<tr><th>Certificate</th>${props.map(p=>`<th title="${esc(p.label)}">${esc(p.num)}<br><span style="font-weight:400;opacity:.7;font-size:.66rem">${esc(p.type||'')}</span></th>`).join('')}</tr>`;
    const rows = items.map(it=>{
      const tds = props.map(p=>{
        const cell=(c.data[p.id]||{})[it.code]||{state:'missing'}; const r=rag(cell);
        const f = cell.file ? '●' : '';
        return `<td class="cell" data-prop="${esc(p.id)}" data-item="${esc(it.code)}" data-plabel="${esc(p.label)}"><span class="pill ${r.k}">${esc(r.label)}</span> <span class="muted" style="font-size:.7rem">${f}</span></td>`;
      }).join('');
      return `<tr><th>${esc(it.name)}</th>${tds}</tr>`;
    }).join('');
    const body = `
<h1 class="ph">Compliance<span class="gold">.</span></h1>
<p class="sub">${props.length} properties · click any cell to set the expiry date, mark N/A, or upload the certificate. Imported from your audit tracker.</p>
<div class="flash" id="flash"></div>
<div class="panel" style="background:var(--coastal);color:var(--cream)">
  <div class="legend">
    <span><i class="dot" style="background:var(--bad)"></i> Expired / missing — ${counts.expired+counts.missing}</span>
    <span><i class="dot" style="background:var(--warn)"></i> Expiring ≤60d / check — ${counts.expiring+counts.review}</span>
    <span><i class="dot" style="background:var(--ok)"></i> Valid — ${counts.valid}</span>
    <span><i class="dot" style="background:var(--na)"></i> N/A — ${counts.na}</span>
    <span style="opacity:.8">● = document on file</span>
  </div>
</div>
<div class="scrollx"><table class="grid"><thead>${head}</thead><tbody>${rows}</tbody></table></div>

<div class="modal-bg" id="mbg"><div class="modal" id="modal"></div></div>
<script>
(function(){
  var mbg=document.getElementById('mbg'), modal=document.getElementById('modal'), flash=document.getElementById('flash');
  var cur={};
  function showFlash(t){ flash.textContent=t; flash.style.display='block'; setTimeout(function(){flash.style.display='none';},3500); }
  document.querySelectorAll('td.cell').forEach(function(td){
    td.onclick=function(){ cur={prop:td.dataset.prop,item:td.dataset.item,plabel:td.dataset.plabel,iname:td.querySelector? '' : ''};
      cur.iname=td.closest('tr').querySelector('th').textContent;
      openEditor(td);
    };
  });
  function openEditor(td){
    fetch('/api/compliance/cell?prop='+encodeURIComponent(cur.prop)+'&item='+encodeURIComponent(cur.item)).then(r=>r.json()).then(function(j){
      var cell=j.cell||{state:'missing'}; var date=cell.date||'';
      var fileRow = cell.file ? '<p style="font-size:.82rem">On file: <a class="lnk" target="_blank" href="/admin/dl?ref='+encodeURIComponent(cell.file.rel)+'">'+(cell.file.name||'document')+'</a></p>' : '<p class="muted" style="font-size:.82rem">No document uploaded yet.</p>';
      modal.innerHTML='<button class="x" id="mx">×</button><h3>'+cur.iname+'</h3><p class="muted" style="margin:.2em 0 0">'+cur.plabel+'</p>'+
        '<label>Expiry / renewal date</label><input type="date" id="mdate" value="'+date+'">'+
        '<label>Status</label><select id="mstate"><option value="date">Has a date (above)</option><option value="na">Not applicable (N/A)</option><option value="missing">Missing / needed</option></select>'+
        '<label>Note (optional)</label><input type="text" id="mnote" value="'+(cell.note?String(cell.note).replace(/"/g,"&quot;"):'')+'">'+
        '<label>Upload certificate (PDF / image)</label><input type="file" id="mfile" accept="application/pdf,image/*">'+
        fileRow+
        '<div class="rowflex" style="margin-top:16px"><button class="btn btn-gold btn-sm" id="msave">Save</button><button class="btn btn-ghost btn-sm" id="mcancel" style="color:var(--harbour)">Cancel</button></div>';
      document.getElementById('mstate').value = cell.state==='na'?'na':(date?'date':'missing');
      mbg.style.display='flex';
      document.getElementById('mx').onclick=close; document.getElementById('mcancel').onclick=close;
      document.getElementById('msave').onclick=save;
    });
  }
  function close(){ mbg.style.display='none'; }
  mbg.onclick=function(e){ if(e.target===mbg) close(); };
  function save(){
    var date=document.getElementById('mdate').value, state=document.getElementById('mstate').value, note=document.getElementById('mnote').value;
    var fileEl=document.getElementById('mfile'); var btn=document.getElementById('msave'); btn.disabled=true; btn.textContent='Saving…';
    function postCell(filePayload){
      fetch('/api/compliance/cell',{method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({prop:cur.prop,item:cur.item,date:date,state:state,note:note,file:filePayload})})
        .then(r=>r.json()).then(function(){ close(); showFlash('Saved '+cur.iname+' — '+cur.plabel+'. Refreshing…'); setTimeout(function(){location.reload();},700); })
        .catch(function(){ btn.disabled=false; btn.textContent='Save'; });
    }
    if(fileEl.files && fileEl.files[0]){
      var fr=new FileReader();
      fr.onload=function(){ postCell({filename:fileEl.files[0].name,dataUrl:fr.result}); };
      fr.readAsDataURL(fileEl.files[0]);
    } else { postCell(null); }
  }
})();
</script>`;
    res.type('html').send(chrome('Compliance','/admin/compliance', body));
  });

  // get a single cell
  app.get('/api/compliance/cell', requireAuth, (req,res)=>{
    const c = loadCompliance();
    const cell = ((c.data[req.query.prop]||{})[req.query.item])||{state:'missing'};
    res.json({ok:true, cell});
  });
  // update a single cell (date / state / note / optional file upload)
  app.post('/api/compliance/cell', requireAuth, (req,res)=>{
    const c = loadCompliance();
    const { prop, item } = req.body||{};
    if(!prop || !item) return res.status(400).json({ok:false,error:'prop/item required'});
    c.data[prop] = c.data[prop] || {};
    const cell = c.data[prop][item] || {};
    let state = req.body.state;
    if(req.body.date){ cell.date = req.body.date; state = (state==='na')?'na':'date'; }
    else if(state==='date'){ state='missing'; delete cell.date; }
    if(state==='na'){ delete cell.date; }
    if(state==='missing'){ delete cell.date; }
    cell.state = state || (cell.date?'date':'missing');
    cell.note = req.body.note || '';
    if(req.body.file && req.body.file.dataUrl){
      const meta = storage.saveBase64('compliance/'+prop, req.body.file.filename, req.body.file.dataUrl);
      cell.file = meta;
      cell.files = (cell.files||[]); cell.files.unshift(meta);
    }
    c.data[prop][item] = cell;
    store.setDoc('compliance', c);
    res.json({ok:true, cell});
  });

  /* ===================== PROPERTIES ===================== */
  app.get('/admin/properties', page, (req,res)=>{
    const c = loadCompliance();
    const props = c.props || [];
    const repairs = store.list('repairs');
    const cards = props.map(p=>{
      const data=c.data[p.id]||{};
      let bad=0, soon=0;
      Object.values(data).forEach(cell=>{ const r=rag(cell); if(r.k==='expired'||r.k==='missing')bad++; else if(r.k==='expiring'||r.k==='review')soon++; });
      const openR = repairs.filter(r=>r.propId===p.id && r.status!=='Done').length;
      return `<a class="tcard" href="/admin/property/${encodeURIComponent(p.id)}">
        <div style="font-family:var(--font-display);font-weight:700;font-size:1.05rem">${esc(p.label)}</div>
        <div class="muted" style="font-size:.8rem;margin:.2em 0 .6em">${esc(p.postcode||'')} · ${esc(p.type||'')}</div>
        <div class="rowflex" style="font-size:.78rem">
          ${bad?`<span class="pill missing">${bad} overdue</span>`:''}
          ${soon?`<span class="pill expiring">${soon} due soon</span>`:''}
          ${(!bad&&!soon)?`<span class="pill valid">Compliance OK</span>`:''}
          ${openR?`<span class="pill review">${openR} open repair${openR>1?'s':''}</span>`:''}
        </div></a>`;
    }).join('');
    const body = `
<h1 class="ph">Properties<span class="gold">.</span></h1>
<p class="sub">${props.length} properties. Open one to see its compliance, condition reports and repairs.</p>
<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:14px">${cards||'<div class="empty">No properties.</div>'}</div>`;
    res.type('html').send(chrome('Properties','/admin/properties', body));
  });

  app.get('/admin/property/:id', page, (req,res)=>{
    const c = loadCompliance();
    const p = (c.props||[]).find(x=>x.id===req.params.id);
    if(!p) return res.status(404).send(chrome('Not found','/admin/properties','<div class="empty">Property not found. <a class="lnk" href="/admin/properties">Back</a></div>'));
    const data=c.data[p.id]||{};
    const items=(c.items&&c.items.length?c.items:ITEMS.map(i=>({code:i[0],name:i[1]})));
    const compRows=items.map(it=>{ const cell=data[it.code]||{state:'missing'}; const r=rag(cell);
      const f=cell.file?`<a class="lnk" target="_blank" href="/admin/dl?ref=${encodeURIComponent(cell.file.rel)}">view</a>`:'<span class="muted">—</span>';
      return `<tr><td>${esc(it.name)}</td><td><span class="pill ${r.k}">${esc(r.label)}</span></td><td>${f}</td></tr>`;
    }).join('');
    const condReports = store.list('condition_reports').filter(r=>r.propId===p.id);
    const condRows = condReports.length ? condReports.map(r=>`<tr><td>${esc(r.title||'Condition report')}</td><td class="muted">${fmtDate(r.created_at)}</td><td><a class="lnk" target="_blank" href="/admin/dl?ref=${encodeURIComponent((r.file&&r.file.rel)||'')}">view</a></td></tr>`).join('') : '<tr><td colspan="3" class="muted">None yet.</td></tr>';
    const repairs = store.list('repairs').filter(r=>r.propId===p.id);
    const repairRows = repairs.length ? repairs.map(r=>`<tr data-id="${esc(r.id)}">
      <td>${esc(r.issue||'')}<div class="muted" style="font-size:.78rem">${esc(r.room||'')} ${r.reportedBy?('· '+esc(r.reportedBy)):''}</div>${r.photo?`<a class="lnk" target="_blank" href="/admin/dl?ref=${encodeURIComponent(r.photo.rel)}">photo</a>`:''}</td>
      <td class="muted">${fmtDate(r.created_at)}</td>
      <td><span class="pill ${r.status==='Done'?'valid':(r.status==='In progress'?'expiring':'missing')}">${esc(r.status||'Open')}</span></td>
      <td><button class="btn btn-ghost btn-sm rstat" style="color:var(--harbour)" data-id="${esc(r.id)}">Update</button></td></tr>`).join('') : '<tr><td colspan="4" class="muted">No repairs logged.</td></tr>';
    const body = `
<p style="margin:0 0 6px"><a class="lnk" href="/admin/properties" style="color:var(--bright-gold)">← All properties</a></p>
<h1 class="ph">${esc(p.label)}<span class="gold">.</span></h1>
<p class="sub">${esc(p.postcode||'')} · ${esc(p.type||'')}</p>

<div class="panel"><h3 style="margin:0 0 10px">Compliance</h3>
  <table style="width:100%;border-collapse:collapse"><tbody>${compRows}</tbody></table>
  <p style="margin:12px 0 0"><a class="lnk" href="/admin/compliance">Edit in the compliance grid →</a></p></div>

<div class="panel"><div class="rowflex" style="justify-content:space-between"><h3 style="margin:0">Condition reports</h3>
  <button class="btn btn-gold btn-sm" id="addCond">+ Upload condition report</button></div>
  <table style="width:100%;border-collapse:collapse;margin-top:10px"><tbody>${condRows}</tbody></table></div>

<div class="panel"><div class="rowflex" style="justify-content:space-between"><h3 style="margin:0">Repairs &amp; actions</h3>
  <button class="btn btn-gold btn-sm" id="addRepair">+ Log a repair</button></div>
  <table style="width:100%;border-collapse:collapse;margin-top:10px">
    <thead><tr><th>Issue</th><th>Logged</th><th>Status</th><th></th></tr></thead>
    <tbody id="repairBody">${repairRows}</tbody></table></div>

<div class="modal-bg" id="mbg"><div class="modal" id="modal"></div></div>
<script>
(function(){
  var PROP=${JSON.stringify(p.id)};
  var mbg=document.getElementById('mbg'), modal=document.getElementById('modal');
  function open(){ mbg.style.display='flex'; } function close(){ mbg.style.display='none'; }
  mbg.onclick=function(e){ if(e.target===mbg) close(); };
  function fileToData(el,cb){ if(el.files&&el.files[0]){var fr=new FileReader();fr.onload=function(){cb({filename:el.files[0].name,dataUrl:fr.result});};fr.readAsDataURL(el.files[0]);} else cb(null); }

  document.getElementById('addCond').onclick=function(){
    modal.innerHTML='<button class="x" id="mx">×</button><h3>Upload condition report</h3>'+
      '<label>Title</label><input type="text" id="ctitle" placeholder="e.g. Move-in inventory — S4">'+
      '<label>File (PDF / image)</label><input type="file" id="cfile" accept="application/pdf,image/*">'+
      '<div class="rowflex" style="margin-top:16px"><button class="btn btn-gold btn-sm" id="csave">Save</button><button class="btn btn-ghost btn-sm" id="cx2" style="color:var(--harbour)">Cancel</button></div>';
    open(); document.getElementById('mx').onclick=close; document.getElementById('cx2').onclick=close;
    document.getElementById('csave').onclick=function(){ var b=this;b.disabled=true;b.textContent='Saving…';
      fileToData(document.getElementById('cfile'),function(f){
        fetch('/api/condition-reports',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({propId:PROP,title:document.getElementById('ctitle').value,file:f})})
        .then(r=>r.json()).then(function(){location.reload();}); }); };
  };
  document.getElementById('addRepair').onclick=function(){
    modal.innerHTML='<button class="x" id="mx">×</button><h3>Log a repair</h3>'+
      '<label>Issue</label><textarea id="rissue" rows="3" placeholder="What needs fixing?"></textarea>'+
      '<label>Room / location (optional)</label><input type="text" id="rroom">'+
      '<label>Reported by (optional)</label><input type="text" id="rby">'+
      '<label>Photo (optional)</label><input type="file" id="rphoto" accept="image/*">'+
      '<div class="rowflex" style="margin-top:16px"><button class="btn btn-gold btn-sm" id="rsave">Log it</button><button class="btn btn-ghost btn-sm" id="rx2" style="color:var(--harbour)">Cancel</button></div>';
    open(); document.getElementById('mx').onclick=close; document.getElementById('rx2').onclick=close;
    document.getElementById('rsave').onclick=function(){ var b=this;b.disabled=true;b.textContent='Saving…';
      fileToData(document.getElementById('rphoto'),function(f){
        fetch('/api/repairs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({propId:PROP,issue:document.getElementById('rissue').value,room:document.getElementById('rroom').value,reportedBy:document.getElementById('rby').value,photo:f})})
        .then(r=>r.json()).then(function(){location.reload();}); }); };
  };
  document.querySelectorAll('.rstat').forEach(function(btn){
    btn.onclick=function(){ var id=btn.dataset.id;
      modal.innerHTML='<button class="x" id="mx">×</button><h3>Update repair</h3>'+
        '<label>Status</label><select id="ust"><option>Open</option><option>In progress</option><option>Done</option></select>'+
        '<label>Action / note (optional)</label><textarea id="unote" rows="3"></textarea>'+
        '<div class="rowflex" style="margin-top:16px"><button class="btn btn-gold btn-sm" id="usave">Save</button><button class="btn btn-ghost btn-sm" id="ux2" style="color:var(--harbour)">Cancel</button></div>';
      open(); document.getElementById('mx').onclick=close; document.getElementById('ux2').onclick=close;
      document.getElementById('usave').onclick=function(){ var b=this;b.disabled=true;
        fetch('/api/repairs/'+encodeURIComponent(id),{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({status:document.getElementById('ust').value,note:document.getElementById('unote').value})})
        .then(r=>r.json()).then(function(){location.reload();}); }; };
  });
})();
</script>`;
    res.type('html').send(chrome(p.label,'/admin/properties', body));
  });

  // condition reports
  app.post('/api/condition-reports', requireAuth, (req,res)=>{
    const { propId, title, file } = req.body||{};
    if(!propId) return res.status(400).json({ok:false,error:'propId required'});
    let meta=null; if(file && file.dataUrl) meta=storage.saveBase64('condition/'+propId, file.filename, file.dataUrl);
    const rec=store.add('condition_reports',{propId, title:title||'Condition report', file:meta});
    res.json({ok:true, rec});
  });

  // repairs
  app.get('/api/repairs', requireAuth, (req,res)=>{
    let rows=store.list('repairs');
    if(req.query.propId) rows=rows.filter(r=>r.propId===req.query.propId);
    res.json({ok:true, rows});
  });
  app.post('/api/repairs', requireAuth, (req,res)=>{
    const { propId, issue, room, reportedBy, photo } = req.body||{};
    if(!propId || !issue) return res.status(400).json({ok:false,error:'propId & issue required'});
    let ph=null; if(photo && photo.dataUrl) ph=storage.saveBase64('repairs/'+propId, photo.filename, photo.dataUrl);
    const rec=store.add('repairs',{propId, issue, room:room||'', reportedBy:reportedBy||'Staff', status:'Open', photo:ph, actions:[]});
    res.json({ok:true, rec});
  });
  app.patch('/api/repairs/:id', requireAuth, (req,res)=>{
    const patch={}; if(req.body.status) patch.status=req.body.status;
    const cur=store.list('repairs').find(r=>String(r.id)===String(req.params.id));
    const actions=(cur&&cur.actions)||[];
    if(req.body.note){ actions.unshift({note:req.body.note, at:new Date().toISOString(), status:req.body.status||(cur&&cur.status)}); }
    patch.actions=actions;
    const rec=store.update('repairs', req.params.id, patch);
    if(!rec) return res.status(404).json({ok:false});
    res.json({ok:true, rec});
  });

  /* ===================== TENANTS ===================== */
  app.get('/admin/tenants', page, (req,res)=>{
    const tenants = store.list('tenants');
    const rows = tenants.length ? tenants.map(t=>`<tr>
      <td><b>${esc(t.name||'')}</b></td><td>${esc(t.property||'')}</td><td>${esc(t.email||'')}</td>
      <td><span class="pill ${t.status==='Active'?'valid':'review'}">${esc(t.status||'Pending')}</span></td></tr>`).join('')
      : '<tr><td colspan="4" class="empty">No tenants yet. They are added automatically when you create a tenancy, or add one below.</td></tr>';
    const body=`
<h1 class="ph">Tenants<span class="gold">.</span></h1>
<p class="sub">Your contract-holders. New tenancies created in the system are added here automatically. Tenant logins come in the next phase.</p>
<div class="panel" style="padding:0;overflow:hidden"><table style="width:100%;border-collapse:collapse">
<thead><tr><th>Name</th><th>Property</th><th>Email</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>
<button class="btn btn-gold btn-sm" id="addT">+ Add tenant</button>
<div class="modal-bg" id="mbg"><div class="modal" id="modal"></div></div>
<script>
(function(){var mbg=document.getElementById('mbg'),modal=document.getElementById('modal');
document.getElementById('addT').onclick=function(){
  modal.innerHTML='<button class="x" id="mx">×</button><h3>Add tenant</h3>'+
    '<label>Name</label><input type="text" id="tn">'+
    '<label>Property / room</label><input type="text" id="tp">'+
    '<label>Email</label><input type="text" id="te">'+
    '<div class="rowflex" style="margin-top:16px"><button class="btn btn-gold btn-sm" id="ts">Save</button><button class="btn btn-ghost btn-sm" id="tc" style="color:var(--harbour)">Cancel</button></div>';
  mbg.style.display='flex'; document.getElementById('mx').onclick=cl; document.getElementById('tc').onclick=cl;
  document.getElementById('ts').onclick=function(){fetch('/api/tenants',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:tn.value,property:tp.value,email:te.value})}).then(r=>r.json()).then(function(){location.reload();});};
}; function cl(){mbg.style.display='none';} mbg.onclick=function(e){if(e.target===mbg)cl();};})();
</script>`;
    res.type('html').send(chrome('Tenants','/admin/tenants', body));
  });
  app.post('/api/tenants', requireAuth, (req,res)=>{
    const { name, property, email } = req.body||{};
    if(!name) return res.status(400).json({ok:false,error:'name required'});
    const rec=store.add('tenants',{name, property:property||'', email:email||'', status:'Pending'});
    res.json({ok:true, rec});
  });

  console.log('[portal] staff portal mounted: /admin/compliance, /admin/properties, /admin/tenants');
};

module.exports.ITEMS = ITEMS;
module.exports.loadCompliance = loadCompliance;
