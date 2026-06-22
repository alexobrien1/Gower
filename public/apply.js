(function(){
  const $=s=>document.querySelector(s);
  const form=$('#applyForm');

  function radioCond(name,val,box){
    document.querySelectorAll('[name="'+name+'"]').forEach(el=>el.addEventListener('change',()=>{
      const chosen=document.querySelector('[name="'+name+'"]:checked');
      $('#'+box).classList.toggle('show', !!chosen && chosen.value===val);
    }));
  }
  function selCond(name,vals,box){
    const el=document.querySelector('[name="'+name+'"]');
    el.addEventListener('change',()=>$('#'+box).classList.toggle('show', vals.includes(el.value)));
  }
  selCond('situation',['Temporary / emergency accommodation','Homeless / no fixed abode','Leaving prison or custody'],'tempCond');
  radioCond('shareWith','Yes','shareCond');
  radioCond('arrears','Yes','arrearsCond');
  radioCond('deductions','Yes','dedCond');
  radioCond('evicted','Yes','evictedCond');
  radioCond('communicable','Yes','commCond');
  radioCond('hasConv','Yes','convCond');
  radioCond('probation','Yes','probCond');
  document.querySelector('[name="drug"]').addEventListener('change',e=>$('#drugCond').classList.toggle('show',['Past-stable','In treatment','Active'].includes(e.target.value)));
  document.querySelector('[name="hasSupport"]').addEventListener('change',e=>$('#supportCond').classList.toggle('show',e.target.value==='Yes'));
  $('#benefits').addEventListener('change',()=>{
    const uc=document.querySelector('[name="benefit"][value="Universal Credit"]').checked||document.querySelector('[name="benefit"][value="LCWRA"]').checked;
    const pip=document.querySelector('[name="benefit"][value="PIP"]').checked;
    $('#ucCond').classList.toggle('show',uc);
    $('#pipCond').classList.toggle('show',pip);
  });

  form.addEventListener('submit',async e=>{
    e.preventDefault();
    const errs=[]; form.querySelectorAll('.err').forEach(x=>x.classList.remove('err'));
    form.querySelectorAll('[required]').forEach(el=>{
      let ok=true;
      if(el.type==='radio') ok=!!form.querySelector('[name="'+el.name+'"]:checked');
      else if(el.type==='checkbox') ok=el.checked;
      else ok=!!el.value.trim();
      if(!ok){ errs.push(el); if(el.type!=='radio'&&el.type!=='checkbox') el.classList.add('err'); }
    });
    if(!form.querySelector('[name="benefit"]:checked')) errs.push('benefit');
    const box=$('#errlist');
    if(errs.length){ box.textContent='Please complete the required fields marked * (including at least one benefit option and both declaration boxes).'; box.classList.add('show'); box.scrollIntoView({behavior:'smooth',block:'center'}); return; }
    box.classList.remove('show');

    const rec={};
    new FormData(form).forEach((v,k)=>{ if(k==='benefit'){(rec.benefit=rec.benefit||[]).push(v);} else rec[k]=v; });
    rec.consent1=!!form.querySelector('[name="consent1"]').checked;
    rec.consent2=!!form.querySelector('[name="consent2"]').checked;

    let ok=false;
    try{
      const res=await fetch('/api/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(rec)});
      ok=res.ok;
    }catch(err){ ok=false; }
    if(!ok){ box.textContent='Sorry, something went wrong submitting your application. Please try again.'; box.classList.add('show'); return; }

    const name=rec.firstName||'';
    form.reset(); document.querySelectorAll('.cond').forEach(c=>c.classList.remove('show'));
    const msg=$('#formMsg');
    msg.textContent='Thank you, '+name+' — we’ve received your application. The housing team will be in touch.';
    msg.classList.add('show'); msg.scrollIntoView({behavior:'smooth',block:'center'});
    window.scrollTo({top:0,behavior:'smooth'});
  });
})();
