const APPS_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxzcjnZQyhtOpsO3jWZffwQHYBdvDI5Qi3USN4UhMJNMwpl2T6DyvNDFVFFuVCUOZFP5g/exec";
const AI_ENABLED = true; // mettre false pour désactiver les analyses IA

const C = {
  bg:"#0A0A0E", surface:"#131318", card:"#1B1B22", card2:"#20202A", border:"#2A2A34",
  cyan:"#7DD3E8", purple:"#A78BFA", green:"#7EE0A8", amber:"#F2C077", red:"#F2867A",
  text:"#F5F5F7", sub:"#8B8B99", mono:"#6E6E7C"
};

const el = (tag, props={}, ...children) => {
  const e = document.createElement(tag);
  const {style, onClick, ...attrs} = props;
  if(style) Object.assign(e.style, style);
  if(onClick) e.addEventListener("click", onClick);
  Object.entries(attrs).forEach(([k,v]) => { if(v!==undefined && k!=="style" && k!=="onClick") e.setAttribute(k,v); });
  children.flat().forEach(c => { if(c==null) return; e.appendChild(typeof c==="string" ? document.createTextNode(c) : c); });
  return e;
};

function scoreColor(s){ return s>=70?C.green:s>=40?C.amber:C.red; }

const MONTHS_FR = {"janv":1,"févr":2,"fevr":2,"mars":3,"avr":4,"mai":5,"juin":6,"juil":7,"août":8,"aout":8,"sept":9,"oct":10,"nov":11,"déc":12,"dec":12};

function parseAnyDate(raw){
  const s = String(raw||"").trim();
  if(!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if(m) return {year:+m[1], month:+m[2], day:+m[3]};
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if(m) return {year:+m[3], month:+m[2], day:+m[1]};
  m = s.match(/^(\d{1,2})\s+([a-zA-Zéû]+)\.?\s+(\d{4})/i);
  if(m){
    const key = m[2].toLowerCase().replace(/\.$/,"").slice(0,5);
    const monthNum = MONTHS_FR[key] || MONTHS_FR[key.slice(0,4)] || MONTHS_FR[key.slice(0,3)];
    if(monthNum) return {year:+m[3], month:monthNum, day:+m[1]};
  }
  return null;
}
function dateKey(raw){
  const d = parseAnyDate(raw);
  if(!d) return null;
  return `${d.year}-${String(d.month).padStart(2,"0")}-${String(d.day).padStart(2,"0")}`;
}
function dateLabel(raw){
  const d = parseAnyDate(raw);
  if(!d) return "";
  return `${String(d.day).padStart(2,"0")}/${String(d.month).padStart(2,"0")}`;
}
function keyToLabel(key){
  const [y,m,d] = key.split("-");
  return `${d}/${m}`;
}

function ringSVG(score,color,size=110,customLabel=null,strokeW=null){
  const stroke = strokeW || Math.max(6, size*0.065);
  const r=(size-stroke)/2, c=2*Math.PI*r;
  const offset=c-(Math.max(0,Math.min(100,score))/100)*c;
  const wrap=el("div",{style:{position:"relative",width:size+"px",height:size+"px",flexShrink:"0"}});
  wrap.innerHTML=`<svg width="${size}" height="${size}" style="transform:rotate(-90deg)">
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${C.border}" stroke-width="${stroke}"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
      stroke-dasharray="${c}" stroke-dashoffset="${offset}" stroke-linecap="round" style="transition:stroke-dashoffset 0.8s ease"/>
  </svg>`;
  wrap.appendChild(el("div",{style:{position:"absolute",top:"0",left:"0",width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}},
    el("div",{style:{fontFamily:"Syne,sans-serif",fontSize:(size*0.24)+"px",fontWeight:"800",color}},customLabel!==null?customLabel:Math.round(score)+"%")
  ));
  return wrap;
}

// Anneau multi-segments (pour le détail des phases de sommeil)
function multiRingSVG(segments, size=200, strokeW=null, centerLabel=null, centerSub=null){
  const stroke = strokeW || size*0.11;
  const r=(size-stroke)/2, c=2*Math.PI*r;
  const total = segments.reduce((a,s)=>a+s.value,0) || 1;
  let offsetAcc = 0;
  const wrap = el("div",{style:{position:"relative",width:size+"px",height:size+"px"}});
  let circles = "";
  segments.forEach(seg=>{
    const frac = seg.value/total;
    const dash = frac*c;
    circles += `<circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${seg.color}" stroke-width="${stroke}"
      stroke-dasharray="${dash} ${c-dash}" stroke-dashoffset="${-offsetAcc}" stroke-linecap="butt" data-idx="${seg.idx}"/>`;
    offsetAcc += dash;
  });
  wrap.innerHTML = `<svg width="${size}" height="${size}" style="transform:rotate(-90deg)">${circles}</svg>`;
  const centerWrap = el("div",{style:{position:"absolute",top:"0",left:"0",width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",pointerEvents:"none"}});
  if(centerLabel) centerWrap.appendChild(el("div",{style:{fontFamily:"Syne,sans-serif",fontSize:(size*0.16)+"px",fontWeight:"800",color:C.text}},centerLabel));
  if(centerSub) centerWrap.appendChild(el("div",{style:{fontSize:(size*0.055)+"px",color:C.sub,marginTop:"2px"}},centerSub));
  wrap.appendChild(centerWrap);
  return wrap;
}

async function fetchAllData(){
  try{
    const res = await fetch(APPS_SCRIPT_URL);
    const json = await res.json();
    const norm = arr=>(arr||[]).map(r=>{const o={};Object.keys(r).forEach(k=>{o[k.trim()]=r[k];});return o;});
    return {watch:norm(json.watch), checkin:norm(json.checkin)};
  }catch(e){ return {watch:[], checkin:[]}; }
}

function dedupeByDay(watchData){
  const map = {};
  watchData.forEach(r=>{
    const k = dateKey(r.date);
    if(!k) return;
    map[k] = r; // dernière occurrence du jour l'emporte
  });
  return Object.keys(map).sort().map(k=>({...map[k], _key:k}));
}

function bioAge(hrv,fcRepos,sommeil,realAge){
  const base = realAge || 25;
  let delta = 0;
  const hrvTarget = base<25?75:base<35?65:55;
  if(hrv>0){
    if(hrv>=hrvTarget+20) delta-=3; else if(hrv>=hrvTarget) delta-=1;
    else if(hrv>=hrvTarget-15) delta+=1; else if(hrv>=hrvTarget-30) delta+=3; else delta+=5;
  }
  if(fcRepos>0){
    if(fcRepos<=45) delta-=4; else if(fcRepos<=55) delta-=2; else if(fcRepos<=65) delta+=0;
    else if(fcRepos<=75) delta+=2; else delta+=4;
  }
  if(sommeil>0){
    if(sommeil>=8) delta-=2; else if(sommeil>=7) delta-=1; else if(sommeil>=6) delta+=1; else delta+=3;
  }
  return Math.max(10, Math.round(base+delta));
}

function computeRecovery(row){
  const hrv = parseFloat(row.HRV||0)||0;
  const fc = parseFloat(row.FC_repos||0)||0;
  const sleep = parseFloat(row.sommeil_h||0)||0;
  let total=0, weight=0;
  if(hrv>0){ total += Math.min(hrv/80,1)*100*0.4; weight+=0.4; }
  if(sleep>0){ total += Math.min(sleep/8,1)*100*0.4; weight+=0.4; }
  if(fc>0){ total += Math.max(0,100-((fc-45)/(80-45))*100)*0.2; weight+=0.2; }
  return weight>0 ? Math.min(100, Math.round(total/weight*100)/100) : 0;
}

// Proxy de charge d'entraînement (pas un algorithme propriétaire type "Strain")
function computeLoad(row){
  const steps = parseFloat(row.pas||0)||0;
  const cal = parseFloat(row.calories||0)||0;
  const stress = parseFloat(row.stress||0)||0;
  let total=0, weight=0;
  if(steps>0){ total += Math.min(steps/12000,1)*100*0.4; weight+=0.4; }
  if(cal>0){ total += Math.min(cal/700,1)*100*0.4; weight+=0.4; }
  if(stress>0){ total += Math.min(stress/100,1)*100*0.2; weight+=0.2; }
  return weight>0 ? Math.round(total/weight) : 0;
}

function navBar(active){
  const items = [
    {href:"index.html", label:"Aujourd'hui", key:"today"},
    {href:"sleep.html", label:"Sommeil", key:"sleep"},
    {href:"calendar.html", label:"Calendrier", key:"calendar"},
    {href:"trends.html", label:"Tendances", key:"trends"},
  ];
  const header = el("div",{style:{background:C.surface,borderBottom:`1px solid ${C.border}`,padding:"0 16px",position:"sticky",top:"0",zIndex:"100"}});
  const inner = el("div",{style:{maxWidth:"640px",margin:"0 auto",display:"flex",alignItems:"center",height:"54px",gap:"4px"}});
  inner.appendChild(el("div",{style:{display:"flex",alignItems:"center",gap:"8px",marginRight:"12px"}},
    el("div",{style:{width:"24px",height:"24px",borderRadius:"7px",background:`linear-gradient(135deg,${C.purple},${C.cyan})`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"12px",fontWeight:"800",color:"#0A0A0E",fontFamily:"Syne,sans-serif",flexShrink:"0"}},"A")
  ));
  const nav = el("div",{style:{display:"flex",gap:"2px",overflowX:"auto",flex:"1"}});
  items.forEach(it=>{
    const isActive = it.key===active;
    const a = document.createElement("a");
    a.href = it.href;
    a.textContent = it.label;
    Object.assign(a.style,{
      padding:"6px 10px", borderRadius:"8px", fontSize:"12px", fontWeight: isActive?"700":"500",
      color: isActive?C.text:C.sub, background: isActive?C.card2:"transparent",
      textDecoration:"none", whiteSpace:"nowrap", fontFamily:"Inter,sans-serif", flexShrink:"0"
    });
    nav.appendChild(a);
  });
  inner.appendChild(nav);
  header.appendChild(inner);
  return header;
}

const BASE_STYLE = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${C.bg}; color: ${C.text}; font-family: Inter, system-ui, sans-serif; min-height: 100vh; }
  button { font-family: inherit; cursor: pointer; }
  ::-webkit-scrollbar { width: 4px; height: 4px; }
  ::-webkit-scrollbar-thumb { background: ${C.border}; border-radius: 2px; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
`;
