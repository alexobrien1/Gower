(function(){
  const $=s=>document.querySelector(s);
  const RECLABEL={SHORTLIST:'Shortlist',FLAG:'Meets criteria – serious flag',BORDERLINE:'Borderline',EXCLUDE:'Exclude'};
  const STATUSES=['New','Reviewing','Offer made','Rejected','Archived'];
  const GROUPS={Active:['New','Reviewing'],Offers:['Offer made'],Rejected:['Rejected'],Archived:['Archived'],All:null};
  const TABORDER=['Active','Offers','Rejected','Archived','All'];
  const statusClass=s=>({'Offer made':'Offer'})[s]||s;
  let ALL=[], tab='Active';

  async function api(method,url,body){
    const opt={method,headers:{}};
    if(body){opt.headers['Content-Type']='application/json';opt.body=JSON.stringify(body);}
    const r=await fetch(url,opt); let j={}; try{j=await r.json();}catch(e){}
    return {ok:r.ok,status:r.status,json:j};
  }
  const fmtDate=ts=>{const d=new Date(ts);return isNaN(d)?(ts||''):d.toLocaleDateString('en-GB');};
  const esc=v=>String(v==null?'':v).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

  async function boot(){
    const me=await api('GET','/api/me');
    if(me.json && me.json.auth){ showPanel(); } else { $('#gate').style.display='block'; }
  }
  async function doLogin(){
    const r=await api('POST','/api/login',{password:$('#passcode').value});
    if(r.ok){ $('#gate').style.display='none'; showPanel(); }
    else { $('#loginErr').textContent='Wrong passcode — try again.'; }
  }
  async function showPanel(){ $('#panel').style.display='block'; $('#whoami').textContent='Applications · private'; await load(); }
  async function load(){ const r=await api('GET','/api/applications'); ALL=(r.json&&r.json.rows)||[]; renderTabs(); renderKPIs(); renderTable(); }

  function groupOf(s){ s=s||'New'; for(const g in GROUPS){ if(GROUPS[g]&&GROUPS[g].includes(s)) return g; } return 'Active'; }
  function renderTabs(){
    $('#tabs').innerHTML=TABORDER.map(t=>{
      const n = t==='All'?ALL.length:ALL.filter(r=>GROUPS[t]&&GROUPS[t].includes(r.status||'New')).length;
      return `<button data-tab="${t}" class="${t===tab?'on':''}">${t}<span class="n">${n}</span></button>`;
    }).join('');
    document.querySelectorAll('#tabs button').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;renderTabs();renderTable();});
  }
  function renderKPIs(){
    const c={SHORTLIST:0,FLAG:0,BORDERLINE:0,EXCLUDE:0}; ALL.forEach(r=>c[r.verdict]++);
    $('#kpis').innerHTML=
      `<div class="kpi"><b>${ALL.length}</b><span>Total applications</span></div>`+
      `<div class="kpi"><b style="color:var(--bright-gold)">${c.SHORTLIST}</b><span>Shortlist</span></div>`+
      `<div class="kpi"><b>${c.FLAG}</b><span>Serious flag</span></div>`+
      `<div class="kpi"><b>${c.BORDERLINE}</b><span>Borderline</span></div>`+
      `<div class="kpi"><b>${c.EXCLUDE}</b><span>Exclude</span></div>`;
  }
  let VIEW=[];
  function renderTable(){
    const q=($('#search').value||'').toLowerCase(), fv=$('#fVerdict').value, fs=$('#fSite').value;
    VIEW=ALL.filter(r=>{
      const g=GROUPS[tab]; if(g && !g.includes(r.status||'New')) return false;
      if(fv && r.verdict!==fv) return false;
      if(fs && r.site!==fs) return false;
      if(q && !((r.firstName||'')+' '+(r.lastName||'')).toLowerCase().includes(q)) return false;
      return true;
    });
    $('#rows').innerHTML = VIEW.length ? VIEW.map((r,i)=>`
      <tr data-i="${i}">
        <td>${fmtDate(r.created_at)}</td>
        <td><b>${esc((r.firstName||'')+' '+(r.lastName||''))}</b></td>
        <td class="hide-sm">${esc(r.site||'')}</td>
        <td>${r.age??'?'}</td>
        <td>${r.pip?'<span class="pippill">PIP</span>':'<span class="muted">—</span>'}</td>
        <td><span class="status ${statusClass(r.status||'New')}">${esc(r.status||'New')}</span></td>
        <td><span class="chip ${r.verdict}">${RECLABEL[r.verdict]||r.verdict}</span></td>
      </tr>`).join('') : `<tr><td colspan="7" style="text-align:center;padding:26px">No applications in this list.</td></tr>`;
    document.querySelectorAll('#rows tr[data-i]').forEach(tr=>tr.onclick=()=>openDrawer(+tr.dataset.i));
  }

  const df=(k,v)=>v?`<div class="dfield"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`:'';
  function openDrawer(i){
    const r=VIEW[i];
    const vb={SHORTLIST:['var(--greenbg)','var(--green)'],FLAG:['var(--amberbg)','var(--amber)'],BORDERLINE:['var(--yellowbg)','var(--yellow)'],EXCLUDE:['var(--redbg)','var(--red)']}[r.verdict]||['var(--stone)','var(--harbour)'];
    const ben=(r.benefit||[]).join(', ');
    const opts=STATUSES.map(s=>`<option ${(r.status||'New')===s?'selected':''}>${s}</option>`).join('');
    $('#drawer').innerHTML=`
      <div class="dh"><button class="dclose" id="dclose">×</button>
        <h2>${esc((r.firstName||'')+' '+(r.lastName||''))}</h2>
        <div style="opacity:.8;font-size:.85rem">${esc(r.site||'')} · applied ${fmtDate(r.created_at)}</div></div>
      <div class="dbody">
        <div class="statusbar"><label style="font-weight:600">Status:</label>
          <select id="statusSel">${opts}</select>
          <span class="muted" style="font-size:.8rem">Set to “Rejected” to move to the Rejected list.</span></div>
        <div class="verdictbox" style="background:${vb[0]};color:${vb[1]}">
          <h3>${RECLABEL[r.verdict]||r.verdict}</h3>
          ${(r.reasons&&r.reasons.length)?`<ul>${r.reasons.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
          ${(r.flags&&r.flags.length)?`<div style="margin-top:8px;font-weight:600">Flags</div><ul>${r.flags.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:''}
        </div>
        ${df('Date of birth / age',(r.dob||'')+(r.age!=null?' · '+r.age:''))}
        ${df('Phone',r.phone)} ${df('Email',r.email)} ${df('NI number',r.ni)} ${df('Gender',r.gender)}
        ${df('Next of kin',[r.nokName,r.nokRelation,r.nokPhone,r.nokEmail].filter(Boolean).join(' · '))}
        ${df('Current situation',r.situation)} ${df('Temp accommodation',[r.tempProvider,r.tempSince?('since '+r.tempSince+(r.tempMonths!=null?(' · '+r.tempMonths+' months'):'')):''].filter(Boolean).join(' '))}
        ${df('Address',r.address)} ${df('Why looking',r.why)} ${df('Preference',r.preference)}
        ${df('Willing to share',r.willShare)} ${df('Wants to share with',r.shareWith==='Yes'?[r.sharePerson,r.shareRelation,r.sharePhone].filter(Boolean).join(' · '):r.shareWith)}
        ${df('Benefits',ben)} ${df('UC housing element',r.ucHousing&&('£'+r.ucHousing))} ${df('UC pay day',r.ucDay)} ${df('Time on UC',r.ucDuration)} ${df('PIP amount',r.pipAmount&&('£'+r.pipAmount))} ${df('Time on PIP',r.pipDuration)} ${df('Monthly income',r.income&&('£'+r.income))} ${df('Employment',r.employment)}
        ${df('Managed Payment consent',r.mptl)} ${df('Rent arrears',r.arrears==='Yes'?('Yes — '+(r.arrearsDetail||'')):r.arrears)} ${df('Benefit deductions',r.deductions==='Yes'?('Yes — '+(r.deductionsDetail||'')):r.deductions)}
        ${df('Previous landlord',[r.prevLandlord,r.prevLandlordContact].filter(Boolean).join(' · '))} ${df('Reference OK?',r.refOk)} ${df('Reason for leaving',r.reasonLeaving)} ${df('Evicted / possession',r.evicted==='Yes'?('Yes — '+(r.evictedDetail||'')):r.evicted)}
        ${df('General health',r.health)} ${df('Manage stairs?',r.stairs)} ${df('Mobility / disability needs',r.mobility)} ${df('Communicable disease',r.communicable==='Yes'?('Yes — '+(r.communicableDetail||'')):r.communicable)}
        ${df('Mental health — current',r.mh)} ${df('Mental health history',r.mhHistory)}
        ${df('Support worker',r.hasSupport==='Yes'?('Yes — '+(r.supportDetail||'')):r.hasSupport)} ${df('Care leaver',r.careLeaver)} ${df('Fleeing domestic abuse',r.dv)}
        ${df('Unspent convictions',r.hasConv)} ${df('Offence count',r.convCount)} ${df('On licence until',r.licenceUntil)} ${df('Offence detail',r.convDetail)} ${df('Restrictions / exclusion zones',r.convRestrictions)}
        ${df('Probation',r.probation==='Yes'?('Yes — '+(r.probDetail||'')):r.probation)}
        ${df('Drug / alcohol',r.drug+(r.drugDetail?(' — '+r.drugDetail):''))}
      </div>`;
    $('#dclose').onclick=closeDrawer;
    $('#statusSel').onchange=e=>changeStatus(r.id,e.target.value);
    $('#drawer').classList.add('on'); $('#overlay').classList.add('on');
  }
  function closeDrawer(){ $('#drawer').classList.remove('on'); $('#overlay').classList.remove('on'); }
  async function changeStatus(id,status){
    const r=await api('PATCH','/api/applications/'+id,{status});
    if(r.ok){ const rec=ALL.find(x=>x.id===id); if(rec)rec.status=status; renderTabs(); renderKPIs(); renderTable(); }
  }

  // wire up
  $('#loginBtn').onclick=doLogin;
  $('#passcode').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});
  $('#logoutBtn').onclick=async()=>{ await api('POST','/api/logout'); location.reload(); };
  $('#overlay').onclick=closeDrawer;
  ['#search','#fVerdict','#fSite'].forEach(s=>$(s).addEventListener('input',renderTable));
  ['#fVerdict','#fSite'].forEach(s=>$(s).addEventListener('change',renderTable));
  boot();
})();
