/* tenancy.js — "Create New Tenancy" flow for the Gower Living / Gower Capital website.
 *
 * Drop this file into the Gower-Websites folder and add ONE line to server.js (see
 * CREATE-TENANCY-SETUP.md). It adds:
 *   GET  /admin/new-tenancy   (staff only)  — the form with tenant signature pad
 *   POST /api/create-tenancy  (staff only)  — fills the pack, stamps signatures,
 *                                             emails the PDF to you + the tenant, saves a record.
 *
 * PDFs are produced with headless Chrome (puppeteer) from branded HTML, so they match
 * the Gower Living look exactly. Email goes out through Resend (already used by the app).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/* ----------------------------------------------------------------------------
 * 1. PROPERTY / ROOM LIST  (from CLAUDE.md — Swansea portfolio)
 *    type: 'hmo' = room-only HMO (landlord liable for council tax)
 *          'whole' = whole dwelling (contract-holders jointly liable for council tax)
 * -------------------------------------------------------------------------- */
function rooms(addr, postcode, list) {
  return list.map(r => ({
    id: (r + ' ' + addr).replace(/\s+/g, '-').toLowerCase(),
    label: r + ', ' + addr,
    room: r, address: addr, postcode,
    type: 'hmo', councilTax: 'Landlord (HMO) — included in rent'
  }));
}
function whole(addr, postcode) {
  return [{
    id: addr.replace(/\s+/g, '-').toLowerCase(),
    label: addr, room: '', address: addr, postcode,
    type: 'whole', councilTax: 'Contract-holder(s) — not included'
  }];
}
const PROPERTIES = [].concat(
  rooms('138 Walter Road, Swansea', 'SA1 5RQ', ['S1','S2','S3','S4','S5','S6']),
  rooms('22 Hill Street, Swansea', 'SA1 6XU', ['Flat','S1','S2','S3','S4','S5','S6','S7']),
  rooms('108 Penygraig Road, Mayhill, Swansea', 'SA1 6JZ', ['S1','S2','S3','S4','S5','S6','S7']),
  whole('130 Townhill Road, Cockett, Swansea', 'SA2 0UU'),
  whole('81 North Hill Road, Swansea', 'SA1 6YT'),
  whole('83 North Hill Road, Swansea', 'SA1 6YT'),
  whole('85 North Hill Road, Swansea', 'SA1 6YT'),
  whole('81 Glynhir Road, Pontarddulais, Swansea', 'SA4 8PT'),
  whole('81A Glynhir Road, Pontarddulais, Swansea', 'SA4 8PT'),
  whole('81B Glynhir Road, Pontarddulais, Swansea', 'SA4 8PT'),
  whole('40 Courtney Street, Manselton, Swansea', 'SA5 9NR'),
  whole('310 Neath Road, Plasmarl, Swansea', 'SA6 8JU'),
  whole('367 Neath Road, Plasmarl, Swansea', 'SA6 8JN'),
  whole('567 Pentregethin Road, Swansea', 'SA5 5ET'),
  whole('16 Gomer Gardens, Townhill, Swansea', 'SA1 6QF')
);

// Landlord constants (CLAUDE.md)
const LL = {
  name: 'Gower Capital Group Ltd',
  addr: '24 Conway Road, Penlan, Swansea, SA5 7BG',
  email: 'mail@gowercapitalgroup.com',
  phone: '07815 866283',
  bank: 'Gower Capital Group, sort code 04-06-05, account 18499656',
  contact: "Alex O'Brien",
  // Rent Smart Wales — agent licence + both landlord registrations (shown on every contract)
  rswLicence: 'LR 75063-45052',
  rswReg1: 'Gower Capital Group Ltd — RN97039-97310',
  rswReg2: 'Gower Capital 2 Ltd — RN 32153-86749'
};
const APA = {
  t1: ['Drug, alcohol or other addiction problems','Learning difficulties incl. literacy/numeracy','Severe or multiple debt problems','In temporary accommodation','Homeless','Domestic violence and abuse','Mental health condition','In rent arrears / threat of eviction','16/17 year old or care leaver','Family with multiple and complex needs'],
  t2: ['Third-party deductions in place','Refugee or asylum seeker','History of rent arrears','Previously homeless / supported','Other disability (physical/sensory)','Just left prison (within 3 months)','Just left hospital (within 3 months)','Recently bereaved','English not first language','Ex-service personnel (within 18 months)','NEET (18–24)']
};

const esc = v => String(v == null ? '' : v).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const BLANK = '<span style="display:inline-block;min-width:120px;border-bottom:1px solid #1E3A53;vertical-align:baseline">&nbsp;</span>';
function ordinal(n){ n=parseInt(n,10); if(!n) return '____'; const s=['th','st','nd','rd'], v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); }

/* ----------------------------------------------------------------------------
 * 2. THE ADMIN FORM  (served at /admin/new-tenancy)
 * -------------------------------------------------------------------------- */
function formHTML() {
  const props = JSON.stringify(PROPERTIES);
  const apa = JSON.stringify(APA);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Create New Tenancy — Gower Living</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--harbour:#0A1D2E;--coastal:#1E3A53;--cream:#F6F2E8;--stone:#E7E2D7;--gold:#CFA24A;--grey:#6b6f76;--red:#C0392B}
*{box-sizing:border-box}body{margin:0;background:var(--stone);font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:var(--harbour)}
.wrap{max-width:780px;margin:0 auto;padding:24px}
.card{background:#fff;border-radius:16px;box-shadow:0 10px 40px rgba(10,29,46,.10);overflow:hidden}
.banner{background:var(--harbour);color:var(--cream);padding:22px 28px}
.banner h1{font-family:'Outfit';font-weight:700;margin:0;font-size:1.5rem}
.banner p{margin:.4em 0 0;opacity:.85;font-size:.92rem}
form{padding:6px 28px 28px}
fieldset{border:0;border-top:1px solid var(--stone);padding:18px 0 4px;margin:0}
legend{font-family:'Outfit';font-weight:600;font-size:1.1rem;padding:0;margin-bottom:2px}
.row{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.field{margin:10px 0}.field.full{grid-column:1/-1}
label{display:block;font-weight:600;font-size:.86rem;margin-bottom:5px}
input,select{width:100%;padding:10px 12px;border:1.5px solid var(--stone);border-radius:10px;font:inherit;background:#fff}
input:focus,select:focus{outline:0;border-color:var(--coastal)}
.hint{font-size:.8rem;color:var(--grey);margin:2px 0 0}
.apcols{display:grid;grid-template-columns:1fr 1fr;gap:6px 18px}
.chk{display:flex;gap:8px;align-items:flex-start;font-size:.85rem;font-weight:500}
.chk input{width:auto;margin-top:3px}
.sigwrap{border:1.5px dashed var(--coastal);border-radius:12px;background:#fffdf7;padding:8px}
canvas{width:100%;height:180px;touch-action:none;border-radius:8px;background:#fff;display:block}
.sigbar{display:flex;justify-content:space-between;align-items:center;margin-top:6px}
.btn{border:0;border-radius:999px;padding:12px 22px;font-family:'Outfit';font-weight:600;font-size:1rem;cursor:pointer}
.btn-gold{background:var(--gold);color:var(--harbour)}.btn-ghost{background:transparent;border:1.5px solid var(--coastal);color:var(--harbour);padding:8px 16px;font-size:.85rem}
.actions{margin-top:22px;display:flex;gap:12px;align-items:center}
.msg{margin-top:14px;font-weight:600}.msg.ok{color:#2E7D52}.msg.err{color:var(--red)}
.gold{color:var(--gold)}
small.note{display:block;color:var(--grey);font-size:.8rem;margin-top:4px}
</style></head><body>
<div class="wrap"><div class="card">
<div class="banner"><h1>Create New Tenancy<span class="gold">.</span></h1><p>Gower Living — fill in the details, capture the contract-holder's signature, and generate &amp; send the full pack.</p></div>
<form id="f">
  <fieldset><legend>Property</legend>
    <div class="field full"><label>Property / room</label>
      <select id="propertyId" name="propertyId" required></select>
      <p class="hint" id="propmeta"></p></div>
  </fieldset>
  <fieldset><legend>Contract-holder</legend>
    <div class="row">
      <div class="field"><label>Title</label><input name="title" placeholder="Mr / Ms / Mx"></div>
      <div class="field"><label>Full name *</label><input name="fullName" required></div>
      <div class="field"><label>Date of birth *</label><input name="dob" type="date" required></div>
      <div class="field"><label>National Insurance no. *</label><input name="ni" required placeholder="AB123456C"></div>
      <div class="field"><label>Mobile</label><input name="mobile"></div>
      <div class="field"><label>Email *</label><input name="email" type="email" required></div>
    </div>
  </fieldset>
  <fieldset><legend>Tenancy terms</legend>
    <div class="row">
      <div class="field"><label>Rent (£ / calendar month) *</label><input name="rent" type="number" step="0.01" required></div>
      <div class="field"><label>Deposit (£)</label><input name="deposit" type="number" step="0.01"></div>
      <div class="field"><label>Occupation (start) date *</label><input name="occupationDate" type="date" required></div>
      <div class="field"><label>Fixed term (months)</label><input name="termMonths" type="number" value="6"></div>
      <div class="field"><label>Rent day (day of month)</label><input name="paymentDay" type="number" min="1" max="28"></div>
    </div>
  </fieldset>
  <fieldset><legend>Universal Credit — managed payment factors</legend>
    <p class="hint">Tick only those that are genuinely true for this person (integrity rule).</p>
    <div style="font-family:'Outfit';font-weight:600;margin:8px 0 4px">Tier 1</div>
    <div class="apcols" id="t1"></div>
    <div style="font-family:'Outfit';font-weight:600;margin:12px 0 4px">Tier 2</div>
    <div class="apcols" id="t2"></div>
  </fieldset>
  <fieldset><legend>Contract-holder signature</legend>
    <p class="hint">If the contract-holder is with you, they sign here now (finger / mouse / Apple Pencil). If not, leave this blank and use <b>Email tenant to sign</b> below. Your (landlord) signature is added automatically.</p>
    <div class="sigwrap"><canvas id="sig"></canvas>
      <div class="sigbar"><small class="note">By signing, the contract-holder agrees to the occupation contract and the documents in this pack.</small>
      <button type="button" class="btn btn-ghost" id="clear">Clear</button></div>
    </div>
  </fieldset>
  <div class="actions">
    <button class="btn btn-gold" id="go" type="submit">Sign now &amp; send</button>
    <button class="btn btn-ghost" id="sendlink" type="button">Email tenant to sign</button></div>
  <div id="msg" class="msg"></div>
</form>
</div></div>
<script id="props" type="application/json">${props}</script>
<script id="apa" type="application/json">${apa}</script>
<script>
(function(){
  var PROPS=JSON.parse(document.getElementById('props').textContent);
  var APA=JSON.parse(document.getElementById('apa').textContent);
  var sel=document.getElementById('propertyId'), meta=document.getElementById('propmeta');
  PROPS.forEach(function(p){var o=document.createElement('option');o.value=p.id;o.textContent=p.label;sel.appendChild(o);});
  function metaShow(){var p=PROPS.find(function(x){return x.id===sel.value;});meta.textContent=p?(p.postcode+'  ·  '+(p.type==='hmo'?'Room-only HMO':'Whole dwelling')+'  ·  Council tax: '+p.councilTax):'';}
  sel.addEventListener('change',metaShow); metaShow();
  function mk(parent,arr,prefix){arr.forEach(function(t,i){var id=prefix+'-'+i;var d=document.createElement('label');d.className='chk';
    d.innerHTML='<input type="checkbox" name="apa" value="'+(prefix.toUpperCase()+': '+t).replace(/"/g,'&quot;')+'"><span>'+t+'</span>';parent.appendChild(d);});}
  mk(document.getElementById('t1'),APA.t1,'t1'); mk(document.getElementById('t2'),APA.t2,'t2');

  // signature pad
  // Pointer Events handle mouse, touch AND Apple Pencil uniformly (best for iPad).
  var c=document.getElementById('sig'), ctx=c.getContext('2d'), drawing=false, did=false, last=null;
  function fit(){var r=c.getBoundingClientRect();var dpr=window.devicePixelRatio||1;c.width=Math.round(r.width*dpr);c.height=Math.round(r.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.lineWidth=2.4;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#0A1D2E';}
  fit(); window.addEventListener('resize',function(){fit();});
  function pos(e){var r=c.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};}
  c.addEventListener('pointerdown',function(e){drawing=true;did=true;last=pos(e);try{c.setPointerCapture(e.pointerId);}catch(_){}e.preventDefault();});
  c.addEventListener('pointermove',function(e){if(!drawing)return;var p=pos(e);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p;e.preventDefault();});
  function up(){drawing=false;}
  c.addEventListener('pointerup',up);c.addEventListener('pointercancel',up);c.addEventListener('pointerleave',up);
  document.getElementById('clear').addEventListener('click',function(){ctx.clearRect(0,0,c.width,c.height);did=false;});

  var form=document.getElementById('f');
  function collect(){var fd=new FormData(form),body={};fd.forEach(function(v,k){if(k==='apa'){(body.apa=body.apa||[]).push(v);}else body[k]=v;});return body;}
  function send(mode){
    var msg=document.getElementById('msg'), go=document.getElementById('go'), sl=document.getElementById('sendlink');
    if(!form.reportValidity())return;
    var body=collect(); body.mode=mode;
    if(mode==='sign-now'){ if(!did){msg.className='msg err';msg.textContent='Please capture the contract-holder signature, or use “Email tenant to sign”.';return;} body.tenantSignature=c.toDataURL('image/png'); }
    go.disabled=true; sl.disabled=true; msg.className='msg'; msg.textContent=(mode==='send-link')?'Emailing the signing link…':'Generating and sending…';
    fetch('/api/create-tenancy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      .then(function(r){return r.json();})
      .then(function(j){ go.disabled=false; sl.disabled=false;
        if(j.ok && j.mode==='link'){msg.className='msg ok';msg.textContent='Signing link emailed to '+j.sentTo.join(', ')+'. They sign on their device and it completes automatically.';}
        else if(j.ok){msg.className='msg ok';msg.textContent='Sent ✓  Pack emailed to '+j.sentTo.join(' and ')+'.';}
        else {msg.className='msg err';msg.textContent='Error: '+(j.error||'unknown');}})
      .catch(function(e){go.disabled=false;sl.disabled=false;msg.className='msg err';msg.textContent='Error: '+e.message;});
  }
  form.addEventListener('submit',function(ev){ev.preventDefault();send('sign-now');});
  document.getElementById('sendlink').addEventListener('click',function(){send('send-link');});

  // pre-fill the contract-holder fields from a received application (/newtenancy?app=<id>)
  var _appId=new URLSearchParams(location.search).get('app');
  if(_appId){
    fetch('/api/applications').then(function(r){return r.json();}).then(function(j){
      var a=((j&&j.rows)||[]).find(function(x){return String(x.id)===String(_appId);}); if(!a)return;
      function setF(n,v){var el=form.querySelector('[name="'+n+'"]'); if(el&&v!=null&&v!=='')el.value=v;}
      var nm=((a.firstName||'')+' '+(a.lastName||'')).trim();
      setF('title',a.title); setF('fullName',nm); setF('dob',a.dob); setF('ni',a.ni);
      setF('mobile',a.phone); setF('email',a.email);
      var m=document.getElementById('msg'); if(m){m.className='msg ok';m.textContent='Pre-filled from '+(nm||'the')+' application — check the details, choose the property/room and terms, then send.';}
    }).catch(function(){});
  }
})();
</script></body></html>`;
}

/* ----------------------------------------------------------------------------
 * 3. THE PACK  (branded print HTML -> PDF)
 * -------------------------------------------------------------------------- */
function gbp(n){ n=parseFloat(n); return isNaN(n)?'—':('£'+n.toFixed(2)); }
function dfmt(s){ if(!s) return '—'; var d=new Date(s); if(isNaN(d)) return esc(s);
  return d.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}); }
function endDate(start, months){ if(!start) return '—'; var d=new Date(start); if(isNaN(d)) return '—';
  d.setMonth(d.getMonth()+ (parseInt(months,10)||6)); d.setDate(d.getDate()-1);
  return d.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}); }

// signature line: optional stamped image above a ruled line + label
function sline(label, img){
  return '<div class="sig">'+(img?'<img src="'+img+'">':'')+'<div class="rule"></div><div class="cap">'+esc(label)+'</div></div>';
}
function kv(rows){ return '<table class="kv">'+rows.map(function(r){return '<tr><th>'+esc(r[0])+'</th><td>'+r[1]+'</td></tr>';}).join('')+'</table>'; }

function packHTML(d){
  var P = d.property;
  var prop = (P.room?P.room+', ':'')+P.address+', '+P.postcode;
  var tenant = esc(((d.title?d.title+' ':'')+d.fullName).trim());
  var tsig = d.tenantSignature || '';
  var lsig = d.landlordSignature || '';
  var apa = (d.apa||[]);
  var apaSet = {}; apa.forEach(function(x){apaSet[x]=true;});
  var LOGO = d.logoUrl; // gower-living-primary-navy.svg
  function chk(label){ var on=apaSet['TIER 1: '+label]||apaSet['TIER 2: '+label]||apaSet[label]; return '<span class="cb">'+(on?'☑':'☐')+'</span> '+esc(label); }
  function apaList(arr,tier){ return arr.map(function(t){var on=apaSet[tier+': '+t];return '<div class="cbi"><span class="cb">'+(on?'☑':'☐')+'</span> '+esc(t)+'</div>';}).join(''); }

  var head = function(eyebrow){ return '<header class="dh"><img class="logo" src="'+LOGO+'"><div class="eb">'+esc(eyebrow)+'</div></header>'; };

  var docs = [];

  // Cover
  docs.push('<section class="doc cover"><img class="logo big" src="'+LOGO+'"><div class="grule"></div>'+
    '<h1 class="ttl">Tenancy Pack</h1><p class="sub">Standard occupation contract — supporting documents (Renting Homes (Wales) Act 2016)</p>'+
    '<div class="cov"><div class="cl">THE DWELLING</div><div class="cv">'+esc(prop)+'</div>'+
    '<div class="cl">CONTRACT-HOLDER</div><div class="cv">'+tenant+'</div>'+
    '<div class="cl">LANDLORD</div><div class="cv">Gower Capital Group Ltd</div></div>'+
    '<p class="ins"><b>What&rsquo;s inside:</b> occupation contract · pre-contract checklist · Notice of Landlord&rsquo;s Address (RHW2) · inventory &amp; schedule of condition · deposit prescribed information · privacy notice · declaration of understanding · UC landlord-representative authorisation · UC managed-payment (APA) request · Jobcentre Plus proof-of-tenancy letter · key receipt · identity &amp; right-to-occupy record · tenant welcome pack. Appended for this property: EPC, Gas Safety Certificate, EICR, and the Guide for Tenants in Wales.</p>'+
    '</section>');

  // ----- Occupation contract (written statement) -----
  (function(){
    var lastName=(d.fullName||'').trim().split(/\s+/).slice(-1)[0]||'';
    var houseNo=(P.address.match(/\d+[A-Za-z]?/)||[''])[0];
    var ref=(((P.room?P.room+' ':'')+houseNo+' '+lastName).trim().toUpperCase())||'YOUR NAME';
    var endTxt=(function(){ if(!d.occupationDate) return BLANK; var x=new Date(d.occupationDate); if(isNaN(x)) return BLANK; x.setMonth(x.getMonth()+(parseInt(d.termMonths||'6',10))); x.setDate(x.getDate()-1); return x.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric'}); })();
    var FUND=[
      ['F1','Names and addresses','The names of the parties and the landlord’s address for service are set out above. The landlord must keep the contract-holder informed of an address in England or Wales at which notices may be served.'],
      ['F2','Provision of the written statement','The landlord must give the contract-holder a written statement of this occupation contract within 14 days of the occupation date, free of charge, and a further copy if any term is varied.'],
      ['F3','The deposit and deposit scheme','Where a security deposit is taken, the landlord must protect it in a government-authorised tenancy deposit scheme (here, The Tenancy Deposit Scheme) within 30 days of receipt, and give the contract-holder the prescribed information. The deposit may only be applied at the end of the contract towards unpaid rent, damage beyond fair wear and tear, or other breaches, and any balance returned.'],
      ['F4','Fitness for human habitation',['The landlord must ensure the dwelling is fit for human habitation on the occupation date and throughout the occupation, including keeping in repair and proper working order the structure and exterior and the installations for water, gas, electricity, sanitation, space heating and water heating.','The landlord must ensure working smoke alarms and, where required, carbon-monoxide alarms are fitted, and that the electrical installation is inspected and tested as required (a valid EICR being in place). These obligations cannot be reduced by any other term.']],
      ['F5','Keeping the dwelling in repair','The landlord is responsible for repairing the structure and exterior and the shared parts and service installations, and must carry out repairs within a reasonable time of becoming aware of the need. The contract-holder must allow access (see S5 and AT11).'],
      ['F6','Right to occupy without interference','The contract-holder is entitled to occupy the dwelling as a home without interference from the landlord, except as permitted by this contract or by law (for example, repairs or inspections on proper notice).'],
      ['F7','Use as a home; anti-social behaviour',['The contract-holder must occupy the dwelling as a home and must not, and must not permit any visitor to, engage in conduct capable of causing nuisance or annoyance to others in the locality, or which interferes with their peace, comfort or convenience.','The contract-holder must not use, or permit the dwelling to be used, for any illegal or immoral purpose, including the supply of controlled drugs. Breach of this term may lead to possession proceedings.']],
      ['F8','Joint contract-holders','This contract is made with a single contract-holder, who may not add a joint contract-holder without the landlord’s written agreement.'],
      ['F9','Sub-occupation, lodgers and dealing','The contract-holder must not transfer (assign) this contract, sub-let or part with possession or occupation of all or part of the dwelling, or take in a lodger, without the landlord’s prior written consent, which the landlord may withhold (see S6 and AT8).'],
      ['F10','Variation of rent','During the fixed term the rent may not be increased except as expressly provided. The landlord may increase the rent by at least two months’ notice in the prescribed form, taking effect no earlier than the end of the fixed term and no more than once in any 12-month period.'],
      ['F11','Ending by the contract-holder','The contract-holder may end this contract by at least one month’s notice, expiring no earlier than the End Date, unless the landlord agrees an earlier surrender. The contract-holder remains liable for rent until the contract is lawfully ended and vacant possession given.'],
      ['F12','Ending by the landlord',['This is a fixed term contract. The landlord cannot end it early by a no-fault notice. During the fixed term the landlord may only seek possession on a ground under the RHWA: serious rent arrears; breach of contract; anti-social behaviour or other prohibited conduct; or an estate-management ground (Annex).','To recover possession at or after the End Date, the landlord must follow the RHWA procedure, which (for a contract that has become periodic) includes a section 173 notice of at least six months, which may not be given within the first six months of occupation. A landlord’s break clause is not included, as it is not permitted in a fixed term of less than two years.']],
      ['F13','Serious rent arrears','The landlord may claim possession on the ground of serious rent arrears if, on the day the claim is made and at the hearing, at least two months’ rent (rent being monthly) is unpaid — in addition to claiming the arrears and interest.'],
      ['F14','Abandonment','If the landlord reasonably believes the dwelling has been abandoned and the contract-holder fails to respond to a warning notice in time, the landlord may end the contract by notice and recover possession without a court order, following the RHWA procedure.'],
      ['F15','Succession','On the death of the contract-holder, a person meeting the statutory conditions may be entitled to succeed to the contract under the RHWA.'],
      ['F16','No probation','This is not a supported standard contract; no probationary or introductory period applies.'],
      ['F17','Statutory framework prevails','All fundamental terms required by the RHWA apply in full, whether or not set out word-for-word above. Where anything here is inconsistent with a fundamental term that cannot be changed, the fundamental term prevails.'],
      ['F18','Right for children to live at or visit the dwelling (from 1 June 2026)',['(1) Subject to paragraph (2), you may permit a person who has not reached the age of 18 to live in or visit the dwelling.','(2) The landlord must not interfere with or restrict the exercise of your right under paragraph (1), unless the interference or restriction is a proportionate means of achieving a legitimate aim.']],
      ['F19','Right to claim benefits (from 1 June 2026)','The landlord must not prohibit you from being a benefits claimant within the meaning given by section 8J of the Renting Homes (Fees, Discrimination etc.) (Wales) Act 2019. Any supplementary or additional term has no effect to the extent it is incompatible with F18 and F19.']
    ];
    var SUPP=[
      ['S1','Use of the dwelling','The contract-holder must occupy the dwelling as their only or principal home and must not use it for business or any purpose other than as a private residence.'],
      ['S2','Notification of absence','The contract-holder must tell the landlord if the dwelling is to be, or has been, unoccupied for a continuous period of four weeks or more.'],
      ['S3','Care of the dwelling','The contract-holder must take reasonable care of the dwelling and shared parts, keep the interior reasonably clean, and not damage the property or its contents (fair wear and tear excepted).'],
      ['S4','Reporting disrepair','The contract-holder must notify the landlord promptly of any disrepair, defect, leak, breakage or failure of any installation for which the landlord is responsible.'],
      ['S5','Access for the landlord','The contract-holder must allow access at reasonable times to inspect and carry out works, on at least 24 hours’ written notice, and immediate access in an emergency.'],
      ['S6','Dealing with the dwelling','The contract-holder must not assign, sub-let, part with or share possession or occupation, or take in a lodger, without the landlord’s prior written consent (which may be refused for a standard contract).'],
      ['S7','Alterations','The contract-holder must not make any alteration or addition to the dwelling, its fixtures or installations, including changing locks or security devices, without prior written consent.'],
      ['S8','Returning the dwelling','At the end of the contract the contract-holder must return the dwelling and contents in the same condition as at the occupation date (fair wear and tear excepted), remove all belongings and rubbish, and return all keys.']
    ];
    var ADDL=[
      ['AT1','Payment of rent','Rent is payable monthly in advance, without deduction or set-off, by standing order or bank transfer to Gower Capital Group Ltd, sort code 04-06-05, account 18499656, quoting the reference “'+esc(ref)+'”. The rent account, documents and maintenance requests are managed through the Bidrento portal. Time of payment is of the essence; a payment is only made when cleared funds are received.'],
      ['AT2','Interest on late rent','If any rent is unpaid for 7 days or more after it falls due, the contract-holder must pay interest on the overdue amount at 3% above the Bank of England base rate, from the due date until paid. This is a permitted default payment under the Renting Homes (Fees etc.) (Wales) Act 2019. No other late-payment fee is payable.'],
      ['AT3','Utilities and outgoings','Rent is inclusive of gas, electricity and water/sewerage, and (as an HMO) the landlord is responsible for council tax. The contract-holder is responsible for the TV licence and any personal telephone/broadband, and for their own contents insurance.'],
      ['AT4','Guarantor','If a guarantor is required, the guarantor named in the Guarantee Schedule guarantees the rent and the contract-holder’s obligations, jointly and severally, for this contract and any continuation. Guarantor required: '+BLANK+'.'],
      ['AT5','Single occupation','The dwelling is let for occupation by the contract-holder alone; no other person may reside there. This does not affect fundamental term F18.'],
      ['AT6','No smoking','Smoking and vaping are not permitted anywhere in the dwelling, the shared parts or the property. The contract-holder is responsible for remedying any damage, staining or odour caused by smoking. Nicotine staining is not fair wear and tear.'],
      ['AT7','Pets','No animal or pet may be kept at the dwelling or brought into the property without the landlord’s prior written consent, which may be conditional and withdrawn for good reason.'],
      ['AT8','No subletting, lodgers or assignment','Consistent with F9 and S6, the contract-holder must not sub-let, take in a lodger, assign or otherwise part with or share possession without the landlord’s prior written consent.'],
      ['AT9','Condition, cleanliness and refuse','The contract-holder must keep the dwelling clean and the shared parts tidy, dispose of refuse and recycling using the arrangements provided, and not leave belongings or rubbish in the shared parts or escape routes.'],
      ['AT10','Care of contents and damage','The contract-holder is responsible for the cost of making good any damage caused by them or a visitor, beyond fair wear and tear. If the dwelling is left unclean or damaged at the end, the reasonable cost of cleaning (including professional cleaning) or repair may be recovered as damages or from the deposit.'],
      ['AT11','Access and viewings','In addition to S5, the contract-holder must permit the landlord and prospective contract-holders to view the dwelling at reasonable times during the final one month, on at least 24 hours’ written notice.'],
      ['AT12','Keys and security','The landlord will issue '+BLANK+' set(s) of keys. The contract-holder must not change any lock or cut additional keys without consent; if consent is given they must provide a working key promptly and the new lock must be no less secure. Replacement of lost keys/security devices and any re-keying is a permitted default payment and is recoverable.'],
      ['AT13','Fire safety','The contract-holder must not tamper with, disable or obstruct any smoke alarm, heat detector, fire door, fire extinguisher or other fire-safety equipment, must keep escape routes clear, and must comply with the fire-safety notice displayed in the property.'],
      ['AT14','Insurance','The contract-holder must not do anything, or keep anything at the dwelling, that may invalidate the landlord’s buildings insurance or increase the premium. The landlord does not insure the contract-holder’s possessions.'],
      ['AT15','Conduct in the HMO','The contract-holder must act considerately towards other occupiers, must not cause noise or nuisance (particularly between 11pm and 8am), and must comply with any reasonable house rules.'],
      ['AT16','End of contract','At the end, the contract-holder must give vacant possession, return all keys, provide a forwarding address and remove all belongings. Belongings left behind may, after notice, be removed, stored or disposed of, with reasonable costs recoverable.'],
      ['AT17','Data protection','The landlord processes the contract-holder’s personal data in accordance with its privacy notice (in this pack) to manage this contract and comply with its legal obligations.'],
      ['AT18','Notices','Notices to the landlord go to the address for service above. Notices to the contract-holder may be given at the dwelling or by email. This does not affect any statutory requirement as to particular notices.'],
      ['AT19','Severability and governing law','If any term is unlawful or unenforceable, the remaining terms continue. This contract is governed by the law of England and Wales and is subject to the RHWA.'],
      ['AT20','Heating, ventilation and condensation','The contract-holder must keep the dwelling adequately heated and ventilated, take reasonable steps to prevent condensation and mould, and report persistent damp or mould promptly. Staining/mould from a failure to heat and ventilate is not fair wear and tear.'],
      ['AT21','Pipes, drains and frost','The contract-holder must take reasonable precautions against frost and burst pipes, keep drains, gutters and waste pipes clear so far as within their control, and flush through the water systems after any period the dwelling is left unoccupied.'],
      ['AT22','Bulbs, batteries and alarms','The contract-holder must promptly replace light bulbs, tubes and batteries within the dwelling (including smoke/CO alarm batteries), test those alarms regularly, and report any fault at once.'],
      ['AT23','Securing the dwelling and absences','The contract-holder must lock all doors and windows and set any alarm when the dwelling is unattended, keep it secure, and tell the landlord if it will be unoccupied for more than 7 consecutive days (in addition to S2).'],
      ['AT24','Refuse and recycling','The contract-holder must put refuse and recycling out only on collection days, using the containers and areas provided, return containers promptly, and keep shared and external areas free of rubbish.'],
      ['AT25','Fixtures and inventory items','The contract-holder must not remove any fixture, fitting or inventory item, and must repair or replace, within a reasonable time, any such item damaged, lost or destroyed by them or a visitor (fair wear and tear excepted).'],
      ['AT26','No business use','The contract-holder must not carry on, or permit, any trade, business or profession at the dwelling or in the shared parts.'],
      ['AT27','Utility suppliers','Where responsible for a utility, the contract-holder must tell the landlord promptly of any change of supplier and must not leave the dwelling at the end without a supplier of any utility present at the occupation date.'],
      ['AT28','Communal areas, parking and safety','The contract-holder must keep shared parts clean and clear, must not obstruct or allow anyone (including children) to obstruct or play on any fire escape or stairway, and may park only in a space (if any) allocated in writing, and then only a private car or motorcycle.'],
      ['AT29','Recovery of the landlord’s losses on breach','The contract-holder is liable, as a debt or damages, for the reasonable losses, costs and expenses the landlord properly incurs from any breach, including reasonable legal costs of recovering arrears or possession to the extent ordered by the court. No charge is made merely for serving a notice, and this term permits no payment prohibited by the 2019 Fees Act.'],
      ['AT30','Universal Credit and direct payment','Where the contract-holder receives Universal Credit, the housing element may be paid directly to the landlord under a Managed Payment to Landlord (an APA). The contract-holder agrees to co-operate, including providing the Jobcentre Plus verification letter in this pack, and to keep the rent account up to date. This does not reduce their responsibility to ensure the rent is paid in full.']
    ];
    var GR=[
      ['Serious rent arrears','At least two months’ rent (rent being monthly) unpaid both when the claim is made and at the hearing — the court must normally order possession.'],
      ['Breach of contract','Where the contract-holder is in breach of any term, including rent arrears below the ‘serious’ threshold.'],
      ['Anti-social behaviour','Where the contract-holder or a visitor has engaged in anti-social or other prohibited conduct.'],
      ['Estate-management grounds','Including redevelopment/works that cannot be done with the contract-holder in occupation, or other Schedule-8 grounds where suitable alternative accommodation is available or it is otherwise reasonable.'],
      ['End of fixed term','After the fixed term, where the contract has become periodic, by a section 173 notice (minimum six months, not within the first six months of occupation), followed if needed by a possession claim.']
    ];
    var cl=function(a){return a.map(function(c){return '<div class="cl">'+c[0]+' &nbsp; '+c[1]+'</div>'+(Array.isArray(c[2])?c[2].map(function(x){return '<p>'+x+'</p>';}).join(''):'<p>'+c[2]+'</p>');}).join('');};
    var grRows=GR.map(function(g){return '<tr><td><b>'+g[0]+'</b></td><td>'+g[1]+'</td></tr>';}).join('');
    docs.push('<section class="doc contract">'+head('Written statement — fixed term standard occupation contract')+
      '<h2>Occupation Contract</h2>'+
      '<p class="muted">Written statement of a fixed term standard occupation contract under the Renting Homes (Wales) Act 2016. The contract-holder’s signature on the signature page below applies to this contract.</p>'+
      '<div class="sec">A &nbsp; The parties and the dwelling</div>'+
      kv([['Landlord','Gower Capital Group Ltd — '+LL.addr+' — '+LL.email+' / '+LL.phone],
          ['Rent Smart Wales','Agent licence '+LL.rswLicence+' &nbsp;·&nbsp; Registrations: '+LL.rswReg1+' &nbsp;·&nbsp; '+LL.rswReg2],
          ['Contract-holder',tenant+' — DOB '+dfmt(d.dob)+' — NI '+esc(d.ni||'____')],
          ['Contact',esc(d.email||'____')+(d.mobile?' &nbsp;·&nbsp; '+esc(d.mobile):'')],
          ['The dwelling',esc(prop)+(P.type==='hmo'?' (one room in a House in Multiple Occupation)':'')],
          ['Shared use','Communal kitchen, bathroom/WC, hallways and other shared parts, per the Inventory.'],
          ['Permitted occupiers','None unless agreed in writing — single occupation by the contract-holder.']])+
      '<p class="muted">Nothing in this statement prevents you from permitting a person under 18 to live in or visit the dwelling, or from being a benefits claimant (see F18 and F19).</p>'+
      '<div class="sec">B &nbsp; Key matters</div>'+
      kv([['Occupation date',dfmt(d.occupationDate)],
          ['Type','Fixed term standard contract'],
          ['Fixed term',(d.termMonths||'6')+' months, ending the day before the corresponding date '+(d.termMonths||'6')+' months later: '+endTxt],
          ['Rent',gbp(d.rent)+' per calendar month, payable monthly in advance'],
          ['First payment','On or before the occupation date'],
          ['Rent day','The '+ordinal(d.paymentDay)+' day of each month'],
          ['Rent includes','Gas, electricity and water/sewerage'],
          ['Council tax','Landlord liable (HMO) — included'],
          ['Not included','TV licence; any telephone/broadband'],
          ['Security deposit',gbp(d.deposit)+', protected with '+esc(d.depositScheme||'The Tenancy Deposit Scheme (TDS)')+' within 30 days']])+
      '<p class="muted">At the end of the fixed term, if not renewed or ended, the contract continues automatically as a periodic standard contract on the same terms.</p>'+
      '<div class="sec">C &nbsp; Fundamental terms</div>'+cl(FUND)+
      '<div class="sec">D &nbsp; Supplementary terms</div>'+cl(SUPP)+
      '<div class="sec">E &nbsp; Additional terms</div>'+cl(ADDL)+
      '<div class="sec">Annex — grounds for possession (summary)</div>'+
      '<table class="grid"><tr><th>Ground</th><th>Summary</th></tr>'+grRows+'</table>'+
      '<div class="sec">Signatures</div>'+
      '<p class="muted">By signing, the parties agree to the terms of this occupation contract.</p>'+
      '<div class="sigs">'+sline(tenant+' (contract-holder)',tsig)+sline('For Gower Capital Group Ltd',lsig)+'</div>'+
      '</section>');
  })();

  // 1 checklist
  docs.push('<section class="doc">'+head('Renting Homes (Wales) — pre-contract checklist')+'<h2>Pre-Contract Checklist</h2>'+
    kv([['Property',esc(prop)],['Contract-holder',tenant],['Date entered into',dfmt(d.occupationDate)]])+
    '<h3>Documents provided to the contract-holder</h3>'+
    ['A written statement of the occupation contract','Current Gas Safety Certificate (where gas present)','Current Electrical Installation Condition Report (EICR)','Form RHW2 (Notice of Landlord&rsquo;s Address)','Energy Performance Certificate (EPC)','Proof the deposit is protected','The deposit scheme&rsquo;s prescribed information','Privacy notice','Inventory and schedule of condition','&lsquo;A Home in the Private Rented Sector: A Guide for Tenants in Wales&rsquo;'].map(function(x){return '<div class="cbi"><span class="cb">☑</span> '+x+'</div>';}).join('')+
    '<h3>We confirm</h3>'+['Mains-wired, interlinked smoke alarms on every floor and working','Carbon monoxide alarms in every room with a fuel-burning appliance and working','Keys / security devices provided to the contract-holder'].map(function(x){return '<div class="cbi"><span class="cb">☑</span> '+x+'</div>';}).join('')+
    '<div class="sigs">'+sline(tenant+' (contract-holder)', tsig)+sline('For Gower Living', lsig)+'</div></section>');

  // 2 RHW2
  docs.push('<section class="doc">'+head('Form RHW2 — notice of landlord&rsquo;s address')+'<h2>Notice of Landlord&rsquo;s Address</h2>'+
    '<p>Given under section 39 of the Renting Homes (Wales) Act 2016. Until the landlord&rsquo;s address for service is provided, rent is treated as not due.</p>'+
    kv([['Property',esc(prop)],['Contract-holder',tenant],['Landlord',LL.name],['Address for service',LL.addr],['Email / telephone',LL.email+' / '+LL.phone],['Date given',dfmt(d.occupationDate)]])+
    '<div class="sigs">'+sline('Issued by, for the landlord', lsig)+'</div></section>');

  // 3 inventory
  var invRows = [['Room — walls &amp; ceiling',''],['Room — flooring',''],['Window &amp; sill / blind',''],['Room door &amp; lock',''],['Heating',''],['Smoke / heat alarm (tested)',''],['Bed &amp; mattress',''],['Wardrobe / storage',''],['Desk / drawers / chair',''],['Kitchenette (if in room)',''],['Shared kitchen items',''],['Keys / fobs issued','']];
  docs.push('<section class="doc">'+head('Inventory & schedule of condition')+'<h2>Inventory &amp; Schedule of Condition</h2>'+
    kv([['Property / room',esc(prop)+' '+(P.type==='hmo'?'(room-only, HMO)':'')],['Contract-holder',tenant],['Date of inventory',dfmt(d.occupationDate)]])+
    '<p class="muted">Check on the occupation date; note any disagreement in writing within 7 days, otherwise taken as an accurate record. Condition: G good / F fair / note.</p>'+
    '<table class="grid"><tr><th>Item</th><th>Condition</th><th>Comments</th></tr>'+invRows.map(function(r){return '<tr><td>'+r[0]+'</td><td></td><td></td></tr>';}).join('')+'</table>'+
    '<p class="muted">Meter readings on occupation date — Electricity ________  Gas ________  Water ________</p>'+
    '<div class="sigs">'+sline(tenant+' (contract-holder)', tsig)+sline('For Gower Living', lsig)+'</div></section>');

  // 4 deposit PI
  docs.push('<section class="doc">'+head('Deposit — prescribed information (insured scheme)')+'<h2>Deposit — Prescribed Information</h2>'+
    kv([['Deposit amount',gbp(d.deposit)],['Property',esc(prop)],['Held / protected by',LL.name+', '+LL.addr],['Protection scheme',esc(d.depositScheme||'The Tenancy Deposit Scheme (TDS, insured)')],['Membership / certificate no.',esc(d.depositRef||'____________')],['Contract-holder / lead',tenant],['Anyone else who paid','N/A']])+
    '<p>The deposit secures the contract-holder&rsquo;s obligations (rent, damage beyond fair wear and tear, and cleaning). At the end of the contract any deductions are agreed with the lead contract-holder and the balance returned, normally within 10 days of agreement. Disputes can go to the scheme&rsquo;s free dispute service.</p>'+
    '<div class="sigs">'+sline('Received — '+tenant, tsig)+'</div></section>');

  // 5 privacy
  docs.push('<section class="doc">'+head('Privacy notice (UK GDPR)')+'<h2>Privacy Notice</h2>'+
    '<p>How Gower Capital Group Ltd (&lsquo;we&rsquo;), trading as Gower Living, collects and uses your personal information as your landlord. We are the data controller.</p>'+
    '<h3>What we collect</h3><p>Name, date of birth, National Insurance number, contact details, identity and right-to-occupy documents, occupation-contract and rent records, benefit / Universal Credit details, and correspondence relating to your home.</p>'+
    '<h3>Why we use it (lawful bases)</h3><p><b>Contract</b> — to manage your occupation contract and collect rent. <b>Legal obligation</b> — Renting Homes (Wales) Act 2016, Rent Smart Wales, safety/HMO duties, tax and anti-money-laundering. <b>Legitimate interests</b> — managing the property, maintenance and arrears. <b>Consent</b> — sharing with DWP/council to support your benefit claim and managed payment (you may withdraw at any time).</p>'+
    '<h3>Who we share it with</h3><p>DWP (Universal Credit), Swansea Council, the deposit scheme, maintenance contractors, our professional advisers, and Rent Smart Wales — only the minimum required.</p>'+
    '<h3>Storage, your rights, contact</h3><p>We keep your data only as long as necessary (generally up to 7 years after your contract ends). You can access, correct, erase or restrict use of your data, object, and ask for portability, and complain to the ICO (ico.org.uk). Contact: '+LL.name+', '+LL.addr+' · '+LL.email+' · '+LL.phone+'.</p>'+
    '<div class="sigs">'+sline(tenant+' — I have read this notice', tsig)+'</div></section>');

  // 6 declaration
  docs.push('<section class="doc">'+head('Declaration of understanding')+'<h2>Declaration of Understanding</h2>'+
    kv([['Property',esc(prop)],['Contract-holder',tenant]])+
    '<p class="muted">By signing, you confirm each of the following has been explained to you and you understand it.</p>'+
    '<h3>Fire precautions</h3><p>The fire alarm, means of escape, keeping the escape route clear, fire doors and fire-fighting equipment have been explained to me.</p>'+
    '<h3>Waste management</h3><p>Black bags for general waste; recycling separated as the Council requires (pink — hard plastic; green 1 — paper/card; green 2 — glass/cans; food caddy); bags out no earlier than 7pm the night before collection; no waste to accumulate; sharps wrapped; no oil, asbestos, clinical, building or garden waste. Council: 01792 635600.</p>'+
    '<h3>Anti-social behaviour</h3><p>What may constitute ASB, its impact, the standard expected, and that it can put my occupation contract at risk, have been explained to me.</p>'+
    '<h3>Management of HMOs (Wales) Regulations 2006/2007</h3><p>I will not hinder the manager&rsquo;s duties; allow reasonable access; provide information reasonably required; avoid damaging anything the manager must maintain; store/dispose of litter as arranged; and follow reasonable fire-safety instructions.</p>'+
    '<div class="sigs">'+sline(tenant+' (contract-holder)', tsig)+sline('For Gower Living', lsig)+'</div></section>');

  // 7 UC authorisation
  docs.push('<section class="doc">'+head('Universal Credit / Housing Benefit — landlord-representative authorisation')+'<h2>Appointment of Authorised Representative</h2>'+
    '<p>I, '+tenant+' (DOB '+dfmt(d.dob)+', NI '+esc(d.ni)+'), the contract-holder living at '+esc(prop)+', authorise the Department for Work and Pensions, local councils and any other interested third party to provide information — personal or otherwise — regarding my housing affairs, and any complaint, appeal or concern relating to my entitlement to Universal Credit housing costs or Housing Benefit, to my nominated representative Gower Capital Group Ltd.</p>'+
    '<p>Gower Capital Group Ltd is appointed to support me and act on my behalf in such matters relating to my home, including the exchange of emails, validation of tenancy, mandatory reconsideration or appeal, and attending DWP meetings with me if I so wish. This authorisation remains in force unless revoked by me in writing.</p>'+
    '<p class="muted">Representative: '+LL.name+', '+LL.addr+' · '+LL.email+' · '+LL.phone+'</p>'+
    '<div class="sigs">'+sline('Signed — '+tenant, tsig)+'</div></section>');

  // 8 UC managed payment
  docs.push('<section class="doc">'+head('Universal Credit — managed payment to landlord (APA) request')+'<h2>Managed Payment to Landlord — Request Record</h2>'+
    kv([['Claimant (contract-holder)',tenant],['National Insurance number',esc(d.ni)],['Date of birth',dfmt(d.dob)],['Property',esc(prop)],['Landlord',LL.name+', '+LL.addr],['Rent paid to landlord',gbp(d.rent)+(P.type==='hmo'?' (sole contract-holder — full rent)':'')],['Payment details',LL.bank]])+
    '<h3>Reason(s) for the managed payment — only those that genuinely apply</h3>'+
    '<div class="apgrid"><div><b>Tier 1</b>'+apaList(APA.t1,'TIER 1')+'</div><div><b>Tier 2</b>'+apaList(APA.t2,'TIER 2')+'</div></div>'+
    '<p class="muted">Process: landlord applies on the DWP &lsquo;Apply for a Direct Rent Payment&rsquo; service (directpayment.universal-credit.service.gov.uk — replaced UC47). The claimant has 7 days to object. File with the signed UC/HB authorisation. Integrity rule: record only genuinely-true factors. Source: DWP &lsquo;Alternative payment arrangements&rsquo;, GOV.UK, updated 3 December 2025 (© Crown copyright, OGL v3.0).</p>'+
    '<div class="sigs">'+sline('Signed — '+tenant, tsig)+sline('For Gower Capital Group Ltd', lsig)+'</div></section>');

  // 9 JCP letter (proper letter)
  docs.push('<section class="doc letter"><header class="lh"><img class="logo" src="'+LOGO+'"><div class="from">'+LL.name+'<br>24 Conway Road, Penlan<br>Swansea, SA5 7BG<br>'+LL.email+'<br>'+LL.phone+'</div></header><div class="grule"></div>'+
    '<p class="ld">Date: '+dfmt(d.occupationDate)+'</p>'+
    '<p>Jobcentre Plus / Universal Credit<br>To whom it may concern</p>'+
    '<p><b>Re: '+tenant+' — proof of tenancy and address</b><br><b>'+esc(prop)+'  ·  National Insurance no. '+esc(d.ni)+'</b></p>'+
    '<p>Dear Sir or Madam,</p>'+
    '<p>This letter confirms the occupation contract of <b>'+tenant+'</b>, date of birth '+dfmt(d.dob)+', National Insurance number '+esc(d.ni)+', with Gower Capital Group Ltd (trading as Gower Living) at the above address, commencing '+dfmt(d.occupationDate)+'.</p>'+
    '<p>The rent is <b>'+gbp(d.rent)+' per calendar month</b>, payable by this sole contract-holder. '+esc(d.fullName)+' will bring the occupation contract document, together with this letter, to verify the tenancy and new address.</p>'+
    '<p>Jobcentre Plus / Universal Credit staff: please use this letter from the claimant&rsquo;s landlord to verify the tenancy. If further verification is needed by phone, please contact '+LL.contact+' on '+LL.phone+'. The bank account for payment is <b>'+LL.bank+'</b>.</p>'+
    '<p>Yours faithfully,</p>'+
    '<div class="lsig">'+(lsig?'<img src="'+lsig+'">':'')+'<div class="rule"></div></div>'+
    '<p><b>'+LL.contact+'</b><br><span class="muted">For and on behalf of Gower Capital Group Ltd, trading as Gower Living</span></p>'+
    '</section>');

  // 10 key receipt
  docs.push('<section class="doc">'+head('Key receipt')+'<h2>Key &amp; Security-Device Receipt</h2>'+
    '<p>I confirm I have received the following keys / security devices for my room and the communal areas, and that I will not copy them or change any lock without the landlord&rsquo;s written consent. Lost keys must be reported at once; reasonable replacement and re-keying costs are recoverable.</p>'+
    '<table class="grid"><tr><th>Key / device</th><th>Number issued</th><th>Notes</th></tr><tr><td>Room door key</td><td></td><td></td></tr><tr><td>Front / communal door key</td><td></td><td></td></tr><tr><td>Other key / fob</td><td></td><td></td></tr></table>'+
    '<div class="sigs">'+sline(tenant+' (contract-holder)', tsig)+sline('For Gower Living', lsig)+'</div></section>');

  // 11 ID & right to occupy
  docs.push('<section class="doc">'+head('Identity & right-to-occupy record')+'<h2>Identity &amp; Right-to-Occupy Verification</h2>'+
    '<p class="muted">For the landlord&rsquo;s own assurance and anti-money-laundering checks. The Right to Rent immigration check does not apply in Wales — this is identity verification only.</p>'+
    kv([['Contract-holder',tenant],['Date of birth',dfmt(d.dob)],['National Insurance number',esc(d.ni)],['Email',esc(d.email)],['Mobile',esc(d.mobile||'____')]])+
    '<table class="grid"><tr><th>Document</th><th>Reference</th><th>Seen by</th><th>Date</th></tr><tr><td>Photo ID (passport / driving licence)</td><td></td><td></td><td></td></tr><tr><td>Proof of address</td><td></td><td></td><td></td></tr><tr><td>Benefit / UC award notice</td><td></td><td></td><td></td></tr></table>'+
    '<div class="sigs">'+sline('Checked by, for Gower Living', lsig)+'</div></section>');

  // ---- Tenant welcome pack (Gower Living) — appended to every pack ----
  docs.push('<section class="doc">'+head('Welcome to your new home')+'<h2>Tenant Welcome Pack</h2>'+
    '<p>Welcome to your new home with <b>Gower Living</b>, part of Gower Capital Property Group. We want you to feel settled and supported here. This short guide answers the questions tenants ask most, and tells you who to contact if you need a hand. Please keep it somewhere safe with your other tenancy papers.</p>'+
    '<div class="sec">Your tenant app &mdash; Bidrento</div>'+
    '<p>Please download the free <b>Bidrento</b> tenant app (search <b>&ldquo;Arthur Online tenant&rdquo;</b> in your app store). It is the easiest way to:</p>'+
    '<ul><li>report a repair or maintenance issue &mdash; you can add photos;</li><li>see your rent account and when your next payment is due;</li><li>view all your tenancy documents in one place;</li><li>message us, with everything kept together.</li></ul>'+
    '<div class="sec">Setting up your rent</div>'+
    '<p><b>If you claim Universal Credit:</b> on the day you sign, update your online UC account &mdash; go to <i>Report a change &rarr; Where you live and what it costs</i>. Enter your address, move-in date and housing costs (all in your occupation contract), and our details below. Then add a note to your journal asking for your rent to be paid <b>direct to your landlord (an APA)</b>, and send us a screenshot of your updated housing screen for your file.</p>'+
    kv([['Landlord',esc(LL.name)],['Address',esc(LL.addr)],['Email',esc(LL.email)],['Housing type','Private housing']])+
    '<p><b>If Housing Benefit pays your rent:</b> call Swansea Council on <b>01792 636000</b>, ask for a Housing Benefit form, complete your part and return it to us on the day you sign.</p>'+
    '<p><b>If you are working:</b> set up a standing order or direct debit for your rent (and service charge if your contract has one), paid in full each month to:</p>'+
    kv([['Account name','Gower Capital Group'],['Sort code','04-06-05'],['Account number','18499656'],['Reference','your name / room']])+
    '</section>');
  docs.push('<section class="doc">'+head('Looking after your home & house rules')+'<h2>Looking After Your Home</h2>'+
    '<p>A few small, regular jobs keep your home in good condition and head off bigger problems:</p>'+
    '<ul><li>Wipe down condensation and air your rooms; clean any mould with a solution of 1 part bleach to 4 parts water (or a mould cleaner).</li><li>Descale taps, showerheads, sinks and the kettle from time to time.</li><li>Keep sink and shower wastes clear with a drain cleaner.</li><li>Replace light bulbs, and change the batteries in smoke and carbon-monoxide alarms when they bleep.</li><li>Defrost the freezer and clean appliances and surfaces regularly, to keep everything working and hygienic.</li></ul>'+
    '<div class="sec">House rules for shared homes</div>'+
    '<p>So everyone in the house feels comfortable and safe:</p>'+
    '<ul><li><b>Communal areas</b> &mdash; keep the shared kitchen, bathroom and hallways clean after use, and please don&rsquo;t leave your belongings in them.</li><li><b>Who lives here</b> &mdash; your room is let to you alone; no one else may move in. Reasonable visitors are welcome, but no extra occupiers, and please keep overnight guests occasional and considerate.</li><li><b>Noise</b> &mdash; keep noise down, especially between 11pm and 8am, so housemates and neighbours can rest.</li><li><b>Smoking &amp; vaping</b> &mdash; not indoors or in communal areas.</li><li><b>Respect</b> &mdash; antisocial behaviour, threats or harassment towards housemates, neighbours or staff is not acceptable and can put your tenancy at risk.</li><li><b>Pets</b> &mdash; only with our written agreement.</li><li><b>Waste &amp; recycling</b> &mdash; dispose of rubbish and recycling correctly (see Appendix A). Put bags out no earlier than 7pm the night before collection, and don&rsquo;t let waste build up.</li></ul>'+
    '<div class="sec">Energy &mdash; fair usage</div>'+
    '<p>Where gas and electricity are included in your rent, a <b>fair usage policy</b> applies. The monthly allowances are generous and you are unlikely to exceed them with sensible use. If usage is excessive, we may apply a supplemental charge for the amount over the allowance. Your allowance is set out in your agreement &mdash; just ask if you are unsure.</p>'+
    '</section>');
  docs.push('<section class="doc">'+head('Safety, emergencies & support')+'<h2>Staying Safe &amp; Getting Help</h2>'+
    '<div class="sec">In an emergency</div>'+
    '<p>For anything that puts life or property at immediate risk, use the right emergency line first, then tell us:</p>'+
    kv([['Fire','Get out, stay out, call <b>999</b>'],['Gas leak / smell of gas','Open windows, don&rsquo;t touch switches, leave &mdash; National Gas Emergency <b>0800 111 999</b>'],['Electrical danger / power cut','Switch off at the consumer unit if safe &mdash; power-cut line <b>105</b>'],['Major water leak','Turn off at the stop tap'],['Medical emergency','<b>999</b>']])+
    '<p>Test your smoke and carbon-monoxide alarms weekly, and never remove or cover them.</p>'+
    '<div class="sec">Repairs &amp; out-of-hours</div>'+
    '<p>Report any repair through the <b>Bidrento</b> app (with photos if you can). For urgent issues out of hours, email us at <b>'+esc(LL.email)+'</b> and we will respond as quickly as we can. If you lose your keys out of hours, you are responsible for calling a locksmith to get back in; any damage caused will be reported to the police.</p>'+
    '<div class="sec">Settling in &mdash; your first week</div>'+
    '<ul><li>Take photos of the meter readings on your move-in day.</li><li>Register with a local GP and dentist.</li><li>Set up your rent (UC / Housing Benefit / direct debit) as above.</li><li>Download the Bidrento app.</li><li>Find out your bin and recycling days.</li><li>Consider contents insurance &mdash; the building is insured by us, but your belongings are not.</li></ul>'+
    '<div class="sec">If you need a hand &mdash; free, confidential support</div>'+
    kv([['Mental health & wellbeing','Samaritans <b>116 123</b> (free, 24/7) &middot; Mind &middot; your GP for local support'],['Money, benefits & debt','Citizens Advice &middot; StepChange <b>0800 138 1111</b> &middot; Universal Credit <b>0800 328 5644</b>'],['Domestic abuse & safety','Live Fear Free (Wales) <b>0808 80 10 800</b> (24/7)'],['Drugs & alcohol','DAN 24/7 (Wales) <b>0808 808 2234</b>'],['Housing advice','Shelter Cymru <b>08000 495 495</b>'],['Food support','Ask us &mdash; we&rsquo;ll point you to your nearest food bank']])+
    '<p class="muted">Gower Living is part of Gower Capital Property Group. We&rsquo;re here to help your home work for you &mdash; get in touch any time at '+esc(LL.email)+'.</p>'+
    '</section>');

  var css = `
@page{size:A4;margin:18mm 16mm 16mm}
*{box-sizing:border-box}
body{font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:#0A1D2E;font-size:10px;line-height:1.45;margin:0}
h1,h2,h3{font-family:'Outfit',system-ui,sans-serif;margin:0}
.doc{page-break-after:always;position:relative;padding-top:4px}
.doc:last-child{page-break-after:auto}
.dh{display:flex;align-items:center;justify-content:space-between;border-bottom:1.2px solid #CFA24A;padding-bottom:7px;margin-bottom:10px}
.dh .logo{height:30px}.dh .eb{font-family:'Outfit';font-weight:600;text-transform:uppercase;letter-spacing:.04em;color:#CFA24A;font-size:8px;text-align:right;max-width:60%}
h2{font-size:15px;margin:2px 0 8px}
h3{font-size:10.5px;color:#0A1D2E;margin:11px 0 3px}
p{margin:0 0 7px;text-align:justify}
.muted{color:#6b6f76;font-size:8.6px}
table.kv{width:100%;border-collapse:collapse;border:.6px solid #D9D3C7;margin:4px 0 8px}
table.kv th{width:30%;text-align:left;background:#F4F1EA;color:#0A1D2E;font-weight:600;padding:5px 7px;border-bottom:.5px solid #D9D3C7;vertical-align:top}
table.kv td{padding:5px 7px;border-bottom:.5px solid #D9D3C7;vertical-align:top}
table.grid{width:100%;border-collapse:collapse;border:.6px solid #D9D3C7;margin:6px 0}
table.grid th{background:#0A1D2E;color:#fff;font-family:'Outfit';font-weight:600;font-size:9px;padding:5px 7px;text-align:left}
table.grid td{border:.5px solid #D9D3C7;padding:7px;height:18px}
.cbi{margin:3px 0}.cb{font-size:11px}
.apgrid{display:grid;grid-template-columns:1fr 1fr;gap:14px;background:#F4F1EA;border:.6px solid #D9D3C7;padding:8px 10px;font-size:8.6px}
.apgrid b{font-family:'Outfit'}
.sec{background:#0A1D2E;color:#F6F2E8;font-family:'Outfit';font-weight:600;font-size:11px;padding:5px 8px;margin:13px 0 6px;border-radius:3px}
.doc ul{margin:4px 0 4px;padding-left:18px}.doc li{margin:2px 0}
.contract .sec{background:#0A1D2E;color:#F6F2E8;font-family:'Outfit';font-weight:600;font-size:11px;padding:5px 8px;margin:13px 0 6px;border-radius:3px}
.contract .cl{font-family:'Outfit';font-weight:600;font-size:9.6px;color:#0A1D2E;margin:8px 0 2px}
.contract p{margin:0 0 5px}
.sigs{display:flex;gap:30px;margin-top:22px}
.sig{flex:1}.sig img{height:42px;display:block;margin-bottom:-6px;margin-left:6px}
.sig .rule{border-bottom:.8px solid #0A1D2E;height:1px;margin-top:8px}
.sig .cap{font-size:8.4px;color:#6b6f76;margin-top:3px}
/* cover */
.cover{text-align:center;padding-top:34px}
.cover .logo.big{height:64px}
.grule{height:2px;background:#CFA24A;width:64px;margin:14px auto 18px;border-radius:2px}
.ttl{font-size:30px;font-weight:700}
.sub{color:#6b6f76;font-size:11px;margin:2px 0 22px}
.cov{display:inline-block;text-align:center;margin:4px auto 18px}
.cov .cl{font-family:'Outfit';font-weight:600;letter-spacing:.06em;font-size:8px;color:#6b6f76;margin-top:10px}
.cov .cv{font-weight:600;font-size:13px}
.ins{font-size:8.6px;color:#6b6f76;text-align:left;margin-top:14px}
/* letter */
.letter .lh{display:flex;justify-content:space-between;align-items:flex-start}
.letter .lh .logo{height:46px}
.letter .from{text-align:right;font-size:8.6px;color:#6b6f76;line-height:1.5}
.letter .ld{margin-top:14px}
.letter p{text-align:left;margin:0 0 11px}
.lsig img{height:46px;display:block;margin:6px 0 -4px}
.lsig .rule{border-bottom:.8px solid #0A1D2E;width:240px;margin-top:8px;margin-bottom:6px}
`;
  return '<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'+
    '<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap" rel="stylesheet">'+
    '<style>'+css+'</style></head><body>'+docs.join('')+'</body></html>';
}

/* ----------------------------------------------------------------------------
 * 4. RENDER (puppeteer) + EMAIL (Resend) + MOUNT
 * -------------------------------------------------------------------------- */
async function renderPDF(html){
  const puppeteer = require('puppeteer');
  const browser = await puppeteer.launch({ headless:'new', args:['--no-sandbox','--disable-setuid-sandbox'] });
  try{
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil:'networkidle0' });
    try{ await page.evaluateHandle('document.fonts.ready'); }catch(e){}
    const pdf = await page.pdf({ format:'A4', printBackground:true, preferCSSPageSize:true });
    return pdf;
  } finally { await browser.close(); }
}

// folder key for a property's uploaded compliance docs, e.g. public/docs/<key>/
function docKey(property){ return String(property.id).replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,''); }
function certFiles(property, PUB){
  const dirs = [ path.join(PUB,'docs',docKey(property)), path.join(PUB,'docs','_shared') ];
  let files = [];
  for(const dir of dirs){ try{ if(fs.existsSync(dir)) files = files.concat(fs.readdirSync(dir).filter(f=>/\.pdf$/i.test(f)).sort().map(f=>path.join(dir,f))); }catch(e){} }
  return files;
}
// append the property's EPC/Gas/EICR + shared Guide onto the signed pack -> one PDF
async function appendCerts(packPdf, property, PUB){
  const files = certFiles(property, PUB);
  if(!files.length) return packPdf;
  let PDFLib; try{ PDFLib = require('pdf-lib'); }catch(e){ console.error('[certs] pdf-lib not installed — sending pack without certs'); return packPdf; }
  try{
    const out = await PDFLib.PDFDocument.load(packPdf);
    for(const f of files){
      try{ const src = await PDFLib.PDFDocument.load(fs.readFileSync(f)); const pages = await out.copyPages(src, src.getPageIndices()); pages.forEach(p=>out.addPage(p)); }
      catch(e){ console.error('[certs] skipped', f, e.message); }
    }
    return Buffer.from(await out.save());
  }catch(e){ console.error('[certs] merge failed:', e.message); return packPdf; }
}

async function emailPack(opts){
  const { RESEND_API_KEY, MAIL_FROM, MAIL_TO, to, tenant, prop, pdf } = opts;
  if(!RESEND_API_KEY) throw new Error('RESEND_API_KEY not set');
  const html = '<div style="font-family:Arial,sans-serif;color:#0A1D2E">'+
    '<h2 style="font-family:Georgia,serif">Gower Living — tenancy pack</h2>'+
    '<p>The tenancy pack for <b>'+esc(tenant)+'</b> at <b>'+esc(prop)+'</b> is attached as a PDF.</p>'+
    '<p>Print a copy for the contract-holder to take to Jobcentre Plus, and keep the signed pack on file.</p>'+
    '<p style="color:#6b6f76;font-size:12px">Gower Capital Group Ltd, trading as Gower Living · 24 Conway Road, Penlan, Swansea SA5 7BG</p></div>';
  const body = {
    from: MAIL_FROM, to: to,
    subject: 'Tenancy pack — '+tenant+' — '+prop,
    html: html,
    attachments: [{ filename: ('Tenancy Pack - '+tenant+'.pdf').replace(/[\\/:*?"<>|]/g,'-'), content: Buffer.from(pdf).toString('base64') }]
  };
  const r = await fetch('https://api.resend.com/emails', {
    method:'POST', headers:{'Authorization':'Bearer '+RESEND_API_KEY,'Content-Type':'application/json'}, body: JSON.stringify(body) });
  if(!r.ok) throw new Error('Resend '+r.status+' '+(await r.text()).slice(0,200));
  return r.json();
}

function landlordSig(PUB){
  try{
    const p = path.join(PUB,'assets','alex-signature.png');
    if(fs.existsSync(p)) return 'data:image/png;base64,'+fs.readFileSync(p).toString('base64');
  }catch(e){}
  return '';
}
function logoDataUrl(PUB){
  try{
    const p = path.join(PUB,'assets','svg','gower-living-primary-navy.svg');
    if(fs.existsSync(p)) return 'data:image/svg+xml;base64,'+fs.readFileSync(p).toString('base64');
  }catch(e){}
  return '';
}
function logoDataUrlCream(PUB){
  try{
    const p = path.join(PUB,'assets','svg','gower-living-primary-cream.svg');
    if(fs.existsSync(p)) return 'data:image/svg+xml;base64,'+fs.readFileSync(p).toString('base64');
  }catch(e){}
  return '';
}

// ---- remote signing: email a link, tenant signs on their own device ----
function signMessage(text){
  return '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<div style="font-family:system-ui,sans-serif;max-width:560px;margin:60px auto;padding:24px;text-align:center;color:#0A1D2E">'+
    '<h2 style="font-family:Georgia,serif">Gower Living</h2><p style="font-size:1.05rem">'+esc(text)+'</p></div>';
}

async function emailSignLink(opts){
  const { RESEND_API_KEY, MAIL_FROM, to, tenant, prop, link } = opts;
  if(!RESEND_API_KEY) throw new Error('RESEND_API_KEY not set');
  const html = '<div style="font-family:Arial,sans-serif;color:#0A1D2E;max-width:560px">'+
    '<h2 style="font-family:Georgia,serif">Your new home with Gower Living</h2>'+
    '<p>Hello '+esc(tenant)+',</p>'+
    '<p>Your tenancy for <b>'+esc(prop)+'</b> is ready to sign. Please review the documents and add your signature — it only takes a minute, on your phone or tablet.</p>'+
    '<p style="margin:22px 0"><a href="'+esc(link)+'" style="background:#CFA24A;color:#0A1D2E;text-decoration:none;font-weight:700;border-radius:999px;padding:13px 24px;display:inline-block">Review &amp; sign</a></p>'+
    '<p style="color:#6b6f76;font-size:13px">Or paste this into your browser:<br>'+esc(link)+'</p>'+
    '<p style="color:#6b6f76;font-size:12px">Gower Capital Group Ltd, trading as Gower Living &middot; 24 Conway Road, Penlan, Swansea SA5 7BG</p></div>';
  const r = await fetch('https://api.resend.com/emails',{method:'POST',headers:{'Authorization':'Bearer '+RESEND_API_KEY,'Content-Type':'application/json'},
    body:JSON.stringify({from:MAIL_FROM,to:to,subject:'Your Gower Living tenancy — review and sign',html})});
  if(!r.ok) throw new Error('Resend '+r.status+' '+(await r.text()).slice(0,200));
  return r.json();
}

function signHTML(rec, token, logo, logoCream){
  const prop = esc(rec.property);
  const tenant = esc(((rec.title?rec.title+' ':'')+rec.fullName).trim());
  const rentTxt = rec.rent ? ('£'+parseFloat(rec.rent).toFixed(2)+' per calendar month') : '';
  const term = (rec.termMonths||'6')+'-month fixed term';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Review &amp; sign — Gower Living</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Outfit:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600&display=swap" rel="stylesheet">
<style>
:root{--harbour:#0A1D2E;--cream:#F6F2E8;--stone:#E7E2D7;--gold:#CFA24A;--coastal:#1E3A53;--grey:#6b6f76;--red:#C0392B;--green:#2E7D52}
*{box-sizing:border-box}body{margin:0;background:var(--stone);font-family:'Plus Jakarta Sans',system-ui,sans-serif;color:var(--harbour)}
.wrap{max-width:620px;margin:0 auto;padding:18px}
.card{background:#fff;border-radius:16px;box-shadow:0 10px 40px rgba(10,29,46,.10);overflow:hidden}
.banner{background:var(--harbour);color:var(--cream);padding:20px 24px}
.banner img{height:34px;display:block;margin-bottom:8px}
.banner h1{font-family:'Outfit';font-weight:700;font-size:1.35rem;margin:0}
.body{padding:20px 24px}
.kv{width:100%;border-collapse:collapse;margin:4px 0 14px}
.kv th{text-align:left;color:var(--grey);font-weight:600;font-size:.82rem;padding:5px 12px 5px 0;white-space:nowrap;vertical-align:top}
.kv td{padding:5px 0;font-weight:600}
.review{display:inline-block;margin:2px 0 16px;color:var(--coastal);font-weight:600}
.sigwrap{border:1.5px dashed var(--coastal);border-radius:12px;background:#fffdf7;padding:8px}
canvas{width:100%;height:200px;touch-action:none;background:#fff;border-radius:8px;display:block}
.sigbar{display:flex;justify-content:space-between;align-items:center;margin-top:6px}
.chk{display:flex;gap:9px;align-items:flex-start;font-size:.92rem;margin:14px 0}.chk input{margin-top:3px}
.btn{border:0;border-radius:999px;padding:14px 24px;font-family:'Outfit';font-weight:600;font-size:1.05rem;cursor:pointer;width:100%}
.btn-gold{background:var(--gold);color:var(--harbour)}.btn-gold:disabled{opacity:.45}
.btn-ghost{background:transparent;border:1.5px solid var(--coastal);color:var(--harbour);font-size:.85rem;padding:8px 14px;width:auto;border-radius:999px;cursor:pointer}
.msg{margin-top:12px;font-weight:600;text-align:center}.msg.err{color:var(--red)}
.done{text-align:center;padding:24px}.done .tick{font-size:3rem;color:var(--green);line-height:1}
.gold{color:var(--gold)}small{color:var(--grey)}
</style></head><body>
<div class="wrap"><div class="card">
<div class="banner"><img src="${logoCream||logo}" alt="Gower Living"><h1>Review &amp; sign your tenancy<span class="gold">.</span></h1></div>
<div class="body" id="main">
  <table class="kv">
    <tr><th>Home</th><td>${prop}</td></tr>
    <tr><th>Contract-holder</th><td>${tenant}</td></tr>
    <tr><th>Rent</th><td>${esc(rentTxt)}</td></tr>
    <tr><th>Term</th><td>${esc(term)}</td></tr>
  </table>
  <a class="review" href="/sign/${esc(token)}/preview.pdf" target="_blank" rel="noopener">▸ Review the documents (PDF)</a>
  <p><b>Sign below</b> with your finger or a stylus:</p>
  <div class="sigwrap"><canvas id="sig"></canvas>
    <div class="sigbar"><small>Your signature on your occupation contract and pack.</small>
    <button type="button" class="btn-ghost" id="clear">Clear</button></div></div>
  <label class="chk"><input type="checkbox" id="agree"><span>I have reviewed the documents and I agree to the occupation contract and the documents in my pack.</span></label>
  <button class="btn btn-gold" id="go" disabled>Agree &amp; Sign</button>
  <div id="msg" class="msg"></div>
</div></div></div>
<script>
(function(){
  var c=document.getElementById('sig'),ctx=c.getContext('2d'),drawing=false,did=false,last=null;
  function fit(){var r=c.getBoundingClientRect();var dpr=window.devicePixelRatio||1;c.width=Math.round(r.width*dpr);c.height=Math.round(r.height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.lineWidth=2.4;ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle='#0A1D2E';}
  fit();window.addEventListener('resize',fit);
  function pos(e){var r=c.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top};}
  c.addEventListener('pointerdown',function(e){drawing=true;did=true;last=pos(e);try{c.setPointerCapture(e.pointerId);}catch(_){}e.preventDefault();});
  c.addEventListener('pointermove',function(e){if(!drawing)return;var p=pos(e);ctx.beginPath();ctx.moveTo(last.x,last.y);ctx.lineTo(p.x,p.y);ctx.stroke();last=p;e.preventDefault();});
  function up(){drawing=false;sync();}c.addEventListener('pointerup',up);c.addEventListener('pointercancel',up);c.addEventListener('pointerleave',up);
  document.getElementById('clear').addEventListener('click',function(){ctx.clearRect(0,0,c.width,c.height);did=false;sync();});
  var agree=document.getElementById('agree'),go=document.getElementById('go'),msg=document.getElementById('msg');
  function sync(){go.disabled=!(did&&agree.checked);}
  agree.addEventListener('change',sync);
  go.addEventListener('click',function(){
    if(go.disabled)return;go.disabled=true;msg.className='msg';msg.textContent='Signing…';
    fetch('/api/sign/${esc(token)}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({tenantSignature:c.toDataURL('image/png')})})
    .then(function(r){return r.json();}).then(function(j){
      if(j.ok){document.getElementById('main').innerHTML='<div class="done"><div class="tick">✓</div><h2>Signed — all done.</h2><p>A signed copy has been emailed to you. You can also <a href="/sign/${esc(token)}/preview.pdf" target="_blank">download it here</a>.</p></div>';}
      else{go.disabled=false;msg.className='msg err';msg.textContent='Error: '+(j.error||'unknown');}
    }).catch(function(e){go.disabled=false;msg.className='msg err';msg.textContent='Error: '+e.message;});
  });
})();
</script></body></html>`;
}

module.exports = function mountTenancy(app, deps){
  deps = deps || {};
  const requireAuth = deps.requireAuth || ((req,res,next)=>next());
  const data = deps.data;
  const PUB = deps.PUB || path.join(process.cwd(),'public');
  const PUBLIC_URL = (process.env.PUBLIC_URL||'').replace(/\/$/,'');
  const cfg = {
    RESEND_API_KEY: process.env.RESEND_API_KEY||'',
    MAIL_FROM: process.env.MAIL_FROM||'Gower Living <onboarding@resend.dev>',
    MAIL_TO: process.env.MAIL_TO||'mail@gowercapitalgroup.com',
    LOGO_URL: logoDataUrl(PUB) || (PUBLIC_URL ? PUBLIC_URL+'/assets/svg/gower-living-primary-navy.svg' : '/assets/svg/gower-living-primary-navy.svg')
  };

  cfg.LOGO_CREAM = logoDataUrlCream(PUB) || cfg.LOGO_URL;
  const propLabel = p => (p.room?p.room+', ':'')+p.address+', '+p.postcode;
  // Fixed deposit-scheme details — set once here and printed on every pack (no re-typing).
  const DEPOSIT_SCHEME = 'The Tenancy Deposit Scheme (TDS, insured)';
  const TDS_NUMBER = '16017 (TDS Landlord ID)';
  function recFromBody(b, property){
    return { kind:'tenancy', propertyId:property.id, property:propLabel(property),
      title:b.title, fullName:b.fullName, dob:b.dob, ni:b.ni, mobile:b.mobile, email:b.email,
      rent:b.rent, deposit:b.deposit, depositScheme:DEPOSIT_SCHEME,
      depositRef:TDS_NUMBER, occupationDate:b.occupationDate, termMonths:b.termMonths,
      paymentDay:b.paymentDay, apa:b.apa||[] };
  }
  async function renderRecord(rec, tenantSignature){
    const property = PROPERTIES.find(p=>p.id===rec.propertyId);
    if(!property) throw new Error('Unknown property');
    const d = Object.assign({}, rec, { property, tenantSignature: tenantSignature||rec.tenantSignature||'',
      landlordSignature: landlordSig(PUB), logoUrl: cfg.LOGO_URL });
    const pdf = await appendCerts(await renderPDF(packHTML(d)), property, PUB);
    return { pdf, property };
  }
  const findByToken = t => (data&&data.list) ? data.list().find(r=>r.kind==='tenancy'&&r.token===t) : null;
  const expired = rec => ((Date.now()-new Date(rec.created_at||Date.now()).getTime())/86400000) > 14;

  // ---- staff form ---- (serve the form when signed in; otherwise bounce to the /admin
  // login page rather than returning a raw "Not signed in" JSON error)
  function serveForm(req,res){
    if(req.session && req.session.auth) return res.type('html').send(formHTML());
    res.redirect('/admin');
  }
  app.get('/admin/new-tenancy', serveForm);
  app.get('/newtenancy', serveForm);   // clean alias: gowerliving.wales/newtenancy

  // ---- admin: per-property compliance document folders ----
  app.get('/admin/tenancy-docs', requireAuth, (req,res)=>{
    const rows = PROPERTIES.map(p=>{
      const files = certFiles(p, PUB).map(f=>path.basename(f));
      return '<tr><td style="padding:6px;border-bottom:1px solid #eee">'+esc(p.label)+'</td><td style="padding:6px;border-bottom:1px solid #eee"><code>public/docs/'+esc(docKey(p))+'/</code></td><td style="padding:6px;border-bottom:1px solid #eee">'+(files.length?files.map(esc).join(', '):'<span style="color:#C0392B">none yet</span>')+'</td></tr>';
    }).join('');
    res.type('html').send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tenancy documents</title>'+
      '<div style="font-family:system-ui,sans-serif;max-width:920px;margin:30px auto;padding:0 16px;color:#0A1D2E">'+
      '<h2 style="font-family:Georgia,serif">Per-property compliance documents</h2>'+
      '<p>Put each property’s current <b>EPC, Gas Safety certificate and EICR</b> (as PDFs) into the folder shown — they are appended to every pack for that property. The shared <b>Guide for Tenants in Wales</b> goes in <code>public/docs/_shared/</code>.</p>'+
      '<table style="border-collapse:collapse;width:100%;font-size:14px"><tr style="background:#0A1D2E;color:#fff"><th style="text-align:left;padding:7px">Property</th><th style="text-align:left;padding:7px">Upload folder</th><th style="text-align:left;padding:7px">PDFs found</th></tr>'+rows+'</table></div>');
  });

  // ---- create: sign in person now, OR email the tenant a signing link ----
  app.post('/api/create-tenancy', requireAuth, async (req,res)=>{
    try{
      const b = req.body||{};
      const property = PROPERTIES.find(p=>p.id===b.propertyId);
      if(!property) return res.status(400).json({ok:false,error:'Unknown property'});
      if(!b.fullName||!b.email||!b.ni||!b.dob||!b.occupationDate||!b.rent) return res.status(400).json({ok:false,error:'Missing required field'});
      const tenant = ((b.title?b.title+' ':'')+b.fullName).trim();
      const prop = propLabel(property);
      const rec = recFromBody(b, property);

      if(b.mode==='send-link'){
        rec.token = crypto.randomBytes(24).toString('hex');
        rec.status = 'Awaiting signature';
        if(data&&data.add){ try{ data.add(rec); }catch(e){} }
        const link = (PUBLIC_URL||('http://localhost:'+(process.env.PORT||3000)))+'/sign/'+rec.token;
        await emailSignLink({ ...cfg, to:[b.email], tenant, prop, link });
        return res.json({ ok:true, mode:'link', sentTo:[b.email] });
      }

      if(!b.tenantSignature) return res.status(400).json({ok:false,error:'Tenant signature required'});
      const { pdf } = await renderRecord(rec, b.tenantSignature);
      const to = [cfg.MAIL_TO]; if(b.email) to.push(b.email);
      await emailPack({ ...cfg, to, tenant, prop, pdf });
      if(data&&data.add){ rec.status='Signed (in person)'; rec.signedAt=new Date().toISOString(); rec.tenantSignature=b.tenantSignature; try{ data.add(rec); }catch(e){} }
      res.json({ ok:true, mode:'sent', sentTo: to });
    }catch(e){ console.error('[create-tenancy] failed:', e.message); res.status(500).json({ok:false,error:e.message}); }
  });

  // ---- tenant signing page (public, token-gated) ----
  app.get('/sign/:token', (req,res)=>{
    const rec = findByToken(req.params.token);
    if(!rec) return res.status(404).type('html').send(signMessage('This signing link is not valid. Please contact Gower Living.'));
    if(rec.status==='Signed') return res.type('html').send(signMessage('This tenancy has already been signed — a copy has been emailed to you.'));
    if(expired(rec)) return res.type('html').send(signMessage('This signing link has expired. Please contact Gower Living for a new one.'));
    res.type('html').send(signHTML(rec, req.params.token, cfg.LOGO_URL, cfg.LOGO_CREAM));
  });

  // preview the documents before signing (and download the signed copy afterwards)
  app.get('/sign/:token/preview.pdf', async (req,res)=>{
    const rec = findByToken(req.params.token);
    if(!rec) return res.status(404).send('Not found');
    try{ const { pdf } = await renderRecord(rec, ''); res.type('pdf').set('Content-Disposition','inline; filename="gower-living-tenancy-pack.pdf"').send(Buffer.from(pdf)); }
    catch(e){ res.status(500).send(e.message); }
  });

  // tenant submits their signature -> render, email landlord + tenant, mark signed
  app.post('/api/sign/:token', async (req,res)=>{
    try{
      const rec = findByToken(req.params.token);
      if(!rec) return res.status(404).json({ok:false,error:'Invalid link'});
      if(rec.status==='Signed') return res.json({ok:true, already:true});
      if(expired(rec)) return res.status(410).json({ok:false,error:'This signing link has expired.'});
      const sig = (req.body||{}).tenantSignature;
      if(!sig) return res.status(400).json({ok:false,error:'Signature required'});
      const { pdf, property } = await renderRecord(rec, sig);
      const tenant = ((rec.title?rec.title+' ':'')+rec.fullName).trim();
      const to = [cfg.MAIL_TO]; if(rec.email) to.push(rec.email);
      await emailPack({ ...cfg, to, tenant, prop: propLabel(property), pdf });
      if(data&&data.update){ try{ data.update(rec.id, { status:'Signed', signedAt:new Date().toISOString(), tenantSignature:sig }); }catch(e){} }
      res.json({ ok:true, sentTo: to });
    }catch(e){ console.error('[sign] failed:', e.message); res.status(500).json({ok:false,error:e.message}); }
  });

  console.log('[tenancy] Create New Tenancy mounted at /admin/new-tenancy  (remote signing: /sign/:token)');
};

// expose internals for local testing
module.exports.packHTML = packHTML;
module.exports.formHTML = formHTML;
module.exports.signHTML = signHTML;
module.exports.appendCerts = appendCerts;
module.exports.docKey = docKey;
module.exports.PROPERTIES = PROPERTIES;
