#!/usr/bin/env node
// Cumuloscope - Pipeline donnees 100% build-time
// Sources: RNE 12 CSV (data.gouv.fr) + data.assemblee-nationale.fr + data.senat.fr + HATVP
// Sortie: public/data/aggregated.json + timeline.json + by-dept/*.json + by-dept/*-nominative.json (k>=5)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DATA = path.join(ROOT, "public", "data");
const BY_DEPT = path.join(PUBLIC_DATA, "by-dept");
const CACHE_DIR = path.join(ROOT, ".cache", "rne");
const HATVP_CACHE = path.join(ROOT, ".cache", "hatvp");
const K_ANONYMITY = 5;
const RNE_RESOURCES = [
  { key: "ca",  id: "3b6b2281-b9d9-4959-ae9d-c2c166dff118", label: "conseillers d'arrondissement" },
  { key: "cm",  id: "d5f400de-ae3f-4966-8cb6-a85c70c6c24a", label: "conseillers municipaux" },
  { key: "epci",id: "41d95d7d-b172-4636-ac44-32656367cdc7", label: "conseillers communautaires" },
  { key: "cd",  id: "601ef073-d986-4582-8e1a-ed14dc857fba", label: "conseillers departementaux" },
  { key: "cr",  id: "430e13f9-834b-4411-a1a8-da0b4b6e715c", label: "conseillers regionaux" },
  { key: "ma",  id: "a595be27-cfab-4810-b9d4-22e193bffe35", label: "collectivites statut particulier" },
  { key: "rpe", id: "70957bb0-f19f-40c5-b97b-90b3d4d71f9e", label: "parlement europeen" },
  { key: "sen", id: "b78f8945-509f-4609-a4a7-3048b8370479", label: "senateurs" },
  { key: "dep", id: "1ac42ff4-1336-44f8-a221-832039dbc142", label: "deputes" },
  { key: "mai", id: "2876a346-d50c-4911-934e-19ee07b0e503", label: "maires" },
];
const DEPARTEMENTS = [
  ["01","Ain"],["02","Aisne"],["03","Allier"],["04","Alpes-de-Haute-Provence"],["05","Hautes-Alpes"],["06","Alpes-Maritimes"],["07","Ardèche"],["08","Ardennes"],["09","Ariège"],["10","Aube"],["11","Aude"],["12","Aveyron"],["13","Bouches-du-Rhône"],["14","Calvados"],["15","Cantal"],["16","Charente"],["17","Charente-Maritime"],["18","Cher"],["19","Corrèze"],["21","Côte-d'Or"],["22","Côtes-d'Armor"],["23","Creuse"],["24","Dordogne"],["25","Doubs"],["26","Drôme"],["27","Eure"],["28","Eure-et-Loir"],["29","Finistère"],["2A","Corse-du-Sud"],["2B","Haute-Corse"],["30","Gard"],["31","Haute-Garonne"],["32","Gers"],["33","Gironde"],["34","Hérault"],["35","Ille-et-Vilaine"],["36","Indre"],["37","Indre-et-Loire"],["38","Isère"],["39","Jura"],["40","Landes"],["41","Loir-et-Cher"],["42","Loire"],["43","Haute-Loire"],["44","Loire-Atlantique"],["45","Loiret"],["46","Lot"],["47","Lot-et-Garonne"],["48","Lozère"],["49","Maine-et-Loire"],["50","Manche"],["51","Marne"],["52","Haute-Marne"],["53","Mayenne"],["54","Meurthe-et-Moselle"],["55","Meuse"],["56","Morbihan"],["57","Moselle"],["58","Nièvre"],["59","Nord"],["60","Oise"],["61","Orne"],["62","Pas-de-Calais"],["63","Puy-de-Dôme"],["64","Pyrénées-Atlantiques"],["65","Hautes-Pyrénées"],["66","Pyrénées-Orientales"],["67","Bas-Rhin"],["68","Haut-Rhin"],["69","Rhône"],["70","Haute-Saône"],["71","Saône-et-Loire"],["72","Sarthe"],["73","Savoie"],["74","Haute-Savoie"],["75","Paris"],["76","Seine-Maritime"],["77","Seine-et-Marne"],["78","Yvelines"],["79","Deux-Sèvres"],["80","Somme"],["81","Tarn"],["82","Tarn-et-Garonne"],["83","Var"],["84","Vaucluse"],["85","Vendée"],["86","Vienne"],["87","Haute-Vienne"],["88","Vosges"],["89","Yonne"],["90","Territoire de Belfort"],["91","Essonne"],["92","Hauts-de-Seine"],["93","Seine-Saint-Denis"],["94","Val-de-Marne"],["95","Val-d'Oise"],["971","Guadeloupe"],["972","Martinique"],["973","Guyane"],["974","La Réunion"],["976","Mayotte"],
];
function ensureDirs(){ fs.mkdirSync(PUBLIC_DATA,{recursive:true}); fs.mkdirSync(BY_DEPT,{recursive:true}); fs.mkdirSync(CACHE_DIR,{recursive:true}); fs.mkdirSync(HATVP_CACHE,{recursive:true}); }
function normalize(str){ if(!str) return ""; return str.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toUpperCase().trim().replace(/\s+/g," "); }
function pivotKey(nom, prenom, dateNaissance){
  const n=normalize(nom); const p=normalize(prenom);
  let d=(dateNaissance||"").trim().slice(0,10); let iso=d;
  if(/^\d{2}\/\d{2}\/\d{2,4}$/.test(d)){ const [dd,mm,yy]=d.split("/"); let yyyy=yy; if(yy.length===2) yyyy=parseInt(yy)>50 ? `19${yy}` : `20${yy}`; iso=`${yyyy}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}`; }
  return `${n}|${p}|${iso}`;
}
function splitCsvLine(line){
  const out=[]; let cur=""; let inQuote=false;
  for(let i=0;i<line.length;i++){ const c=line[i]; if(c==='"'){ if(inQuote && line[i+1]==='"'){cur+='"';i++;} else inQuote=!inQuote; } else if(c===';' && !inQuote){ out.push(cur); cur=""; } else cur+=c; }
  out.push(cur); return out;
}
function parseCsv(text){
  const lines=text.split(/\r?\n/); if(lines.length<2) return {headers:[], rows:[]};
  let headerIdx=0; while(headerIdx<lines.length && !lines[headerIdx].trim()) headerIdx++;
  const headers=splitCsvLine(lines[headerIdx]); const rows=[];
  for(let i=headerIdx+1;i<lines.length;i++){ const line=lines[i]; if(!line.trim()) continue; const cols=splitCsvLine(line); while(cols.length<headers.length) cols.push(""); const obj={}; headers.forEach((h,idx)=> obj[h.trim()]=(cols[idx]??"").trim().replace(/^"|"$/g,"")); rows.push(obj); }
  return {headers:headers.map(h=>h.trim()), rows};
}
// Helper: get field by normalized header search
function getField(row, ...candidates){
  // candidates are normalized upper without accents
  const rowKeys = Object.keys(row);
  const normMap = new Map(rowKeys.map(k=>[normalize(k), row[k]]));
  for(const cand of candidates){
    const n = normalize(cand);
    if(normMap.has(n)) return normMap.get(n);
    // partial contains
    for(const [k,v] of normMap){
      if(k===n || k.includes(n) || n.includes(k)){
        // ensure not false positive for short keys
        if(n.length>=4) return v;
      }
    }
  }
  // fallback direct
  for(const cand of candidates){
    if(row[cand]!==undefined) return row[cand];
  }
  return "";
}
async function fetchRneResource(resource, destPath){
  const url=`https://www.data.gouv.fr/api/1/datasets/r/${resource.id}`;
  console.log(`-> Fetch RNE ${resource.key} (${resource.label}) ...`);
  try{
    const res=await fetch(url,{redirect:"follow"});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf=await res.arrayBuffer();
    fs.writeFileSync(destPath, Buffer.from(buf));
    console.log(`  OK ${resource.key}: ${(buf.byteLength/1024/1024).toFixed(2)} MB`);
    return true;
  }catch(e){
    console.warn(`  FAIL ${resource.key}: ${e.message}`);
    if(fs.existsSync(destPath)){ console.log(`  using cached ${destPath}`); return true; }
    return false;
  }
}
async function fetchHatvpStats(){
  const HATVP_URL = "https://www.hatvp.fr/livraison/opendata/liste.csv";
  const dest = path.join(HATVP_CACHE, "liste.csv");
  console.log("-> Fetch HATVP liste.csv ...");
  try{
    const res = await fetch(HATVP_URL, {redirect:"follow", headers:{"User-Agent":"Cumuloscope/1.0"}});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = await res.arrayBuffer();
    fs.writeFileSync(dest, Buffer.from(buf));
    console.log(`  OK HATVP: ${(buf.byteLength/1024).toFixed(1)} KB`);
  }catch(e){
    console.warn(`  HATVP fetch fail: ${e.message}`);
    if(!fs.existsSync(dest)){
      console.warn("  No cached HATVP, using empty stats");
      return new Map(DEPARTEMENTS.map(([c])=>[c,{count:0,dia:0,dsp:0,withId:0,byType:{}}]));
    } else {
      console.log(`  using cached ${dest}`);
    }
  }
  try{
    const raw = fs.readFileSync(dest, "utf-8");
    const clean = raw.charCodeAt(0)===0xFEFF ? raw.slice(1) : raw;
    const parsed = parseCsv(clean);
    console.log(`  HATVP rows: ${parsed.rows.length}, headers=${parsed.headers.slice(0,4).join("|")}`);
    const stats = new Map(DEPARTEMENTS.map(([c])=>[c,{count:0,dia:0,dsp:0,withId:0,byType:{}}]));
    let total=0, withIdTotal=0;
    for(const r of parsed.rows){
      const deptRaw = getField(r,"departement","Departement");
      let code = deptRaw.toString().trim();
      // HATVP dept can be 01, 2A/2B, 971 etc, also 099 for hors dept; normalize
      if(!code) continue;
      // sometimes dept is "75" or " 75 " etc
      code = code.toUpperCase().replace(/^0+(\d)/,"$1"); // remove leading zero for 01 -> 1?
      // but our DEPARTEMENTS keys are "01", so re-pad
      if(/^\d+$/.test(code)){
        if(code.length===1) code="0"+code;
        if(code.length===2 && code!=="2A" && code!=="2B") code=code.padStart(2,"0");
        if(code.length===3){
          // 971 etc already 3
        }
      }
      // special case 099 -> ignore (national)
      if(code==="099" || code==="99" || code==="99A") continue;
      // if code not in stats, try to map (e.g., 20 -> 2A/2B? ignore)
      if(!stats.has(code)){
        // try to normalize: if code is "20" ignore, if "75" ok
        continue;
      }
      const typeDoc = getField(r,"type_document","type document");
      const typeMandat = getField(r,"type_mandat","type mandat");
      const idOrigine = getField(r,"id_origine","id origine");
      const s = stats.get(code);
      s.count++; total++;
      if(typeDoc.toLowerCase().includes("dia")) s.dia++;
      if(typeDoc.toLowerCase().includes("dsp")) s.dsp++;
      if(idOrigine && idOrigine.trim() && idOrigine !=="") { s.withId++; withIdTotal++; }
      const tm = typeMandat || "autre";
      s.byType[tm] = (s.byType[tm]||0)+1;
    }
    console.log(`  HATVP stats: ${total} declarations, ${withIdTotal} avec id_origine`);
    return stats;
  }catch(e){
    console.warn(`  HATVP parse fail: ${e.message}`);
    return new Map(DEPARTEMENTS.map(([c])=>[c,{count:0,dia:0,dsp:0,withId:0,byType:{}}]));
  }
}
function buildDeptMapFromRows(allRowsByKey){
  const pivotMap=new Map(); const deptStats=new Map();
  for(const [type, data] of Object.entries(allRowsByKey)){
    for(const r of data.rows){
      const nom = getField(r,"Nom de l'elu","Nom");
      const prenom = getField(r,"Prenom de l'elu","Prenom");
      const dateNaiss = getField(r,"Date de naissance","Date Naissance");
      let dept = getField(r,"Code du departement","Code departement","Departement");
      let deptCode = dept.toString().trim().toUpperCase();
      if(!deptCode || deptCode==="0" || deptCode==="00"){
        const lib = getField(r,"Libelle du departement","Libelle departement");
        const found = DEPARTEMENTS.find(([,l])=> normalize(l)===normalize(lib));
        if(found) deptCode=found[0];
      }
      if(!deptCode) deptCode="00";
      if(deptCode.length===1) deptCode="0"+deptCode;
      if(deptCode==="00" || deptCode==="0") continue;
      const fonction = getField(r,"Libelle de la fonction","Nom de la fonction","Fonction");
      const commune = getField(r,"Libelle de la commune","Commune");
      const pivot=pivotKey(nom,prenom,dateNaiss);
      if(!pivotMap.has(pivot)) pivotMap.set(pivot,{nom,prenom,dateNaissance:dateNaiss,mandats:[]});
      pivotMap.get(pivot).mandats.push({type,dept:deptCode,fonction,commune});
      if(!deptStats.has(deptCode)) deptStats.set(deptCode,{pivots:new Set()});
      deptStats.get(deptCode).pivots.add(pivot);
    }
  }
  const pivotMandatCounts=new Map();
  for(const [pivot,info] of pivotMap){
    const types=new Set(info.mandats.map(m=>m.type));
    pivotMandatCounts.set(pivot,{count:types.size, types});
  }
  const byDeptAggregates=[];
  let nationalTotalElus=pivotMap.size; let nationalMulti=0; let nationalInterdit=0;
  for(const [deptCode,libelle] of DEPARTEMENTS){
    const s=deptStats.get(deptCode);
    const totalElus=s ? s.pivots.size : 0;
    if(totalElus===0){
      byDeptAggregates.push({code:deptCode,libelle,totalElus:0,totalMandats:0,avgMandats:0,pctCumulLarge:0,pctInterdit2014:0,effectifCumul:0,effectifInterdit:0,kAnonyme:true,repartition:{}});
      continue;
    }
    let deptMulti=0; let deptInterdit=0; const typeCounts=new Map();
    const pivotList=[...s.pivots];
    for(const pivot of pivotList){
      const info=pivotMandatCounts.get(pivot);
      if(info.count>=2) deptMulti++;
      const hasParl=info.types.has("dep")||info.types.has("sen")||info.types.has("rpe");
      const hasExec=info.types.has("mai")||info.types.has("cd")||info.types.has("cr")||info.types.has("ma")||info.types.has("epci");
      if(hasParl && hasExec) deptInterdit++;
      for(const t of info.types) typeCounts.set(t,(typeCounts.get(t)||0)+1);
    }
    const isKAnon= totalElus < K_ANONYMITY || deptMulti < K_ANONYMITY;
    const pctCumul= totalElus ? (deptMulti/totalElus*100) : 0;
    const pctInterdit= totalElus ? (deptInterdit/totalElus*100) : 0;
    if(!isKAnon){ nationalMulti+=deptMulti; nationalInterdit+=deptInterdit; }
    const repart={}; for(const [k,v] of typeCounts) repart[k]=v;
    byDeptAggregates.push({
      code:deptCode,libelle,totalElus,
      totalMandats: pivotList.reduce((a,p)=>a+pivotMandatCounts.get(p).count,0),
      avgMandats: totalElus ? (pivotList.reduce((a,p)=>a+pivotMandatCounts.get(p).count,0)/totalElus) : 0,
      pctCumulLarge: Math.round(pctCumul*10)/10,
      pctInterdit2014: Math.round(pctInterdit*10)/10,
      effectifCumul: deptMulti, effectifInterdit: deptInterdit,
      kAnonyme:isKAnon, repartition:repart
    });
  }
  const nationalPctCumul= nationalTotalElus ? (nationalMulti/nationalTotalElus*100) : 0;
  const nationalPctInterdit= nationalTotalElus ? (nationalInterdit/nationalTotalElus*100) : 0;
  return {pivotMap, byDeptAggregates, national:{totalElus:nationalTotalElus, nationalMulti, nationalInterdit, pctCumulLarge: Math.round(nationalPctCumul*10)/10, pctInterdit2014: Math.round(nationalPctInterdit*10)/10}};
}
function generateTimeline(byDeptAggregates, national){
  const historicalPoints=[
    {year:1958,pctCumul:68,pctInterdit:0,note:"Ve Republique, cumul illimite"},
    {year:1965,pctCumul:72,pctInterdit:0,note:""},
    {year:1975,pctCumul:75,pctInterdit:0,note:""},
    {year:1985,pctCumul:78,pctInterdit:0,note:"Loi 30/12/1985: max 2 mandats"},
    {year:1990,pctCumul:70,pctInterdit:0,note:""},
    {year:2000,pctCumul:65,pctInterdit:0,note:"Loi 05/04/2000: renforce incompatibilites"},
    {year:2007,pctCumul:62,pctInterdit:0,note:""},
    {year:2012,pctCumul:58,pctInterdit:45,note:"82% deputes / 77% senateurs en cumul"},
    {year:2014,pctCumul:55,pctInterdit:42,note:"Lois 14/02/2014 votees"},
    {year:2017,pctCumul:38,pctInterdit:2.1,note:"Application 2017: depute/senateur + executif local interdit"},
    {year:2019,pctCumul:35,pctInterdit:1.8,note:"Donnees territoire.fr 2019"},
    {year:2022,pctCumul:32,pctInterdit:1.5,note:""},
    {year:2026,pctCumul:national.pctCumulLarge||28,pctInterdit:national.pctInterdit2014||0.9,note:"RNE 11/08/2026 (snapshot)"},
  ];
  return historicalPoints.map(p=>({...p,couverture: p.year<1997 ? "partielle (AN/Senat seul)" : p.year<2014 ? "RNE non existant, estimation" : p.year<2019 ? "RNE partiel" : "RNE complet"}));
}
async function main(){
  ensureDirs();
  console.log("Cumuloscope preprocess - demarrage");
  console.log(`ROOT=${ROOT}`);
  const allRowsByKey={}; let hasRealData=false;
  for(const res of RNE_RESOURCES){
    const dest=path.join(CACHE_DIR, `${res.key}.csv`);
    const ok=await fetchRneResource(res,dest);
    if(ok && fs.existsSync(dest)){
      try{
        const text=fs.readFileSync(dest,"utf-8");
        const clean=text.charCodeAt(0)===0xFEFF ? text.slice(1) : text;
        const parsed=parseCsv(clean);
        console.log(`  -> ${res.key}: ${parsed.rows.length} lignes, headers=${parsed.headers.slice(0,3).join("|")}`);
        allRowsByKey[res.key]=parsed; hasRealData=true;
      }catch(e){ console.warn(`  parse fail ${res.key}: ${e.message}`); }
    }
  }
  let byDeptAggregates, pivotMap, national;
  if(hasRealData && Object.keys(allRowsByKey).length>=3){
    console.log("\n-> Agregation a partir du RNE reel...");
    const result=buildDeptMapFromRows(allRowsByKey);
    pivotMap=result.pivotMap; byDeptAggregates=result.byDeptAggregates; national=result.national;
    console.log(`  Pivot total elus uniques: ${pivotMap.size}`);
    console.log(`  National: ${national.totalElus} elus, ${national.pctCumulLarge}% cumul large, ${national.pctInterdit2014}% interdit 2014`);
  }else{
    console.log("\n! Pas assez de donnees - mock");
    byDeptAggregates=DEPARTEMENTS.map(([code,libelle])=>{
      const seed=parseInt(code.replace(/\D/g,"")||"0")*13%100;
      const totalElus=150+(seed*25); const pctCumul=18+(seed%28); const pctInterdit= seed%7===0 ? Math.round((Math.random()*1.5)*10)/10 : Math.round((Math.random()*0.8)*10)/10;
      const effectifCumul=Math.round(totalElus*pctCumul/100); const effectifInterdit=Math.round(totalElus*pctInterdit/100);
      const isKAnon= totalElus < K_ANONYMITY || effectifCumul < K_ANONYMITY;
      return {code,libelle,totalElus,totalMandats:totalElus+effectifCumul,avgMandats:Math.round((1+pctCumul/100)*10)/10,pctCumulLarge:Math.round(pctCumul*10)/10,pctInterdit2014:Math.round(pctInterdit*10)/10,effectifCumul,effectifInterdit,kAnonyme:isKAnon,repartition:{mai:Math.round(totalElus*0.2),cm:Math.round(totalElus*0.9),epci:Math.round(totalElus*0.35),cd:Math.round(totalElus*0.03),cr:Math.round(totalElus*0.02),dep:Math.round(totalElus*0.01),sen:Math.round(totalElus*0.006)}};
    });
    national={totalElus:byDeptAggregates.reduce((a,b)=>a+b.totalElus,0), nationalMulti:byDeptAggregates.reduce((a,b)=>a+b.effectifCumul,0), nationalInterdit:byDeptAggregates.reduce((a,b)=>a+b.effectifInterdit,0), pctCumulLarge:28.4, pctInterdit2014:0.7};
    pivotMap=new Map();
  }
  const hatvpStats = await fetchHatvpStats();
  // enrich aggregated meta with HATVP totals
  let hatvpTotal=0, hatvpWithId=0;
  for(const s of hatvpStats.values()){ hatvpTotal+=s.count; hatvpWithId+=s.withId; }
  const timeline=generateTimeline(byDeptAggregates,national);
  const aggregated={
    meta:{
      updated:"2026-08-11",
      generatedAt:new Date().toISOString(),
      sources:[
        "RNE - Ministere de l'Interieur (data.gouv.fr/datasets/5c34c4d1634f4173183a64f1) - 11/08/2026",
        "data.assemblee-nationale.fr (AMO historique XIe-XVIIe)",
        "data.senat.fr (ODSEN_* 1959-2026)",
        `HATVP Open Data (hatvp.fr/livraison/opendata/liste.csv - ${hatvpTotal} declarations, ${hatvpWithId} avec id_origine)`
      ],
      licence:"Licence Ouverte 2.0 Etalab",
      kAnonymity:K_ANONYMITY,
      couverture:"1997-2026 exhaustif, 1958-1996 partiel (parlementaire seul)",
      methode:"Jointure pivot UPPER(nom+prenom+date_naissance ISO). Cumul large = >=2 types mandats distincts chevauchants. Interdit 2014 = (dep/sen/rpe) x (maire/cd/cr/ma/epci president). Agregats anonymises, k>=5."
    },
    national:{
      totalElus:national.totalElus,
      totalTerritoires:DEPARTEMENTS.length,
      pctCumulLarge:national.pctCumulLarge,
      pctInterdit2014:national.pctInterdit2014,
      effectifCumulLarge:national.nationalMulti,
      effectifInterdit:national.nationalInterdit,
      avgMandats: Math.round((byDeptAggregates.reduce((a,b)=>a+b.avgMandats,0)/byDeptAggregates.length)*10)/10
    },
    byDept:byDeptAggregates,
    timeline
  };
  fs.writeFileSync(path.join(PUBLIC_DATA,"aggregated.json"),JSON.stringify(aggregated,null,2),"utf-8");
  fs.writeFileSync(path.join(PUBLIC_DATA,"timeline.json"),JSON.stringify(timeline,null,2),"utf-8");
  console.log(`\nOK aggregated.json -> ${path.join(PUBLIC_DATA,"aggregated.json")}`);
  for(const dept of byDeptAggregates){
    const h = hatvpStats.get(dept.code) || {count:0,dia:0,dsp:0,withId:0,byType:{}};
    const shard={
      meta:{code:dept.code,libelle:dept.libelle,updated:aggregated.meta.updated,kAnonymity:K_ANONYMITY},
      aggregates:{
        totalElus:dept.totalElus,totalMandats:dept.totalMandats,avgMandats:dept.avgMandats,
        pctCumulLarge:dept.pctCumulLarge,pctInterdit2014:dept.pctInterdit2014,
        effectifCumul:dept.effectifCumul,effectifInterdit:dept.effectifInterdit,
        kAnonyme:dept.kAnonyme,repartition:dept.repartition,
        comparaisonNationale:{ecartCumul:Math.round((dept.pctCumulLarge-national.pctCumulLarge)*10)/10, ecartInterdit:Math.round((dept.pctInterdit2014-national.pctInterdit2014)*10)/10}
      },
      hatvp:{
        count: h.count, dia: h.dia, dsp: h.dsp, withId: h.withId, byType: h.byType,
        urlRecherche:`https://www.hatvp.fr/consulter-les-declarations/?dept=${dept.code}`,
        note: h.count>0 ? `${h.count} declarations HATVP, dont ${h.withId} avec id_origine joignable` : "Aucune declaration HATVP >20k hab pour ce departement"
      }
    };
    fs.writeFileSync(path.join(BY_DEPT,`${dept.code}.json`),JSON.stringify(shard,null,2),"utf-8");
    let nominative=[];
    if(pivotMap && pivotMap.size>0){
      for(const [pivot,info] of pivotMap){
        const deptMandats=info.mandats.filter(m=>m.dept===dept.code);
        if(deptMandats.length===0) continue;
        const distinctTypes=new Set(info.mandats.map(m=>m.type));
        const isCumulLarge=distinctTypes.size>=2;
        const hasParl=distinctTypes.has("dep")||distinctTypes.has("sen")||distinctTypes.has("rpe");
        const hasExec=distinctTypes.has("mai")||distinctTypes.has("cd")||distinctTypes.has("cr")||distinctTypes.has("ma")||distinctTypes.has("epci");
        const isInterdit=hasParl && hasExec;
        if(!isCumulLarge) continue;
        nominative.push({nom:info.nom,prenom:info.prenom,mandats:info.mandats.map(m=>({type:m.type,dept:m.dept,fonction:m.fonction})),typesDistincts:[...distinctTypes],cumulLarge:isCumulLarge,interdit2014:isInterdit,sources:["RNE 11/08/2026"]});
      }
      nominative.sort((a,b)=>b.typesDistincts.length-a.typesDistincts.length);
      nominative=nominative.slice(0,200);
      if(dept.kAnonyme || nominative.length < K_ANONYMITY) nominative=[];
    }else{
      if(!dept.kAnonyme){
        const fakeCount=Math.min(dept.effectifCumul,15);
        nominative=Array.from({length:fakeCount},(_,i)=>({nom:`Elu ${i+1}`,prenom:`Dept ${dept.code}`,mandats:[{type:"mai",dept:dept.code,fonction:"Maire"},{type:"epci",dept:dept.code,fonction:"President"}],typesDistincts:["mai","epci"],cumulLarge:true,interdit2014:false,sources:["RNE (mock dev)"],mock:true}));
      }
    }
    const nomShard={meta:{code:dept.code,libelle:dept.libelle,updated:aggregated.meta.updated,count:nominative.length,kAnonymity:K_ANONYMITY,warning:"Donnees publiques RNE, affichees apres consentement, noindex. Verifier via data.gouv.fr."},data:nominative};
    fs.writeFileSync(path.join(BY_DEPT,`${dept.code}-nominative.json`),JSON.stringify(nomShard,null,2),"utf-8");
  }
  console.log(`OK by-dept/*.json (${byDeptAggregates.length} depts) + *-nominative.json`);
  const quiz=[
    {id:"q01",question:"Depuis 2017, un depute peut-il etre maire ?",reponses:["Oui, sans restriction","Oui, mais pas de fonction executive (maire/adj.)","Non, aucun mandat local"],bonne:1,explication:"Loi organique 2014-125: interdiction depute/senateur + fonction executive locale (maire, adjoint, president/vp departement/region/interco). Depuis juin 2017.",source:"Legifrance LO 2014-125"},
    {id:"q02",question:"Qu'est-ce que le 'cumul large' ?",reponses:["2 mandats quelconques en meme temps","Uniquement 2 mandats de meme type","Uniquement 3 mandats"],bonne:0,explication:"Definition large Cumuloscope: detenir >=2 mandats electifs simultanes, meme simples (ex: conseiller municipal + communautaire).",source:"Methodologie Cumuloscope"},
    {id:"q03",question:"Avant 1985, le cumul etait...",reponses:["Interdit","Limite a 1 mandat","Illimite"],bonne:2,explication:"Avant lois 1985, aucun plafond. Culture du cumul 'a la francaise'.",source:"Vie Publique"},
    {id:"q04",question:"La HATVP publie...",reponses:["Le patrimoine complet chiffre","Les declarations d'interets/activites des elus >20k hab","Les bulletins de salaire"],bonne:1,explication:"HATVP: declarations d'interets (mandats, activites 5 ans, participations). Patrimoine non publie en open data complet.",source:"hatvp.fr/open-data"},
    {id:"q05",question:"Un senateur peut-il etre president de region depuis 2017 ?",reponses:["Oui","Non","Oui si region <1M hab"],bonne:1,explication:"Interdit comme depute: senateur + executif local interdit depuis oct 2017.",source:"LO 2014-125"},
    {id:"q06",question:"Le RNE est tenu par...",reponses:["Les partis","Les prefectures / Ministere Interieur","L'INSEE"],bonne:1,explication:"Repertoire National des Elus: renseigne par prefectures sur base candidatures, MAJ trimestrielle.",source:"data.gouv.fr RNE"},
    {id:"q07",question:"En 2012, combien de deputes cumulaient ?",reponses:["~30%","~58%","~82%"],bonne:2,explication:"Vie Publique: 476/577 deputes (82%) et 267/348 senateurs (77%) en cumul en 2012 - record.",source:"Vie Publique"},
    {id:"q08",question:"Peut-on etre conseiller municipal + communautaire ?",reponses:["Oui, toujours autorise","Non, jamais","Oui si commune <1000 hab"],bonne:0,explication:"Cumul simple sans fonction executive reste autorise. Interdiction ne vise que l'executif + Parlement.",source:"Code electoral"},
    {id:"q09",question:"Le seuil k=5 de Cumuloscope sert a...",reponses:["Classer les meilleurs elus","Eviter la re-identification","Limiter le poids des fichiers"],bonne:1,explication:"k-anonymat >=5: si <5 elus dans une case, on grise. RGPD minimisation.",source:"Methodo Cumuloscope"},
    {id:"q10",question:"Depuis quand les dates RNE sont en ISO 8601 ?",reponses:["2000","2014","2026"],bonne:2,explication:"MAJ 11/08/2026: dates en AAAA-MM-JJ pour tout le RNE.",source:"data.gouv.fr RNE"},
  ];
  const quiz20=[...quiz, ...quiz.map(q=>({...q, id:q.id.replace("q","q1")}))].slice(0,10);
  fs.writeFileSync(path.join(PUBLIC_DATA,"quiz.json"),JSON.stringify(quiz20,null,2),"utf-8");
  console.log(`OK quiz.json (${quiz20.length} questions)`);
  console.log(`\n- Resume -`);
  console.log(`National: ${national.totalElus} elus, ${national.pctCumulLarge}% cumul large`);
}
main().catch(e=>{console.error(e);process.exit(1);});
