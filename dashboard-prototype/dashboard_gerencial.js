// ═══════════════════════════════════════════════════════════
//  DASHBOARD GERENCIAL v4 — Todos los 9 endpoints
// ═══════════════════════════════════════════════════════════
axios.interceptors.request.use(c=>{const t=localStorage.getItem('yelave_token');if(t)c.headers.Authorization=`Bearer ${t}`;return c});
const API='/api/dashboard-gerencial';
const fmt=v=>`S/ ${parseFloat(v||0).toLocaleString('es-PE',{minimumFractionDigits:2})}`;
const fmtK=v=>{const n=parseFloat(v||0);if(n>=1e6)return`S/ ${(n/1e6).toFixed(1)}M`;if(n>=1e3)return`S/ ${(n/1e3).toFixed(1)}K`;return fmt(v)};
const fmtU=v=>`$ ${parseFloat(v||0).toLocaleString('en-US',{minimumFractionDigits:2})}`;
const fmtUK=v=>{const n=parseFloat(v||0);if(n>=1e6)return`$ ${(n/1e6).toFixed(1)}M`;if(n>=1e3)return`$ ${(n/1e3).toFixed(1)}K`;return fmtU(v)};
const COLORS=['#3b82f6','#8b5cf6','#06b6d4','#10b981','#f59e0b','#ec4899','#ef4444','#14b8a6','#a855f7','#f97316','#6366f1','#22d3ee','#84cc16','#e879f9','#fb923c'];
const MONTHS=['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
let charts={};
function isDark(){return document.documentElement.getAttribute('data-theme')!=='light'}
function gc(){return isDark()?'rgba(51,65,85,.25)':'rgba(0,0,0,.06)'}
function tc(){return isDark()?'#94a3b8':'#64748b'}
function setDefaults(){Chart.defaults.color=tc();Chart.defaults.borderColor=gc();Chart.defaults.font.family='Inter';Chart.defaults.font.size=9;Chart.defaults.plugins.legend.labels.usePointStyle=true;Chart.defaults.plugins.legend.labels.pointStyleWidth=5}
setDefaults();

// Theme
function toggleTheme(){const h=document.documentElement;const n=h.getAttribute('data-theme')==='dark'?'light':'dark';h.setAttribute('data-theme',n);localStorage.setItem('yelave_theme',n);document.getElementById('btnTheme').textContent=n==='dark'?'🌙':'☀️';setDefaults();applyFilters()}
function toggleFullscreen(){if(!document.fullscreenElement)document.documentElement.requestFullscreen().catch(()=>{});else document.exitFullscreen()}
function onCiaChange(){const s=document.getElementById('filterCia');document.getElementById('companyLabel').textContent=s.options[s.selectedIndex]?.text||'';applyFilters()}
let fpIni, fpFin;

document.addEventListener('DOMContentLoaded',async()=>{
    const sv=localStorage.getItem('yelave_theme');if(sv){document.documentElement.setAttribute('data-theme',sv);document.getElementById('btnTheme').textContent=sv==='dark'?'🌙':'☀️';setDefaults()}
    
    // Init Flatpickr (cross-browser date pickers)
    const fpOpts={locale:'es',dateFormat:'Y-m-d',altInput:true,altFormat:'d/m/Y',disableMobile:true};
    fpIni=flatpickr('#fechaIni',{...fpOpts,defaultDate:'2026-01-01'});
    fpFin=flatpickr('#fechaFin',{...fpOpts,defaultDate:'2026-01-31'});

    await loadCias();
    // Set company label without triggering applyFilters
    const sel=document.getElementById('filterCia');
    document.getElementById('companyLabel').textContent=sel.options[sel.selectedIndex]?.text||'';
    // Single initial load
    applyFilters();
    setInterval(()=>{applyFilters();updSt()},300000);
    setInterval(()=>{const s=document.getElementById('filterCia');if(s.options.length>1){s.selectedIndex=(s.selectedIndex+1)%s.options.length;document.getElementById('companyLabel').textContent=s.options[s.selectedIndex]?.text||'';applyFilters()}},1800000);
    updSt();
});
function updSt(){const n=new Date();document.getElementById('autoStatus').textContent=`Auto · ${n.getHours()}:${String(n.getMinutes()).padStart(2,'0')}`}
async function loadCias(){try{const r=await axios.get('/api/permisos/empresas/me');const s=document.getElementById('filterCia');s.innerHTML=r.data.map(c=>{const cod=(c.CodCia||c.codcia||'').trim();return`<option value="${cod}">${cod} - ${c.nomcia||c.NomCia||''}</option>`}).join('');const cv=localStorage.getItem('yelave_codcia');if(cv)s.value=cv}catch(e){document.getElementById('filterCia').innerHTML='<option>—</option>'}}

async function applyFilters(){
    const codcia=document.getElementById('filterCia').value;
    // Read from Flatpickr instances (reliable cross-browser)
    const fiDate=fpIni&&fpIni.selectedDates[0];
    const ffDate=fpFin&&fpFin.selectedDates[0];
    if(!codcia||!fiDate||!ffDate)return;
    const iso=d=>d.toISOString().split('T')[0];
    const fi=iso(fiDate),ff=iso(ffDate);
    localStorage.setItem('yelave_codcia',codcia);
    const dI=new Date(fi),dF=new Date(ff),dm=dF-dI,pF=new Date(dI.getTime()-864e5),pI=new Date(pF.getTime()-dm);
    const aA=dF.getFullYear().toString(),aP=(dF.getFullYear()-1).toString();
    const g=u=>axios.get(u).catch(()=>({data:null}));
    const [r1,r2,r3,r4,r5,r6,r7,r8,r9,r10]=await Promise.all([
        g(`${API}/resumen?codcia=${codcia}&fecha_ini=${fi}&fecha_fin=${ff}`),
        g(`${API}/ventas-diarias?codcia=${codcia}&fecha_ini=${fi}&fecha_fin=${ff}`),
        g(`${API}/ventas-mensuales?codcia=${codcia}&ano_actual=${aA}&ano_anterior=${aP}`),
        g(`${API}/top-productos?codcia=${codcia}&fecha_ini=${fi}&fecha_fin=${ff}&limit=8`),
        g(`${API}/ranking-vendedores?codcia=${codcia}&fecha_ini=${fi}&fecha_fin=${ff}&limit=8`),
        g(`${API}/precios-descuentos?codcia=${codcia}&fecha_ini=${fi}&fecha_fin=${ff}`),
        g(`${API}/distribucion-geografica?codcia=${codcia}&fecha_ini=${fi}&fecha_fin=${ff}&limit=8`),
        g(`${API}/analisis-pedidos?codcia=${codcia}&fecha_ini=${fi}&fecha_fin=${ff}`),
        g(`${API}/comparativo?codcia=${codcia}&fecha_ini_actual=${fi}&fecha_fin_actual=${ff}&fecha_ini_anterior=${iso(pI)}&fecha_fin_anterior=${iso(pF)}`),
        g(`${API}/descuentos-evolucion?codcia=${codcia}&fecha_ini=${fi}&fecha_fin=${ff}`)
    ]);
    renderKPIs(r1.data,r9.data);       // 1. /resumen + 9. /comparativo
    renderDiarias(r2.data);             // 2. /ventas-diarias
    renderMensuales(r3.data,aA,aP);     // 3. /ventas-mensuales
    renderTipoDocs(r1.data);            // (from resumen)
    if(r4.data){renderTopImp(r4.data.TopImporte);renderTopCant(r4.data.TopCantidad)} // 4. /top-productos
    renderVend(r5.data);                // 5. /ranking-vendedores
    renderPrecios(r6.data);             // 6. /precios-descuentos
    renderGeo(r7.data);                 // 7. /distribucion-geografica
    renderPedidos(r8.data);             // 8. /analisis-pedidos
    renderDescuentos(r10.data);         // 6b. /descuentos-evolucion
}

// ═══ 1+9. KPIs ═══
function renderKPIs(d,comp){
    if(!d)return;const v=d.Ventas||{},p=d.Pedidos||{},g=d.Guias||{};
    document.getElementById('kVentaTotal').textContent=fmtK(v.VentaTotal);
    let sub=`PEN: ${fmtK(v.VentaPEN)}`;if(v.VentaUSD>0)sub+=` · USD: ${fmtUK(v.VentaUSD)}`;
    document.getElementById('kVentaSub').textContent=sub;
    document.getElementById('kDocs').textContent=(v.TotalDocs||0).toLocaleString();
    document.getElementById('kDocsSub').textContent=(d.TipoDocumentos||[]).slice(0,3).map(t=>`${t.TipoDoc}:${t.Cantidad}`).join(' · ');
    document.getElementById('kTicket').textContent=fmt(v.TicketPromedio);
    document.getElementById('kPedidos').textContent=(p.TotalPedidos||0).toLocaleString();
    document.getElementById('kPedidosSub').textContent=`${fmtK(p.MontoPedidos)}`;
    document.getElementById('kGuias').textContent=(g.TotalGuias||0).toLocaleString();
    if(comp){const vp=comp.Variacion||0;const el=document.getElementById('kVariacion');el.textContent=`${vp>0?'+':''}${vp}%`;el.style.color=vp>=0?'#34d399':'#f87171';document.getElementById('kVariacionSub').textContent=`Ant: ${fmtK(comp.Anterior?.VentaTotal)}`}
}

// ═══ 2. VENTAS DIARIAS ═══
function renderDiarias(data){
    if(charts.d)charts.d.destroy();if(!data||!data.length)return;
    const ctx=document.getElementById('chartDiarias').getContext('2d');
    const gP=ctx.createLinearGradient(0,0,0,250);gP.addColorStop(0,'rgba(59,130,246,.2)');gP.addColorStop(1,'rgba(59,130,246,.01)');
    const hasU=data.some(d=>d.VentaUSD>0);
    const ds=[{label:'Soles',data:data.map(d=>d.VentaPEN),borderColor:'#3b82f6',backgroundColor:gP,fill:true,tension:.4,pointRadius:1,borderWidth:1.5}];
    if(hasU){const gU=ctx.createLinearGradient(0,0,0,250);gU.addColorStop(0,'rgba(245,158,11,.15)');gU.addColorStop(1,'rgba(245,158,11,.01)');ds.push({label:'USD',data:data.map(d=>d.VentaUSD),borderColor:'#f59e0b',backgroundColor:gU,fill:true,tension:.4,pointRadius:1,borderWidth:1.5,yAxisID:'y1'})}
    const o={responsive:true,maintainAspectRatio:false,interaction:{intersect:false,mode:'index'},plugins:{legend:{display:hasU,labels:{font:{size:8}}},tooltip:{callbacks:{label:c=>c.dataset.label==='USD'?fmtU(c.raw):fmt(c.raw)}}},scales:{y:{ticks:{callback:v=>fmtK(v),font:{size:8}},grid:{color:gc()}},x:{grid:{display:false},ticks:{maxTicksLimit:12,font:{size:7}}}}};
    if(hasU)o.scales.y1={position:'right',ticks:{callback:v=>fmtUK(v),font:{size:8}},grid:{display:false}};
    charts.d=new Chart(ctx,{type:'line',data:{labels:data.map(d=>{const p=d.Fecha.split('-');return`${p[2]}/${p[1]}`}),datasets:ds},options:o});
}

// ═══ 3. MENSUALES ═══
function renderMensuales(data,aA,aP){
    if(charts.m)charts.m.destroy();if(!data||!data.length)return;
    const by={};data.forEach(d=>{if(!by[d.Ano])by[d.Ano]=new Array(12).fill(0);const mi=parseInt(d.Mes)-1;if(mi>=0&&mi<12)by[d.Ano][mi]=d.VentaTotal});
    charts.m=new Chart(document.getElementById('chartMensuales'),{type:'bar',data:{labels:MONTHS,datasets:[{label:aA,data:by[aA]||new Array(12).fill(0),backgroundColor:'rgba(59,130,246,.7)',borderRadius:2},{label:aP,data:by[aP]||new Array(12).fill(0),backgroundColor:'rgba(139,92,246,.4)',borderRadius:2}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{font:{size:8}}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${fmt(c.raw)}`}}},scales:{y:{ticks:{callback:v=>fmtK(v),font:{size:8}},grid:{color:gc()}},x:{grid:{display:false},ticks:{font:{size:8}}}}}});
}

// ═══ TIPO DOCS (doughnut) — incluye N/A como Nota de Crédito ═══
function renderTipoDocs(data){
    if(charts.td)charts.td.destroy();if(!data||!data.TipoDocumentos)return;
    const t=data.TipoDocumentos.filter(x=>x.Monto!==0);if(!t.length)return;
    // Use absolute values for chart, label N/A as "N. Crédito"
    const labels=t.map(x=>x.TipoDoc==='N/A'?'N. Crédito':x.TipoDoc);
    const values=t.map(x=>Math.abs(x.Monto));
    const counts=t.map(x=>x.Cantidad);
    charts.td=new Chart(document.getElementById('chartTipoDocs'),{type:'doughnut',data:{labels,datasets:[{data:values,backgroundColor:COLORS.slice(0,t.length),borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,cutout:'58%',plugins:{legend:{position:'right',labels:{padding:6,font:{size:8}}},tooltip:{callbacks:{label:c=>{const isNC=t[c.dataIndex].TipoDoc==='N/A';return`${c.label}: ${isNC?'-':''}${fmt(c.raw)} (${counts[c.dataIndex]} docs)`}}}}}});
}

// ═══ 4a. TOP IMPORTE ═══
function renderTopImp(data){
    if(charts.tp)charts.tp.destroy();if(!data||!data.length)return;
    charts.tp=new Chart(document.getElementById('chartTopProd'),{type:'bar',data:{labels:data.map(p=>(p.Producto||'').trim().substring(0,22)),datasets:[{data:data.map(p=>p.ImporteTotal),backgroundColor:COLORS.map(c=>c+'bb'),borderRadius:2}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${fmt(c.raw)} · ${data[c.dataIndex].CantVendida} uds`}}},scales:{x:{ticks:{callback:v=>fmtK(v),font:{size:7}},grid:{color:gc()}},y:{grid:{display:false},ticks:{font:{size:7}}}}}});
}

// ═══ 4b. TOP CANTIDAD ═══
function renderTopCant(data){
    if(charts.tc)charts.tc.destroy();if(!data||!data.length)return;
    charts.tc=new Chart(document.getElementById('chartTopCant'),{type:'bar',data:{labels:data.map(p=>(p.Producto||'').trim().substring(0,22)),datasets:[{data:data.map(p=>p.CantVendida),backgroundColor:COLORS.map(c=>c+'99'),borderRadius:2}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${parseFloat(c.raw).toLocaleString()} uds · ${fmt(data[c.dataIndex].ImporteTotal)}`}}},scales:{x:{grid:{color:gc()},ticks:{font:{size:7}}},y:{grid:{display:false},ticks:{font:{size:7}}}}}});
}

// ═══ 5. VENDEDORES ═══
function renderVend(data){
    if(charts.v)charts.v.destroy();if(!data||!data.length)return;
    charts.v=new Chart(document.getElementById('chartVendedores'),{type:'bar',data:{labels:data.map(v=>(v.Vendedor||'').trim()),datasets:[{data:data.map(v=>v.VentaTotal),backgroundColor:data.map((_,i)=>COLORS[i%COLORS.length]+'bb'),borderRadius:2}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${fmt(c.raw)} · ${data[c.dataIndex].CantDocs} docs`}}},scales:{x:{ticks:{callback:v=>fmtK(v),font:{size:7}},grid:{color:gc()}},y:{grid:{display:false},ticks:{font:{size:8}}}}}});
}

// ═══ 6. PRECIOS Y DESCUENTOS ═══
function renderPrecios(data){
    const el=document.getElementById('preciosPanel');
    if(!data){el.innerHTML='<div style="color:var(--text3);font-size:.7rem;padding:1rem">Sin datos</div>';return}
    const pct=data.PorcDescuento||0;
    const bc=pct>15?'#ef4444':pct>8?'#f59e0b':'#10b981';
    el.innerHTML=`
    <div class="info-grid">
        <div class="info-box bl"><div class="lbl">Precio Promedio</div><div class="val" style="color:#3b82f6">${fmt(data.PrecioPromedio)}</div></div>
        <div class="info-box gr"><div class="lbl">Venta Neta</div><div class="val" style="color:#10b981">${fmtK(data.VentaNeta)}</div></div>
        <div class="info-box or"><div class="lbl">Total Descuentos</div><div class="val" style="color:#f59e0b">${fmtK(data.TotalDescuento)}</div></div>
        <div class="info-box pu"><div class="lbl">% Descuento</div><div class="val" style="color:${bc}">${pct}%</div><div class="bar-mini"><div class="fill" style="width:${Math.min(pct*3,100)}%;background:${bc}"></div></div></div>
    </div>
    <div style="margin-top:.25rem;padding:.3rem .4rem;background:rgba(51,65,85,.15);border-radius:4px;font-size:.5rem;color:var(--text2)">
        📊 Bruta: ${fmtK(data.VentaBruta)} → Neta: ${fmtK(data.VentaNeta)} | Items: ${(data.TotalItems||0).toLocaleString()}
    </div>`;
}

// ═══ 6b. EVOLUCIÓN DESCUENTOS (línea: promedio + máximo diario) ═══
function renderDescuentos(data){
    if(charts.desc)charts.desc.destroy();if(!data||!data.Evolucion||!data.Evolucion.length)return;
    const ev=data.Evolucion;
    const ctx=document.getElementById('chartDescuentos').getContext('2d');
    const gAvg=ctx.createLinearGradient(0,0,0,200);gAvg.addColorStop(0,'rgba(236,72,153,.2)');gAvg.addColorStop(1,'rgba(236,72,153,.01)');
    charts.desc=new Chart(ctx,{type:'line',data:{
        labels:ev.map(d=>{const p=d.Fecha.split('-');return`${p[2]}/${p[1]}`}),
        datasets:[
            {label:'% Prom.',data:ev.map(d=>d.DescProm),borderColor:'#ec4899',backgroundColor:gAvg,fill:true,tension:.4,pointRadius:1,borderWidth:2},
            {label:'% Máx.',data:ev.map(d=>d.DescMax),borderColor:'#ef4444',borderDash:[4,3],tension:.4,pointRadius:0,borderWidth:1.5,fill:false}
        ]},
        options:{responsive:true,maintainAspectRatio:false,interaction:{intersect:false,mode:'index'},
            plugins:{legend:{labels:{font:{size:8}}},tooltip:{callbacks:{label:c=>`${c.dataset.label}: ${c.raw}% (${ev[c.dataIndex].Items} items)`}}},
            scales:{y:{ticks:{callback:v=>v+'%',font:{size:8}},grid:{color:gc()},suggestedMin:0},x:{grid:{display:false},ticks:{maxTicksLimit:10,font:{size:7}}}}}
    });
}

// ═══ 7. DISTRIBUCIÓN GEOGRÁFICA ═══
function renderGeo(data){
    if(charts.g)charts.g.destroy();if(!data||!data.TopZonas||!data.TopZonas.length)return;
    const z=data.TopZonas.slice(0,8);
    charts.g=new Chart(document.getElementById('chartGeo'),{type:'bar',data:{labels:z.map(x=>(x.Distrito||'').trim().substring(0,18)),datasets:[{data:z.map(x=>x.VentaTotal),backgroundColor:COLORS.slice(0,z.length).map(c=>c+'bb'),borderRadius:2}]},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>`${fmt(c.raw)} · ${z[c.dataIndex].CantDocs} docs`}}},scales:{x:{ticks:{callback:v=>fmtK(v),font:{size:7}},grid:{color:gc()}},y:{grid:{display:false},ticks:{font:{size:8}}}}}});
}

// ═══ 8. ANÁLISIS DE PEDIDOS ═══
function renderPedidos(data){
    const el=document.getElementById('pedidosPanel');
    if(!data){el.innerHTML='<div style="color:var(--text3);font-size:.7rem;padding:1rem">Sin datos</div>';return}
    const ef=data.Efectividad||{};const estados=data.PorEstado||[];
    const efPct=ef.PorcEfectividad||0;
    const efC=efPct>80?'#10b981':efPct>50?'#f59e0b':'#ef4444';
    const circ=2*Math.PI*36,dash=circ-(efPct/100)*circ;
    let estHtml=estados.map(e=>`<div class="eff-row"><span>${e.Estado}</span><span style="font-weight:700">${e.Cantidad} — ${fmtK(e.Monto)}</span></div>`).join('');
    el.innerHTML=`
    <div class="eff-wrap">
        <div style="flex-shrink:0;text-align:center">
            <svg width="85" height="85" viewBox="0 0 80 80">
                <circle cx="40" cy="40" r="36" fill="none" stroke="var(--border)" stroke-width="6"/>
                <circle cx="40" cy="40" r="36" fill="none" stroke="${efC}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${circ}" stroke-dashoffset="${dash}" transform="rotate(-90 40 40)" style="transition:stroke-dashoffset 1s ease"/>
                <text x="40" y="40" text-anchor="middle" dominant-baseline="central" fill="${efC}" font-size="14" font-weight="800">${efPct}%</text>
            </svg>
            <div style="font-size:.42rem;color:var(--text3);font-weight:600;margin-top:.1rem">EFECTIVIDAD</div>
        </div>
        <div class="eff-right">
            <div class="eff-mini">
                <div class="eff-stat" style="background:rgba(59,130,246,var(--info-alpha))"><div class="lbl">Total</div><div class="val" style="color:#3b82f6">${ef.TotalPedidos||0}</div></div>
                <div class="eff-stat" style="background:rgba(16,185,129,var(--info-alpha))"><div class="lbl">Cerrados</div><div class="val" style="color:#10b981">${ef.PedidosCerrados||0}</div></div>
            </div>
            ${estHtml}
        </div>
    </div>`;
}
