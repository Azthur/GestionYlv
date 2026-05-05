// ═══════════════════════════════════════════════════════════
//  DASHBOARD CUENTAS POR COBRAR v3 — Multi-moneda real
// ═══════════════════════════════════════════════════════════
axios.interceptors.request.use(c=>{const t=localStorage.getItem('yelave_token');if(t)c.headers.Authorization=`Bearer ${t}`;return c});
Chart.register(ChartDataLabels);

const API='/api/cuentas-cobrar';
const fmt=v=>`S/ ${parseFloat(v||0).toLocaleString('es-PE',{minimumFractionDigits:2})}`;
const fmtK=v=>{const n=parseFloat(v||0);if(n>=1e6)return`S/ ${(n/1e6).toFixed(1)}M`;if(n>=1e3)return`S/ ${(n/1e3).toFixed(1)}K`;return`S/ ${n.toFixed(0)}`};
const fmtU=v=>`$ ${parseFloat(v||0).toLocaleString('en-US',{minimumFractionDigits:2})}`;
const fmtUK=v=>{const n=parseFloat(v||0);if(n>=1e6)return`$ ${(n/1e6).toFixed(1)}M`;if(n>=1e3)return`$ ${(n/1e3).toFixed(1)}K`;return`$ ${n.toFixed(0)}`};
// Neutral formatters (no currency symbol) for multi-currency totals
const fmtN=v=>parseFloat(v||0).toLocaleString('es-PE',{minimumFractionDigits:2});
const fmtNK=v=>{const n=parseFloat(v||0);if(n>=1e6)return`${(n/1e6).toFixed(1)}M`;if(n>=1e3)return`${(n/1e3).toFixed(1)}K`;return fmtN(v)};
const COLORS=['#ef4444','#3b82f6','#10b981','#f59e0b','#8b5cf6','#ec4899','#06b6d4','#14b8a6','#a855f7','#f97316','#6366f1','#22d3ee','#84cc16','#e879f9','#fb923c'];
const MONTHS_MAP={'01':'Ene','02':'Feb','03':'Mar','04':'Abr','05':'May','06':'Jun','07':'Jul','08':'Ago','09':'Sep','10':'Oct','11':'Nov','12':'Dic'};
let charts={};

function isDark(){return document.documentElement.getAttribute('data-theme')!=='light'}
function gc(){return isDark()?'rgba(51,65,85,.25)':'rgba(0,0,0,.06)'}
function tc(){return isDark()?'#cbd5e1':'#1e293b'}
function setDefaults(){Chart.defaults.color=tc();Chart.defaults.borderColor=gc();Chart.defaults.font.family='Inter';Chart.defaults.font.size=11;Chart.defaults.plugins.legend.labels.usePointStyle=true;Chart.defaults.plugins.legend.labels.pointStyleWidth=6;Chart.defaults.plugins.datalabels.display=false}
setDefaults();

const DL_DOUGHNUT={display:true,font:{size:9,weight:'700'},color:'#fff',formatter:(v,ctx)=>{const tot=ctx.chart.data.datasets[0].data.reduce((a,b)=>a+b,0);return tot?((v/tot)*100).toFixed(0)+'%':''},anchor:'center',align:'center'};

function toggleTheme(){const h=document.documentElement;const n=h.getAttribute('data-theme')==='dark'?'light':'dark';h.setAttribute('data-theme',n);localStorage.setItem('yelave_theme',n);document.getElementById('btnTheme').textContent=n==='dark'?'🌙':'☀️';setDefaults();applyFilters()}
function toggleFullscreen(){if(!document.fullscreenElement)document.documentElement.requestFullscreen().catch(()=>{});else document.exitFullscreen()}
function onCiaChange(){const s=document.getElementById('filterCia');document.getElementById('companyLabel').textContent=s.options[s.selectedIndex]?.text||'';applyFilters()}
let fpIni, fpFin;

document.addEventListener('DOMContentLoaded',async()=>{
    const sv=localStorage.getItem('yelave_theme');if(sv){document.documentElement.setAttribute('data-theme',sv);document.getElementById('btnTheme').textContent=sv==='dark'?'🌙':'☀️';setDefaults()}
    const fpOpts={locale:'es',dateFormat:'Y-m-d',altInput:true,altFormat:'d/m/Y',disableMobile:true};
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0,10);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0,10);
    fpIni=flatpickr('#fechaIni',{...fpOpts,defaultDate: firstDay});
    fpFin=flatpickr('#fechaFin',{...fpOpts,defaultDate: lastDay});
    await loadCias();
    const sel=document.getElementById('filterCia');
    document.getElementById('companyLabel').textContent=sel.options[sel.selectedIndex]?.text||'';
    applyFilters();
    setInterval(()=>{applyFilters();updSt()},300000);
    updSt();
});
function updSt(){const n=new Date();document.getElementById('autoStatus').textContent=`Auto · ${n.getHours()}:${String(n.getMinutes()).padStart(2,'0')}`}
async function loadCias(){try{const tk=localStorage.getItem('yelave_token');const ep=tk?'/api/permisos/empresas/me':'/api/permisos/empresas/all';const r=await axios.get(ep);const s=document.getElementById('filterCia');s.innerHTML=r.data.map(c=>{const cod=(c.CodCia||c.codcia||'').trim();return`<option value="${cod}">${cod} - ${c.nomcia||c.NomCia||''}</option>`}).join('');const cv=localStorage.getItem('yelave_codcia');if(cv)s.value=cv}catch(e){try{const r2=await axios.get('/api/permisos/empresas/all');const s=document.getElementById('filterCia');s.innerHTML=r2.data.map(c=>{const cod=(c.CodCia||c.codcia||'').trim();return`<option value="${cod}">${cod} - ${c.nomcia||c.NomCia||''}</option>`}).join('');const cv=localStorage.getItem('yelave_codcia');if(cv)s.value=cv}catch(e2){document.getElementById('filterCia').innerHTML='<option>—</option>'}}}

async function applyFilters(){
    const codcia=document.getElementById('filterCia').value;
    const fiDate=fpIni&&fpIni.selectedDates[0];
    const ffDate=fpFin&&fpFin.selectedDates[0];
    if(!codcia||!fiDate||!ffDate)return;
    const iso=d=>d.toISOString().split('T')[0];
    const fi=iso(fiDate),ff=iso(ffDate);
    localStorage.setItem('yelave_codcia',codcia);
    try{
        const r=await axios.get(`${API}/summary?codcia=${codcia}&fecha_inicio=${fi}&fecha_fin=${ff}`);
        const d=r.data;
        renderKPIs(d);
        renderMes(d.by_mes);
        renderTipoDoc(d.by_tipo_doc);
        renderResumen(d);
        renderClientes(d.top_clientes);
        renderVendedor(d.by_vendedor);
        renderPago(d.by_forma_pago);
        renderTienda(d.by_tienda);
        renderCobrado(d);
        renderConcentra(d.top_clientes,d.total_saldo);
        renderIndicadores(d);
    }catch(e){console.error('Error loading CxC dashboard:',e)}
}

// ═══ KPIs — Multi-currency ═══
function renderKPIs(d){
    document.getElementById('kSaldo').textContent=fmtNK(d.total_saldo);
    document.getElementById('kSaldo').style.color='#ef4444';
    let saldoSub='PEN: '+fmtK(d.saldo_pen);
    if(d.saldo_usd>0)saldoSub+=' · USD: '+fmtUK(d.saldo_usd);
    document.getElementById('kSaldoSub').textContent=saldoSub;

    document.getElementById('kImporte').textContent=fmtNK(d.total_importe);
    let impSub='PEN: '+fmtK(d.importe_pen);
    if(d.importe_usd>0)impSub+=' · USD: '+fmtUK(d.importe_usd);
    document.getElementById('kImporteSub').textContent=impSub;

    document.getElementById('kCobrado').textContent=fmtNK(d.total_acta);
    document.getElementById('kCobrado').style.color='#10b981';
    let cobSub='PEN: '+fmtK(d.acta_pen);
    if(d.acta_usd>0)cobSub+=' · USD: '+fmtUK(d.acta_usd);
    document.getElementById('kCobradoSub').textContent=cobSub;

    document.getElementById('kDocs').textContent=(d.total_docs||0).toLocaleString();
    let docsSub=`PEN: ${d.docs_pen} docs`;
    if(d.docs_usd>0)docsSub+=` · USD: ${d.docs_usd} docs`;
    document.getElementById('kDocsSub').textContent=docsSub;

    const pct=d.total_importe>0?((d.total_acta/d.total_importe)*100).toFixed(1):0;
    const el=document.getElementById('kPct');
    el.textContent=pct+'%';
    el.style.color=pct>=80?'#10b981':pct>=50?'#f59e0b':'#ef4444';
    document.getElementById('kPctSub').textContent='Efectividad de cobranza';
}

// ═══ Saldo por Mes — Dual currency lines ═══
function renderMes(data){
    if(charts.mes)charts.mes.destroy();if(!data||!data.length)return;
    const ctx=document.getElementById('chartMes').getContext('2d');
    const gP=ctx.createLinearGradient(0,0,0,250);gP.addColorStop(0,'rgba(239,68,68,.2)');gP.addColorStop(1,'rgba(239,68,68,.01)');
    const labels=data.map(d=>{const p=d.mes.split('-');return(MONTHS_MAP[p[1]]||p[1])+' '+p[0].slice(2)});
    const penVals=data.map(d=>d.saldo_pen||0);
    const usdVals=data.map(d=>d.saldo_usd||0);
    const hasUSD=usdVals.some(v=>v>0);
    const maxPEN=Math.max(...penVals);

    const ds=[{label:'PEN (S/)',data:penVals,borderColor:'#ef4444',backgroundColor:gP,fill:true,tension:.4,pointRadius:3,borderWidth:2.5,
        datalabels:{display:c=>c.dataIndex===penVals.indexOf(maxPEN),anchor:'end',align:'top',font:{size:9,weight:'800'},color:'#ef4444',backgroundColor:'rgba(255,255,255,.9)',borderRadius:4,padding:{top:2,bottom:2,left:4,right:4},formatter:v=>fmtK(v)}}];

    if(hasUSD){
        const maxUSD=Math.max(...usdVals);
        const gU=ctx.createLinearGradient(0,0,0,250);gU.addColorStop(0,'rgba(245,158,11,.15)');gU.addColorStop(1,'rgba(245,158,11,.01)');
        ds.push({label:'USD ($)',data:usdVals,borderColor:'#f59e0b',backgroundColor:gU,fill:true,tension:.4,pointRadius:3,borderWidth:2,yAxisID:'y1',
            datalabels:{display:c=>c.dataIndex===usdVals.indexOf(maxUSD),anchor:'end',align:'top',font:{size:9,weight:'800'},color:'#f59e0b',backgroundColor:'rgba(255,255,255,.9)',borderRadius:4,padding:{top:2,bottom:2,left:4,right:4},formatter:v=>fmtUK(v)}});
    }

    const o={responsive:true,maintainAspectRatio:false,interaction:{intersect:false,mode:'index'},plugins:{legend:{display:true,labels:{font:{size:10}}},tooltip:{titleFont:{size:12},bodyFont:{size:11},callbacks:{label:c=>c.dataset.label.includes('USD')?fmtU(c.raw)+` (${data[c.dataIndex].count} docs)`:fmt(c.raw)+` (${data[c.dataIndex].count} docs)`}}},scales:{y:{title:{display:true,text:'Soles (S/)',font:{size:10,weight:'bold'}},ticks:{callback:v=>fmtK(v),font:{size:9}},grid:{color:gc()}},x:{grid:{display:false},ticks:{font:{size:9},maxTicksLimit:12}}}};
    if(hasUSD)o.scales.y1={position:'right',title:{display:true,text:'Dólares ($)',font:{size:10,weight:'bold'}},ticks:{callback:v=>fmtUK(v),font:{size:9}},grid:{display:false}};
    charts.mes=new Chart(ctx,{type:'line',data:{labels,datasets:ds},options:o});
}

// ═══ Tipo Documento ═══
function renderTipoDoc(data){
    if(charts.td)charts.td.destroy();if(!data||!data.length)return;
    charts.td=new Chart(document.getElementById('chartTipoDoc'),{type:'doughnut',data:{labels:data.map(d=>d.label==='FACT'?'Facturas':d.label==='BOLE'?'Boletas':d.label),datasets:[{data:data.map(d=>d.saldo),backgroundColor:COLORS.slice(0,data.length),borderWidth:0,datalabels:DL_DOUGHNUT}]},options:{responsive:true,maintainAspectRatio:false,cutout:'58%',plugins:{legend:{position:'right',labels:{padding:8,font:{size:10}}},tooltip:{titleFont:{size:12},bodyFont:{size:11},callbacks:{label:c=>{const item=data[c.dataIndex];let t=`${c.label}: PEN ${fmtK(item.saldo_pen)}`;if(item.saldo_usd>0)t+=` · USD ${fmtUK(item.saldo_usd)}`;return t+` · ${item.count} docs`}}}}}});
}

// ═══ Resumen General ═══
function renderResumen(d){
    const el=document.getElementById('resumenPanel');
    const pct=d.total_importe>0?((d.total_acta/d.total_importe)*100).toFixed(1):0;
    const pctC=pct>=80?'#10b981':pct>=50?'#f59e0b':'#ef4444';
    const hasU=d.saldo_usd>0;
    el.innerHTML=`
    <div class="info-grid">
        <div class="info-box rd"><div class="lbl">Pendiente S/</div><div class="val" style="color:#ef4444">${fmtK(d.saldo_pen)}</div></div>
        <div class="info-box or"><div class="lbl">Pendiente $</div><div class="val" style="color:#f59e0b">${hasU?fmtUK(d.saldo_usd):'$ 0'}</div></div>
        <div class="info-box bl"><div class="lbl">Docs PEN / USD</div><div class="val" style="color:#3b82f6">${d.docs_pen} / ${d.docs_usd}</div></div>
        <div class="info-box gr"><div class="lbl">% Cobranza</div><div class="val" style="color:${pctC}">${pct}%</div><div class="bar-mini"><div class="fill" style="width:${pct}%;background:${pctC}"></div></div></div>
    </div>
    <div style="margin-top:.25rem;padding:.35rem .5rem;background:rgba(51,65,85,.15);border-radius:4px;font-size:.65rem;color:var(--text2)">
        📊 Pend. PEN: ${fmtK(d.saldo_pen)}${hasU?' · Pend. USD: '+fmtUK(d.saldo_usd):''} · Total equiv. PEN: ${fmtK(d.total_saldo)}
    </div>`;
}

// ═══ Helper: Build stacked bar (PEN + USD) ═══
function buildStackedBar(canvasId, items, chartKey, tooltipExtra){
    if(charts[chartKey])charts[chartKey].destroy();if(!items||!items.length)return;
    const top=items.slice(0,8);
    const hasUSD=top.some(t=>(t.saldo_usd||0)>0);
    const datasets=[{label:'PEN (S/)',data:top.map(t=>t.saldo_pen||0),backgroundColor:'rgba(239,68,68,.7)',borderRadius:3,
        datalabels:{display:true,anchor:'end',align:'end',font:{size:8,weight:'700'},color:'#ef4444',formatter:v=>v>0?fmtK(v):''}}];
    if(hasUSD){
        datasets.push({label:'USD ($)',data:top.map(t=>t.saldo_usd||0),backgroundColor:'rgba(245,158,11,.7)',borderRadius:3,
            datalabels:{display:true,anchor:'end',align:'end',font:{size:8,weight:'700'},color:'#f59e0b',formatter:v=>v>0?fmtUK(v):''}});
    }
    charts[chartKey]=new Chart(document.getElementById(canvasId),{type:'bar',data:{labels:top.map(t=>(t.label||t.nomaux||'').trim().substring(0,22)),datasets},options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,plugins:{legend:{display:hasUSD,labels:{font:{size:9}}},tooltip:{titleFont:{size:12},bodyFont:{size:11},callbacks:{label:c=>{const item=top[c.dataIndex];if(c.dataset.label.includes('USD'))return `USD: ${fmtU(c.raw)}`;let t=`PEN: ${fmt(item.saldo_pen)}`;if(item.saldo_usd>0)t+=` · USD: ${fmtU(item.saldo_usd)}`;if(tooltipExtra)t+=` · ${tooltipExtra(item)}`;return t}}}},scales:{x:{stacked:!hasUSD,ticks:{callback:v=>fmtK(v),font:{size:9}},grid:{color:gc()}},y:{stacked:!hasUSD,grid:{display:false},ticks:{font:{size:9}}}}}});
}

// ═══ Top Clientes ═══
function renderClientes(data){
    buildStackedBar('chartClientes',data&&data.slice(0,8).map(c=>({...c,label:(c.nomaux||'').trim()})),'cli',item=>`${item.count} docs`);
}

// ═══ Por Vendedor ═══
function renderVendedor(data){
    buildStackedBar('chartVendedor',data,'ven',item=>`${item.count} docs`);
}

// ═══ Forma de Pago ═══
function renderPago(data){
    if(charts.pago)charts.pago.destroy();if(!data||!data.length)return;
    // Show tooltip with currency breakdown
    charts.pago=new Chart(document.getElementById('chartPago'),{type:'doughnut',data:{labels:data.map(d=>d.label),datasets:[{data:data.map(d=>d.saldo),backgroundColor:COLORS.slice(2,2+data.length),borderWidth:0,datalabels:DL_DOUGHNUT}]},options:{responsive:true,maintainAspectRatio:false,cutout:'55%',plugins:{legend:{position:'right',labels:{padding:6,font:{size:9}}},tooltip:{titleFont:{size:12},bodyFont:{size:11},callbacks:{label:c=>{const item=data[c.dataIndex];let t=`${c.label}: PEN ${fmtK(item.saldo_pen)}`;if(item.saldo_usd>0)t+=` · USD ${fmtUK(item.saldo_usd)}`;return t}}}}}});
}

// ═══ Por Tienda ═══
function renderTienda(data){
    buildStackedBar('chartTienda',data,'tienda',item=>`${item.count} docs`);
}

// ═══ Cobrado vs Pendiente — Multi-currency bars ═══
function renderCobrado(d){
    if(charts.cob)charts.cob.destroy();
    const hasU=d.saldo_usd>0;
    if(hasU){
        // Show 4 bars: Cobrado PEN, Pendiente PEN, Cobrado USD, Pendiente USD
        charts.cob=new Chart(document.getElementById('chartCobrado'),{type:'bar',data:{
            labels:['Cobrado','Pendiente'],
            datasets:[
                {label:'PEN (S/)',data:[d.acta_pen,d.saldo_pen],backgroundColor:['rgba(16,185,129,.7)','rgba(239,68,68,.7)'],borderRadius:4,
                    datalabels:{display:true,anchor:'end',align:'top',font:{size:9,weight:'700'},color:c=>c.dataIndex===0?'#10b981':'#ef4444',formatter:v=>fmtK(v)}},
                {label:'USD ($)',data:[d.acta_usd,d.saldo_usd],backgroundColor:['rgba(6,182,212,.7)','rgba(245,158,11,.7)'],borderRadius:4,
                    datalabels:{display:true,anchor:'end',align:'top',font:{size:9,weight:'700'},color:c=>c.dataIndex===0?'#06b6d4':'#f59e0b',formatter:v=>fmtUK(v)}}
            ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:true,labels:{font:{size:10}}},tooltip:{titleFont:{size:12},bodyFont:{size:11},callbacks:{label:c=>c.dataset.label.includes('USD')?`USD: ${fmtU(c.raw)}`:`PEN: ${fmt(c.raw)}`}}},scales:{y:{ticks:{callback:v=>fmtK(v),font:{size:9}},grid:{color:gc()}},x:{grid:{display:false},ticks:{font:{size:10}}}}}});
    }else{
        charts.cob=new Chart(document.getElementById('chartCobrado'),{type:'bar',data:{
            labels:['Facturado','Cobrado','Pendiente'],
            datasets:[{data:[d.importe_pen,d.acta_pen,d.saldo_pen],backgroundColor:['rgba(59,130,246,.7)','rgba(16,185,129,.7)','rgba(239,68,68,.7)'],borderRadius:4,
                datalabels:{display:true,anchor:'end',align:'top',font:{size:9,weight:'700'},color:c=>['#3b82f6','#10b981','#ef4444'][c.dataIndex],formatter:v=>fmtK(v)}}]
        },options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false},tooltip:{titleFont:{size:12},bodyFont:{size:11},callbacks:{label:c=>fmt(c.raw)}}},scales:{y:{ticks:{callback:v=>fmtK(v),font:{size:9}},grid:{color:gc()}},x:{grid:{display:false},ticks:{font:{size:10}}}}}});
    }
}

// ═══ Concentración de Deuda ═══
function renderConcentra(clientes,totalSaldo){
    if(charts.conc)charts.conc.destroy();if(!clientes||!clientes.length)return;
    const top=clientes.slice(0,10);
    const cumData=[];let cum=0;
    top.forEach(c=>{cum+=c.saldo;cumData.push(totalSaldo>0?((cum/totalSaldo)*100).toFixed(1):0)});
    charts.conc=new Chart(document.getElementById('chartConcentra'),{type:'bar',data:{labels:top.map((_,i)=>`Top ${i+1}`),datasets:[
        {type:'bar',label:'Saldo (equiv. PEN)',data:top.map(c=>c.saldo),backgroundColor:COLORS.map(c=>c+'99'),borderRadius:3,datalabels:{display:false}},
        {type:'line',label:'% Acumulado',data:cumData,borderColor:'#f59e0b',borderWidth:2.5,tension:.3,pointRadius:3,pointBackgroundColor:'#f59e0b',yAxisID:'y1',
            datalabels:{display:c=>c.dataIndex===top.length-1,anchor:'end',align:'top',font:{size:9,weight:'800'},color:'#f59e0b',backgroundColor:'rgba(255,255,255,.9)',borderRadius:4,padding:{top:2,bottom:2,left:4,right:4},formatter:v=>v+'%'}}
    ]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{font:{size:9}}},tooltip:{titleFont:{size:12},bodyFont:{size:11},callbacks:{label:c=>{if(c.dataset.label.includes('%'))return c.raw+'%';const item=top[c.dataIndex];let t=`${(item?.nomaux||'').substring(0,25)}`;t+=`\nPEN: ${fmtK(item.saldo_pen)}`;if(item?.saldo_usd>0)t+=` · USD: ${fmtUK(item.saldo_usd)}`;return t}}}},scales:{y:{ticks:{callback:v=>fmtK(v),font:{size:8}},grid:{color:gc()}},y1:{position:'right',min:0,max:100,ticks:{callback:v=>v+'%',font:{size:8}},grid:{display:false}},x:{grid:{display:false},ticks:{font:{size:8}}}}}});
}

// ═══ Indicadores Clave ═══
function renderIndicadores(d){
    const el=document.getElementById('indicadoresPanel');
    const topClients=d.top_clientes||[];
    const top3Pct=d.total_saldo>0?(topClients.slice(0,3).reduce((a,c)=>a+c.saldo,0)/d.total_saldo*100).toFixed(1):0;
    const hasU=d.saldo_usd>0;
    const avgPEN=d.docs_pen>0?(d.saldo_pen/d.docs_pen):0;
    const avgUSD=d.docs_usd>0?(d.saldo_usd/d.docs_usd):0;
    el.innerHTML=`
    <div class="info-grid">
        <div class="info-box rd"><div class="lbl">Prom/Doc PEN</div><div class="val" style="color:#ef4444">${fmtK(avgPEN)}</div></div>
        <div class="info-box or"><div class="lbl">Prom/Doc USD</div><div class="val" style="color:#f59e0b">${hasU?fmtUK(avgUSD):'—'}</div></div>
        <div class="info-box bl"><div class="lbl">Top 3 Concentra</div><div class="val" style="color:#3b82f6">${top3Pct}%</div><div class="bar-mini"><div class="fill" style="width:${top3Pct}%;background:#3b82f6"></div></div></div>
        <div class="info-box gr"><div class="lbl">Vendedores</div><div class="val" style="color:#10b981">${(d.by_vendedor||[]).length}</div></div>
    </div>
    <div style="margin-top:.25rem;padding:.35rem .5rem;background:rgba(51,65,85,.15);border-radius:4px;font-size:.65rem;color:var(--text2)">
        🎯 Top 3 = ${top3Pct}% del total${hasU?' · '+d.docs_usd+' docs en USD ('+fmtUK(d.saldo_usd)+')':''} · ${(d.by_tienda||[]).filter(t=>t.label!=='(Sin datos)').length} tiendas
    </div>`;
}
