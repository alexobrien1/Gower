// Internal applicant screening — authoritative, runs on the server.
// Rules: exclude many convictions or active drug dependency; prefer PIP;
// under-35 must have 3+ months in temporary accommodation.

function ageFrom(dob){
  if(!dob) return null;
  const d=new Date(dob), n=new Date();
  let a=n.getFullYear()-d.getFullYear();
  const m=n.getMonth()-d.getMonth();
  if(m<0||(m===0&&n.getDate()<d.getDate())) a--;
  return a;
}
function monthsSince(d){
  if(!d) return null;
  const s=new Date(d), n=new Date();
  return (n.getFullYear()-s.getFullYear())*12+(n.getMonth()-s.getMonth());
}

const MANY_CONVICTIONS = 6;
const SERIOUS = /sexual|child|rape|strangulat|grievous|\bgbh\b|kill|arson|weapon|knife|assault|violen/i;

function screen(r){
  const reasons=[], flags=[]; let hard=false;
  const age=ageFrom(r.dob);
  const benefit=Array.isArray(r.benefit)?r.benefit:(r.benefit?[r.benefit]:[]);
  const pip=benefit.includes('PIP');
  const inTemp=['Temporary / emergency accommodation','Homeless / no fixed abode','Leaving prison or custody'].includes(r.situation);
  const tempMonths=r.tempSince?monthsSince(r.tempSince):null;

  if(r.drug==='Active'){ hard=true; reasons.push('Currently struggling with drugs/alcohol (active dependency)'); }
  const cc=parseInt(r.convCount||'0',10);
  if(cc>=MANY_CONVICTIONS){ hard=true; reasons.push('Many convictions ('+cc+' offences)'); }
  if(age!==null && age<35){
    const m = inTemp ? (tempMonths!=null?tempMonths:null) : 0;
    if(m===null) flags.push('Under 35 — confirm 3+ months in temporary accommodation (date missing)');
    else if(m<3){ hard=true; reasons.push('Under 35 with under 3 months in temporary accommodation (your rule)'); }
    else reasons.push('Under 35 with '+m+' months in temporary accommodation — rule met');
  }
  const txt=((r.convDetail||'')+' '+(r.hasConv||'')).toString();
  if(SERIOUS.test(txt)) flags.push('Serious offence noted — safeguarding/risk assessment needed; not suitable for shared HMO');
  if(r.drug==='In treatment') flags.push('In drug/alcohol treatment — managed, monitor');
  if(r.probation==='Yes') flags.push('On probation / licence');
  if(r.arrears==='Yes') flags.push('Past rent arrears');
  if(r.evicted==='Yes') flags.push('Previous eviction / possession order');
  if(r.mptl==='No') flags.push('Declined Managed Payment — higher arrears risk');

  let rec;
  if(hard) rec='EXCLUDE';
  else if(flags.some(f=>f.startsWith('Serious offence'))) rec='FLAG';
  else if(flags.length) rec='BORDERLINE';
  else rec='SHORTLIST';
  if(pip && rec!=='EXCLUDE') reasons.unshift('On PIP (preferred)');

  return { rec, reasons, flags, age, pip, tempMonths: inTemp?tempMonths:null };
}

const RECLABEL={SHORTLIST:'Shortlist',FLAG:'Meets criteria – serious flag',BORDERLINE:'Borderline',EXCLUDE:'Exclude'};
const STATUSES=['New','Reviewing','Offer made','Rejected','Archived'];

module.exports={ screen, ageFrom, monthsSince, RECLABEL, STATUSES };
