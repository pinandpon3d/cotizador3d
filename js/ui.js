/* ═══════════════════════════════════════════════════════
   ui.js  —  Funciones de renderizado DOM
   ═══════════════════════════════════════════════════════ */

const fmt  = n => new Intl.NumberFormat('es-CR',{style:'currency',currency:'CRC',minimumFractionDigits:0}).format(n||0);
const fmtN = n => new Intl.NumberFormat('es-CR',{minimumFractionDigits:0}).format(n||0);
const $    = id => document.getElementById(id);

function toast(msg, type = 'info') {
  const c = $('toastContainer'); if (!c) return;
  const t = document.createElement('div');
  t.className = `toast toast-${type} show`;
  t.textContent = msg;
  c.appendChild(t);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
}

function setLoading(btn, state) {
  if (!btn) return;
  if (state) { btn.dataset.orig = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
  else { btn.innerHTML = btn.dataset.orig || btn.innerHTML; btn.disabled = false; }
}

function actualizarBadges() {
  const bt = $('sb-count-trabajos'), bf = $('sb-count-filamentos');
  if (bt) bt.textContent = (window.todosLosTrabajos||[]).length || '';
  if (bf) bf.textContent = (window.todosLosFilamentos||[]).length || '';
}

/* ── Dashboard ───────────────────────────────────────── */
function renderDashboard() {
  const now = new Date();
  const mes = now.getMonth(), anio = now.getFullYear();
  const esMes = t => { const d = t.fecha ? new Date(t.fecha) : null; return d && d.getMonth()===mes && d.getFullYear()===anio; };
  const trabajos   = window.todosLosTrabajos  || [];
  const filamentos = window.todosLosFilamentos || [];
  const delMes     = trabajos.filter(esMes);
  const ingresos   = delMes.filter(t=>t.estado==='entregado').reduce((a,t)=>(a+(t.precioFinal||0)*(t.cantidad||1)),0);

  [ ['kpi-ingresos',   fmt(ingresos)],
    ['kpi-trabajos',   fmtN(delMes.length)],
    ['kpi-entregados', fmtN(delMes.filter(t=>t.estado==='entregado').length)],
    ['kpi-rollos',     fmtN(filamentos.filter(f=>(f.disponibles||0)>50).length)]
  ].forEach(([id,v]) => { const el=$(id); if(el) el.textContent=v; });

  const h = now.getHours();
  const name = localStorage.getItem(AUTH_NAME_KEY)||'';
  const greet = h<12?'Buenos días':h<18?'Buenas tardes':'Buenas noches';
  const g=$('dash-greeting'); if(g) g.textContent=`${greet}${name?', '+name:''} 👋`;
  const tl=$('todayLabel'); if(tl) tl.textContent=now.toLocaleDateString('es-CR',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

  renderActivityList(trabajos);
  renderLowStock(filamentos);
  renderChart(trabajos);
}

function renderActivityList(trabajos) {
  const list=$('activityList'); if(!list) return;
  const recientes=[...trabajos].sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||'')).slice(0,6);
  if(!recientes.length){list.innerHTML='<p style="padding:1rem;opacity:.5">Sin actividad reciente</p>';return;}
  const lbl={pendiente:'Pendiente',aprobado:'Aprobado',imprimiendo:'Imprimiendo',entregado:'Entregado',cancelado:'Cancelado'};
  list.innerHTML=recientes.map(t=>`
    <div class="activity-item">
      <div class="activity-icon"><svg class="i16"><use href="#i-cube"/></svg></div>
      <div class="activity-info">
        <span class="activity-title">${t.pieza||'Sin nombre'}</span>
        <span class="activity-meta">${t.cliente||'—'} · ${t.fecha||'—'}</span>
      </div>
      <span class="chip chip-${t.estado||'pendiente'}">${lbl[t.estado]||t.estado}</span>
    </div>`).join('');
}

function renderLowStock(filamentos) {
  const grid=$('lowStockGrid'); if(!grid) return;
  const bajos=filamentos.filter(f=>(f.disponibles||0)<=100).sort((a,b)=>(a.disponibles||0)-(b.disponibles||0));
  if(!bajos.length){grid.innerHTML='<p style="padding:1rem;opacity:.5">Sin alertas de stock bajo</p>';return;}
  grid.innerHTML=bajos.slice(0,6).map(f=>`
    <div class="stock-card">
      <div class="stock-info">
        <span class="stock-name">${f.tipo||'—'} ${f.color||''}</span>
        <span class="stock-brand">${f.marca||'—'}</span>
      </div>
      <div class="stock-bar-wrap"><div class="stock-bar" style="width:${Math.min(100,(f.disponibles||0)/10)}%"></div></div>
      <span class="stock-qty ${(f.disponibles||0)<=50?'text-danger':''}">${fmtN(f.disponibles||0)} g</span>
    </div>`).join('');
}

function renderChart(trabajos) {
  const canvas=$('chart'); if(!canvas||!canvas.getContext) return;
  const ctx=canvas.getContext('2d');
  const now=new Date();
  const labels=[],data=[];
  for(let i=5;i>=0;i--){
    const d=new Date(now.getFullYear(),now.getMonth()-i,1);
    const m=d.getMonth(),y=d.getFullYear();
    const total=trabajos.filter(t=>{const fd=t.fecha?new Date(t.fecha):null;return fd&&fd.getMonth()===m&&fd.getFullYear()===y&&t.estado==='entregado';})
      .reduce((a,t)=>(a+(t.precioFinal||0)*(t.cantidad||1)),0);
    labels.push(d.toLocaleDateString('es-CR',{month:'short'}));
    data.push(total);
  }
  const W=canvas.width=canvas.offsetWidth||500,H=canvas.height=160;
  const max=Math.max(...data,1);
  const pad={t:10,r:16,b:30,l:60};
  const gw=W-pad.l-pad.r,gh=H-pad.t-pad.b;
  ctx.clearRect(0,0,W,H);
  const dark=document.documentElement.getAttribute('data-theme')==='dark';
  const gc=dark?'rgba(255,255,255,.07)':'rgba(0,0,0,.07)';
  const tc=dark?'rgba(255,255,255,.4)':'rgba(0,0,0,.4)';
  const accent=getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()||'#6C63FF';
  ctx.strokeStyle=gc;ctx.lineWidth=1;
  for(let i=0;i<=4;i++){
    const y=pad.t+(gh/4)*i;
    ctx.beginPath();ctx.moveTo(pad.l,y);ctx.lineTo(pad.l+gw,y);ctx.stroke();
    ctx.fillStyle=tc;ctx.font='11px sans-serif';ctx.textAlign='right';
    ctx.fillText(fmt(max*(1-i/4)).replace('₡','').replace(/\s/g,''),pad.l-6,y+4);
  }
  const bw=gw/labels.length*0.5;
  labels.forEach((lbl,i)=>{
    const x=pad.l+(gw/labels.length)*(i+0.5)-bw/2;
    const bh=(data[i]/max)*gh,y=pad.t+gh-bh;
    ctx.fillStyle=accent;
    ctx.beginPath();const r=4;
    ctx.moveTo(x+r,y);ctx.lineTo(x+bw-r,y);ctx.quadraticCurveTo(x+bw,y,x+bw,y+r);
    ctx.lineTo(x+bw,y+bh);ctx.lineTo(x,y+bh);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);
    ctx.fill();
    ctx.fillStyle=tc;ctx.font='11px sans-serif';ctx.textAlign='center';
    ctx.fillText(lbl,x+bw/2,H-8);
  });
}

/* ── Trabajos ────────────────────────────────────────── */
function renderTrabajos() {
  const body=$('trabajosBody'); if(!body) return;
  const trabajos=window.todosLosTrabajos||[];
  const q=($('t_buscar')?.value||'').toLowerCase();
  const filtro=window.estadoFilter||'todos';
  const lista=trabajos.filter(t=>{
    if(filtro!=='todos'&&t.estado!==filtro)return false;
    if(q&&!`${t.pieza} ${t.cliente} ${t.categoria}`.toLowerCase().includes(q))return false;
    return true;
  });
  const lbl={pendiente:'Pendiente',aprobado:'Aprobado',imprimiendo:'Imprimiendo',entregado:'Entregado',cancelado:'Cancelado'};
  [['tkpi-total',fmtN(trabajos.length)],
   ['tkpi-aprobados',fmtN(trabajos.filter(t=>t.estado==='aprobado').length)],
   ['tkpi-entregados',fmtN(trabajos.filter(t=>t.estado==='entregado').length)],
   ['tkpi-facturado',fmt(trabajos.filter(t=>t.estado==='entregado').reduce((a,t)=>(a+(t.precioFinal||0)*(t.cantidad||1)),0))]
  ].forEach(([id,v])=>{const el=$(id);if(el)el.textContent=v;});
  if(!lista.length){body.innerHTML='<tr><td colspan="8" style="text-align:center;padding:2rem;opacity:.5">Sin resultados</td></tr>';return;}
  body.innerHTML=lista.map(t=>`
    <tr>
      <td><span class="mono text-xs">${(t.id||'').slice(0,8)}</span></td>
      <td><div class="fw-medium">${t.pieza||'—'}</div><div class="text-xs text-muted">${t.categoria||'—'}</div></td>
      <td>${t.cliente||'—'}</td>
      <td>${t.fecha||'—'}</td>
      <td class="text-right">${t.cantidad||1}</td>
      <td class="text-right fw-medium">${fmt(t.precioFinal||0)}</td>
      <td><span class="chip chip-${t.estado||'pendiente'}">${lbl[t.estado]||t.estado}</span></td>
      <td><div class="row-actions">
        <select class="input input-xs" onchange="cambiarEstado('${t.id}',this.value)" style="min-width:130px">
          ${['pendiente','aprobado','imprimiendo','entregado','cancelado'].map(s=>`<option value="${s}"${t.estado===s?' selected':''}>${lbl[s]}</option>`).join('')}
        </select>
        <button class="btn btn-ghost btn-icon-sm" title="Editar" onclick="editarTrabajo('${t.id}')"><svg class="i14"><use href="#i-edit"/></svg></button>
        <button class="btn btn-ghost btn-icon-sm" title="PDF" onclick="generarPDF('${t.id}')"><svg class="i14"><use href="#i-pdf"/></svg></button>
        <button class="btn btn-ghost btn-icon-sm text-danger" title="Eliminar" onclick="eliminarTrabajo('${t.id}')"><svg class="i14"><use href="#i-trash"/></svg></button>
      </div></td>
    </tr>`).join('');
}

/* ── Inventario ──────────────────────────────────────── */
function colorHex(name) {
  const map={negro:'#222',blanco:'#f0f0f0',rojo:'#e53e3e',azul:'#3182ce',verde:'#38a169',
    amarillo:'#d69e2e',naranja:'#dd6b20',morado:'#805ad5',rosa:'#d53f8c',
    gris:'#718096',transparente:'rgba(200,200,200,0.4)',natural:'#c8a96e'};
  return map[(name||'').toLowerCase()]||'#888';
}

function renderFilamentos() {
  const filamentos=window.todosLosFilamentos||[];
  const q=($('inv_buscar')?.value||'').toLowerCase();
  const lista=filamentos.filter(f=>!q||`${f.tipo} ${f.color} ${f.marca}`.toLowerCase().includes(q));
  const view=window.invView||'grid';

  [['ikpi-rollos',fmtN(filamentos.length)],
   ['ikpi-valor',fmt(filamentos.reduce((a,f)=>(a+(f.precio||0)),0))],
   ['ikpi-bajo',fmtN(filamentos.filter(f=>(f.disponibles||0)<=100).length)]
  ].forEach(([id,v])=>{const el=$(id);if(el)el.textContent=v;});

  if(view==='grid'){
    const grid=$('filGrid'); if(!grid) return;
    if(!lista.length){grid.innerHTML='<p style="padding:2rem;opacity:.5">Sin filamentos. Agregá uno con el botón +</p>';return;}
    grid.innerHTML=lista.map(f=>{
      const pct=Math.min(100,((f.disponibles||0)/(f.peso||1000))*100);
      const cg=(f.precio&&f.peso)?f.precio/f.peso*1000:0;
      return `<div class="fil-card">
        <div class="fil-card-head">
          <div class="fil-dot" style="background:${colorHex(f.color)}"></div>
          <div><div class="fw-medium">${f.tipo||'—'} ${f.color||''}</div><div class="text-xs text-muted">${f.marca||'—'}</div></div>
          <div style="margin-left:auto;display:flex;gap:4px">
            <button class="btn btn-ghost btn-icon-sm" onclick="editarFilamento('${f.id}')"><svg class="i14"><use href="#i-edit"/></svg></button>
            <button class="btn btn-ghost btn-icon-sm text-danger" onclick="eliminarFilamento('${f.id}')"><svg class="i14"><use href="#i-trash"/></svg></button>
          </div>
        </div>
        <div class="fil-bar-wrap"><div class="fil-bar" style="width:${pct}%"></div></div>
        <div class="fil-meta"><span>${fmtN(f.disponibles||0)} / ${fmtN(f.peso||0)} g</span><span>${fmt(cg)}/kg</span></div>
      </div>`;
    }).join('');
  } else {
    const tbody=$('filTableBody'); if(!tbody) return;
    if(!lista.length){tbody.innerHTML='<tr><td colspan="7" style="text-align:center;padding:2rem;opacity:.5">Sin filamentos</td></tr>';return;}
    tbody.innerHTML=lista.map(f=>{
      const cg=(f.precio&&f.peso)?f.precio/f.peso*1000:0;
      return `<tr>
        <td><div style="display:flex;align-items:center;gap:8px">
          <div style="width:12px;height:12px;border-radius:50%;background:${colorHex(f.color)};flex-shrink:0"></div>
          <div><div>${f.tipo||'—'}</div><div class="text-xs text-muted">${f.marca||'—'}</div></div></div></td>
        <td>${f.color||'—'}</td>
        <td class="text-right">${fmtN(f.disponibles||0)} g</td>
        <td class="text-right">${fmtN(f.peso||0)} g</td>
        <td class="text-right">${fmt(f.precio||0)}</td>
        <td class="text-right">${fmt(cg)}/kg</td>
        <td><div class="row-actions">
          <button class="btn btn-ghost btn-icon-sm" onclick="editarFilamento('${f.id}')"><svg class="i14"><use href="#i-edit"/></svg></button>
          <button class="btn btn-ghost btn-icon-sm text-danger" onclick="eliminarFilamento('${f.id}')"><svg class="i14"><use href="#i-trash"/></svg></button>
        </div></td>
      </tr>`;
    }).join('');
  }
}

function populateFilamentSelect() {
  const sel=$('c_filamento'); if(!sel) return;
  const current=sel.value;
  sel.innerHTML='<option value="">— Selecciona un filamento —</option>';
  (window.todosLosFilamentos||[]).forEach(f=>{
    const cg=(f.precio&&f.peso)?f.precio/f.peso*1000:0;
    const opt=document.createElement('option');
    opt.value=f.id;
    opt.textContent=`${f.tipo||''} ${f.color||''} ${f.marca?'· '+f.marca:''} — ₡${fmtN(Math.round(cg))}/kg`;
    opt.dataset.cg=cg;
    if(f.id===current)opt.selected=true;
    sel.appendChild(opt);
  });
}
