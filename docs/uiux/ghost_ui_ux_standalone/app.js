
const G = {
  installedApps: JSON.parse(localStorage.getItem('ghost_installed_apps') || '["qr-menu","reviews","loyalty","song-request"]'),
  connections: JSON.parse(localStorage.getItem('ghost_connections') || '["google-business","gmail","calendar"]'),
  android: JSON.parse(localStorage.getItem('ghost_android') || '["facebook-android"]'),
  automations: JSON.parse(localStorage.getItem('ghost_automations') || '["review-followup","sync-hours"]'),
  save(){
    localStorage.setItem('ghost_installed_apps', JSON.stringify(this.installedApps));
    localStorage.setItem('ghost_connections', JSON.stringify(this.connections));
    localStorage.setItem('ghost_android', JSON.stringify(this.android));
    localStorage.setItem('ghost_automations', JSON.stringify(this.automations));
  }
};

function toast(msg){
  let el=document.querySelector('.toast');
  if(!el){el=document.createElement('div');el.className='toast';document.body.appendChild(el);}
  el.textContent=msg;el.classList.add('show');setTimeout(()=>el.classList.remove('show'),1800)
}
function qs(s,p=document){return p.querySelector(s)}
function qsa(s,p=document){return [...p.querySelectorAll(s)]}
function openSidebar(){qs('.sidebar')?.classList.add('open')}
function closeSidebar(){qs('.sidebar')?.classList.remove('open')}

document.addEventListener('click',e=>{
  if(e.target.closest('[data-menu]')) openSidebar();
  if(e.target.closest('[data-close-menu]')) closeSidebar();
  if(e.target.classList.contains('modal-backdrop')) e.target.remove();
  const sw=e.target.closest('.switch'); if(sw){sw.classList.toggle('on');toast(sw.classList.contains('on')?'Enabled':'Disabled')}
  const tab=e.target.closest('[data-tab]'); if(tab){
    const group=tab.dataset.group; qsa(`[data-group="${group}"]`).forEach(x=>x.classList.remove('active')); tab.classList.add('active');
    qsa(`[data-panel-group="${group}"]`).forEach(p=>p.classList.add('hidden'));
    qs(`[data-panel="${tab.dataset.tab}"]`)?.classList.remove('hidden');
  }
  const act=e.target.closest('[data-action]'); if(act) handleAction(act);
});

function modal(title,html){
  const wrap=document.createElement('div');wrap.className='modal-backdrop';
  wrap.innerHTML=`<div class="modal"><div class="between"><h2>${title}</h2><button class="btn sm" onclick="this.closest('.modal-backdrop').remove()">Close</button></div>${html}</div>`;
  document.body.appendChild(wrap);return wrap;
}
function handleAction(el){
  const a=el.dataset.action, id=el.dataset.id;
  if(a==='install-app'){
    if(!G.installedApps.includes(id)) G.installedApps.push(id);
    G.save(); el.textContent='Installed';el.disabled=true;toast('App installed');
  }
  if(a==='remove-app'){
    G.installedApps=G.installedApps.filter(x=>x!==id);G.save();toast('App removed');setTimeout(()=>location.reload(),350)
  }
  if(a==='connect'){
    modal('Connect account',`
      <div class="stack">
        <p class="muted">Authorize <strong>${el.dataset.name}</strong>. This demo simulates OAuth / provider authorization.</p>
        <div class="field"><label>Account email</label><input class="input" value="owner@business.com"></div>
        <div class="field"><label>Connection method</label><select><option>Composio / OAuth</option><option>Native API</option><option>MCP</option></select></div>
        <button class="btn primary block" onclick="G.connections=[...new Set([...G.connections,'${id}'])];G.save();toast('Connection authorized');this.closest('.modal-backdrop').remove();setTimeout(()=>location.reload(),400)">Authorize connection</button>
      </div>`)
  }
  if(a==='install-android'){
    if(!G.android.includes(id))G.android.push(id);G.save();toast('Android integration installed');setTimeout(()=>location.reload(),400)
  }
  if(a==='install-auto'){
    if(!G.automations.includes(id))G.automations.push(id);G.save();toast('Automation installed');setTimeout(()=>location.reload(),400)
  }
  if(a==='approve'){el.closest('.approval')?.remove();toast('Approved')}
  if(a==='reject'){el.closest('.approval')?.remove();toast('Rejected')}
  if(a==='publish'){toast('Published successfully')}
  if(a==='save'){toast('Changes saved')}
}

function filterCards(inputSel, cardSel){
  const q=(qs(inputSel)?.value||'').toLowerCase();
  qsa(cardSel).forEach(c=>{c.style.display=c.innerText.toLowerCase().includes(q)?'':'none'})
}
window.G=G;window.toast=toast;window.filterCards=filterCards;
