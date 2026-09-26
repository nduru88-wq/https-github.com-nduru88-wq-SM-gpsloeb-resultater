const SUPABASE_URL='https://pykhsvemerydppxhurqb.supabase.co';
const SUPABASE_KEY='sb_publishable_TW3S9O55R0XAOsQktyBZkw_93rUW2YQ';
const $=id=>document.getElementById(id);
let session=null,races=[],participations=[],answersByParticipation={};

async function req(path,options={},auth=true){
  const headers={apikey:SUPABASE_KEY,'Content-Type':'application/json',...(options.headers||{})};
  if(auth&&session?.access_token)headers.Authorization=`Bearer ${session.access_token}`;
  const r=await fetch(`${SUPABASE_URL}${path}`,{...options,headers});
  if(!r.ok)throw new Error(await r.text()||`HTTP ${r.status}`);
  return r;
}
function esc(s=''){return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function fmt(d){try{return new Date(d).toLocaleString('da-DK')}catch{return d||''}}
function setUI(){
  const yes=!!session?.access_token;
  $('loginCard').hidden=yes;$('appCard').hidden=!yes;
  $('loginBadge').textContent=yes?'Lærer logget ind':'Ikke logget ind';
  $('loginBadge').className='badge '+(yes?'good':'');
  if(yes)$('who').textContent=session.user?.email||'Lærer';
}
$('loginBtn').onclick=async()=>{
  const email=$('email').value.trim(),password=$('password').value;
  if(!email||!password){$('loginMsg').textContent='Skriv e-mail og adgangskode.';return}
  const b=$('loginBtn');b.disabled=true;b.textContent='Logger ind…';
  try{
    const r=await req('/auth/v1/token?grant_type=password',{method:'POST',body:JSON.stringify({email,password})},false);
    session=await r.json();sessionStorage.setItem('gpsResultsSession',JSON.stringify(session));setUI();await loadRaces();
  }catch(e){console.error(e);$('loginMsg').textContent='Login mislykkedes. Tjek e-mail og adgangskode.'}
  finally{b.disabled=false;b.textContent='🔐 Log ind'}
};
$('logoutBtn').onclick=()=>{session=null;sessionStorage.removeItem('gpsResultsSession');$('participants').innerHTML='';$('summaryCard').hidden=true;setUI()};
async function loadRaces(){
  try{
    const r=await req('/rest/v1/gps_loeb?select=code,name,created_at&order=created_at.desc');
    races=await r.json();
    $('raceSelect').innerHTML='<option value="">Vælg løb…</option>'+races.map(x=>`<option value="${esc(x.code)}">${esc(x.name)} · ${esc(x.code)}</option>`).join('');
  }catch(e){console.error(e);alert('Kunne ikke hente løbene. Hvis dette er første test, skal lærerens SELECT-regel for gps_loeb muligvis tilføjes.')}
}
$('raceSelect').onchange=()=>loadResults();
$('refreshBtn').onclick=()=>loadResults();

async function loadResults(){
  const code=$('raceSelect').value;if(!code){$('participants').innerHTML='';$('summaryCard').hidden=true;return}
  $('participants').innerHTML='<section class="card"><p>Henter resultater…</p></section>';
  try{
    let r=await req(`/rest/v1/gps_besvarelser?loeb_code=eq.${encodeURIComponent(code)}&select=id,elev_navn,started_at,updated_at,finished_at&order=started_at.desc`);
    participations=await r.json();
    answersByParticipation={};
    if(participations.length){
      const ids=participations.map(x=>x.id).join(',');
      r=await req(`/rest/v1/gps_svar?besvarelse_id=in.(${encodeURIComponent(ids)})&select=id,besvarelse_id,post_id,post_number,post_name,svar,korrekt,note,image_path,answered_at&order=post_number.asc`);
      const rows=await r.json();
      rows.forEach(a=>(answersByParticipation[a.besvarelse_id]??=[]).push(a));
    }
    const race=races.find(x=>x.code===code);
    $('raceHeading').textContent=race?`${race.name} · ${code}`:code;
    $('participantCount').textContent=`${participations.length} elev/hold`;
    $('summaryCard').hidden=false;
    renderParticipants();
  }catch(e){console.error(e);$('participants').innerHTML='<section class="card error">Kunne ikke hente resultaterne.</section>'}
}
function renderParticipants(){
  if(!participations.length){$('participants').innerHTML='<section class="card"><p class="muted">Der er endnu ingen besvarelser til dette løb.</p></section>';return}
  $('participants').innerHTML=participations.map(p=>{
    const a=answersByParticipation[p.id]||[],graded=a.filter(x=>typeof x.korrekt==='boolean'),correct=graded.filter(x=>x.korrekt).length;
    return `<article class="card participant"><div><h3>${esc(p.elev_navn)}</h3><p class="muted">${a.length} svar · startet ${esc(fmt(p.started_at))}${graded.length?` · ${correct}/${graded.length} korrekte`:''}</p></div><button data-open="${p.id}">Se svar</button></article>`;
  }).join('');
  document.querySelectorAll('[data-open]').forEach(b=>b.onclick=()=>openParticipant(b.dataset.open));
}
async function signedImage(path){
  if(!path)return null;
  const r=await req('/storage/v1/object/sign/gps-svar-billeder/'+path.split('/').map(encodeURIComponent).join('/'),{method:'POST',body:JSON.stringify({expiresIn:3600})});
  const x=await r.json();const u=x.signedURL||x.signedUrl;
  if(!u)return null;
  return u.startsWith('http')?u:`${SUPABASE_URL}/storage/v1${u}`;
}
async function openParticipant(id){
  const p=participations.find(x=>x.id===id);if(!p)return;
  $('detailTitle').textContent=p.elev_navn;$('detailMeta').textContent=`Startet ${fmt(p.started_at)}`;
  const rows=answersByParticipation[id]||[];
  $('detailBody').innerHTML=rows.length?rows.map(a=>`<article class="answer"><div class="answerHead"><strong>Post ${a.post_number??''}: ${esc(a.post_name||'')}</strong>${typeof a.korrekt==='boolean'?`<span class="${a.korrekt?'ok':'wrong'}">${a.korrekt?'✓ Korrekt':'✕ Forkert'}</span>`:''}</div>${a.svar!==null&&a.svar!==''?`<p><b>Svar:</b> ${esc(a.svar)}</p>`:''}${a.note?`<p><b>Kommentar:</b> ${esc(a.note)}</p>`:''}<div class="imgSlot" data-img="${esc(a.image_path||'')}"></div><p class="muted small">${esc(fmt(a.answered_at))}</p></article>`).join(''):'<p class="muted">Ingen svar endnu.</p>';
  $('detailDialog').showModal();
  for(const slot of document.querySelectorAll('.imgSlot[data-img]')){
    const path=slot.dataset.img;if(!path)continue;
    slot.textContent='Henter billede…';
    try{const url=await signedImage(path);slot.innerHTML=url?`<img class="answerImage" src="${url}" alt="Elevens billede">`:'<span class="muted">Billedet kunne ikke vises.</span>'}catch(e){console.error(e);slot.innerHTML='<span class="muted">Billedet kunne ikke vises.</span>'}
  }
}
$('closeDialog').onclick=()=>$('detailDialog').close();
try{const s=JSON.parse(sessionStorage.getItem('gpsResultsSession')||'null');if(s?.access_token){session=s;setUI();loadRaces()}else setUI()}catch{setUI()}
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');
