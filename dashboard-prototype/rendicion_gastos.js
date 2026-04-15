const API_URL = "http://localhost:8000/api";

let empresas = [];
let personas = [];
let categoriasCosto = [];
let rowCount = 0;
let currentRowIdxToFill = null;
let archivosAdjuntos = []; // Almacenar archivos múltiples

document.addEventListener("DOMContentLoaded", async () => {
    document.getElementById("iptFecha").valueAsDate = new Date();
    document.getElementById("iptFecha").addEventListener("change", autoFillPeriod);
    autoFillPeriod();
    
    await cargarEmpresas();
    
    // Check if Edit Mode
    const args = new URLSearchParams(window.location.search);
    const editId = args.get("id");
    if(editId) {
        cargarRendicionParaEditar(editId);
    } else {
        agregarFilaGastos();
    }

    // Eliminar historial si existía
    const tb = document.getElementById("tbodyHistorial");
    if(tb) tb.innerHTML = "";
});

let _editId = null;

async function cargarRendicionParaEditar(id) {
    try {
        Swal.showLoading();
        const res = await axios.get(`${API_URL}/finanzas/rendiciones/${id}`);
        const cab = res.data.cabecera;
        const det = res.data.detalle;
        const adj = res.data.adjuntos || [];
        
        let fileZone = document.getElementById("fileZone");
        if(fileZone) {
            let fileListViejos = document.getElementById("fileListViejos");
            if(!fileListViejos) {
                fileListViejos = document.createElement("div");
                fileListViejos.id = "fileListViejos";
                fileListViejos.style.marginTop = "10px";
                fileZone.appendChild(fileListViejos);
            }
            fileListViejos.innerHTML = adj.map(a => `<div style="padding:4px; font-weight:bold;"><a href="${API_URL}/finanzas/adjuntos/rendicion/${a.Id}" target="_blank" style="color:#2563eb;">📎 ${a.NombreArchivo} (Anterior)</a></div>`).join("");
        }
        
        _editId = id;
        document.getElementById("iptNroRendicion").value = cab.NroRendicion;
        document.getElementById("selEmpresa").value = cab.CodCia;
        await seleccionarEmpresa();
        
        document.getElementById("iptFecha").value = cab.Fecha;
        document.getElementById("iptPeriodo").value = cab.Periodo;
        document.getElementById("selMoneda").value = cab.Moneda || 'PEN';
        
        const sel = document.getElementById("selPersona");
        sel.value = cab.CodAux ? cab.CodAux.trim() : "";
        seleccionarPersona();
        
        document.getElementById("iptSaldoInicial").value = cab.SaldoInicial;
        
        const tbody = document.getElementById("tbodyRendicion");
        tbody.innerHTML = "";
        det.forEach(d => {
            const rId = ++rowCount;
            const tr = document.createElement("tr");
            tr.id = `row-${rId}`;
            tr.dataset.refId = d.DocReferenciaId || '';
            tr.innerHTML = `
                <td><input type="date" class="f-fecha" value="${d.Fecha}"></td>
                <td>
                    <select class="f-tipo" onchange="tipoDocChanged(${rId})">
                        <option value="01-Factura" ${d.TipoDoc==='01-Factura'?'selected':''}>01 - Factura</option>
                        <option value="03-Boleta" ${d.TipoDoc==='03-Boleta'?'selected':''}>03 - Boleta</option>
                        <option value="12-Ticket" ${d.TipoDoc==='12-Ticket'?'selected':''}>12 - Ticket</option>
                        <option value="PGM-Planilla" ${d.TipoDoc==='PGM-Planilla'?'selected':''}>PGM - Planilla Mov.</option>
                        <option value="Otros" ${d.TipoDoc==='Otros'?'selected':''}>Otros</option>
                    </select>
                </td>
                <td><input type="text" class="f-serie" value="${d.Serie||''}"></td>
                <td><input type="text" class="f-numero" value="${d.Numero||''}"></td>
                <td><input type="text" class="f-ruc" value="${d.RucPro||''}"></td>
                <td><input type="text" class="f-proveedor" value="${d.NomPro||''}"></td>
                <td><input type="text" class="f-project" value="${d.ProjectCard||''}"></td>
                <td><input type="text" class="f-cc" value="${d.CentroCostos||''}"></td>
                <td><input type="text" class="f-cat cursor-pointer" readonly onclick="openModalCongasto(${rId})" value="${d.ExpenseCategory||''}"></td>
                <td><input type="text" class="f-det" value="${d.Detalles||''}"></td>
                <td><input type="number" step="0.01" class="f-sol" value="${d.ImporteSoles}" onkeyup="calcularResumen()" onchange="calcularResumen()"></td>
                <td><input type="number" step="0.01" class="f-dol" value="${d.ImporteDolares}" onkeyup="calcularResumen()" onchange="calcularResumen()"></td>
                <td class="text-center">
                    <button type="button" class="btn-icon" onclick="openModalBuscar(${rId})" title="Buscar Doc. Sist." id="btnSearch-${rId}">?</button>
                    <button type="button" class="btn-icon text-red" onclick="borrarFila(${rId})" title="Eliminar fila">&#10006;</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        
        calcularResumen();
        Swal.close();
    } catch(e) {
        console.error("Edit load error:", e);
        Swal.fire("Error", "Detalle: " + e.message, "error");
    }
}

async function cargarEmpresas() {
    try {
        const res = await axios.get(`${API_URL}/finanzas/empresas`);
        empresas = res.data;
        const sel = document.getElementById("selEmpresa");
        empresas.forEach(e => {
            const opt = document.createElement("option");
            opt.value = e.codcia;
            opt.textContent = `${e.codcia} - ${e.nomcia}`;
            sel.appendChild(opt);
        });
        
        // Auto-seleccionar la empresa del usuario
        const currentUser = JSON.parse(localStorage.getItem('yelave_user') || '{}');
        const defaultCodCia = currentUser.codcia || '003';
        sel.value = defaultCodCia;
        await seleccionarEmpresa();
        
    } catch (e) {
        console.error("Error empresas:", e);
    }
}

async function seleccionarEmpresa() {
    const cod = document.getElementById("selEmpresa").value;
    const emp = empresas.find(e => e.codcia === cod);
    if(emp) {
        document.getElementById("txtHeaderEmpresa").textContent = emp.nomcia;
        document.getElementById("iptEmpresaNom").value = emp.nomcia;
        document.getElementById("iptEmpresaRuc").value = emp.ruccia;
    } else {
        document.getElementById("txtHeaderEmpresa").textContent = "---";
        document.getElementById("iptEmpresaNom").value = "";
        document.getElementById("iptEmpresaRuc").value = "";
    }
    await cargarPersonas();
    await cargarCategoriasGasto();
}

function autoFillPeriod() {
    const arr = document.getElementById("iptFecha").value.split("-");
    if(arr.length === 3) {
        const d = new Date(arr[0], arr[1]-1, arr[2]);
        const m = d.toLocaleString('es-ES', { month: 'long' });
        document.getElementById("iptPeriodo").value = m.charAt(0).toUpperCase() + m.slice(1);
    }
}

async function cargarPersonas() {
    try {
        const codcia = document.getElementById("selEmpresa").value || '003';
        const res = await axios.get(`${API_URL}/finanzas/auxiliares/009?codcia=${codcia}`);
        personas = res.data;
        
        const sel = document.getElementById("selPersona");
        sel.innerHTML = '<option value="">Seleccione o escriba...</option>';
        personas.forEach(t => {
            const opt = document.createElement("option");
            opt.value = t.codaux ? t.codaux.trim() : '';
            const name = t.nomaux ? t.nomaux.trim() : '';
            const ruc = t.rucaux ? t.rucaux.trim() : '';
            opt.textContent = `${ruc} - ${name}`;
            sel.appendChild(opt);
        });
        document.getElementById("iptPersonaNom").value = '';
        document.getElementById("iptPersonaDoc").value = '';
    } catch (e) {
        console.error(e);
        Swal.fire("Error", "No se pudieron cargar los SOCIOS/RENDIDORES.", "error");
    }
}

function seleccionarPersona() {
    const val = document.getElementById("selPersona").value;
    const t = personas.find(x => (x.codaux ? x.codaux.trim() : '') === val);
    if (t) {
        document.getElementById("iptPersonaNom").value = t.nomaux ? t.nomaux.trim() : '';
        document.getElementById("iptPersonaDoc").value = t.rucaux ? t.rucaux.trim() : '';
    } else {
        document.getElementById("iptPersonaNom").value = '';
        document.getElementById("iptPersonaDoc").value = '';
    }
}

async function cargarCategoriasGasto() {
    try {
        const codcia = document.getElementById('selEmpresa').value || '003';
        const res = await axios.get(`${API_URL}/finanzas/congasto?codcia=${codcia}`);
        categoriasCosto = res.data;
    } catch (e) {
        console.error("Error cargando CONGASTO", e);
    }
}

function agregarFila() {
    rowCount++;
    const tr = document.createElement("tr");
    tr.id = `fila-${rowCount}`;
    
    // Almacenaje logico de Doc ID referenciados
    tr.dataset.refId = ""; 

    tr.innerHTML = `
        <td>${rowCount}</td>
        <td><input type="date" class="f-fecha" required></td>
        <td>
            <select class="f-tipo">
                <option value="01-Factura">01-Factura</option>
                <option value="03-Boleta">03-Boleta</option>
                <option value="PGM-Planilla">PGM-Planilla</option>
                <option value="00-Otros">00-Otros</option>
            </select>
        </td>
        <td><input type="text" class="f-serie" placeholder="Ej: F001"></td>
        <td><input type="text" class="f-numero" placeholder="Ej: 1332"></td>
        <td><input type="text" class="f-ruc"></td>
        <td><input type="text" class="f-proveedor"></td>
        <td><input type="text" class="f-project"></td>
        <td><input type="text" class="f-cc"></td>
        <td>
            <div style="display:flex;">
                <input type="text" class="f-cat text-left" readonly placeholder="Seleccionar..." style="flex-grow:1; cursor:pointer;" onclick="openModalCongasto(${rowCount})">
            </div>
        </td>
        <td><input type="text" class="f-det"></td>
        <td><input type="number" step="0.01" class="f-sol text-right" value="0.00" onkeyup="calcularResumen()" onchange="calcularResumen()"></td>
        <td><input type="number" step="0.01" class="f-dol text-right" value="0.00" onkeyup="calcularResumen()" onchange="calcularResumen()"></td>
        <td style="white-space: nowrap;">
            <button type="button" class="btn btn-search" title="Buscar Factura" onclick="openModalFactura(${rowCount})">F</button>
            <button type="button" class="btn btn-search" title="Buscar Planilla Movilidad" style="background:#8b5cf6;" onclick="openModalPlanilla(${rowCount})">P</button>
            <button type="button" class="btn btn-del" title="Eliminar fila" onclick="eliminarFila(${rowCount})">X</button>
        </td>
    `;
    document.getElementById("tbodyRendicion").appendChild(tr);
}

function eliminarFila(id) {
    const tr = document.getElementById(`fila-${id}`);
    if (tr) {
        tr.remove();
        calcularResumen();
    }
}

function calcularResumen() {
    let totSol = 0;
    let totDol = 0;
    
    document.querySelectorAll(".f-sol").forEach(ip => totSol += parseFloat(ip.value||0));
    document.querySelectorAll(".f-dol").forEach(ip => totDol += parseFloat(ip.value||0));
    
    document.getElementById("iptTotalSol").value = totSol.toFixed(2);
    document.getElementById("iptTotalUS").value = totDol.toFixed(2);
    
    const saldoInicial = parseFloat(document.getElementById("iptSaldoInicial").value) || 0;
    
    const monedaMain = document.getElementById("selMoneda").value;
    const totalGasto = monedaMain === "Dolares" ? totDol : totSol;
    
    const saldoFinal = saldoInicial - totalGasto;
    document.getElementById("iptSaldoFinal").value = saldoFinal.toFixed(2);
    
    document.getElementById("lblSaldoIn").textContent = saldoInicial.toFixed(2);
    document.getElementById("lblTotalGas").textContent = totalGasto.toFixed(2);
    
    if (saldoFinal < 0) {
        document.getElementById("lblSaldoFi").textContent = "0.00";
        document.getElementById("lblReembolso").textContent = Math.abs(saldoFinal).toFixed(2); // El saldo en contra es el reembolso
    } else {
        document.getElementById("lblSaldoFi").textContent = saldoFinal.toFixed(2);
        document.getElementById("lblReembolso").textContent = "0.00";
    }
}

document.getElementById("selMoneda").addEventListener("change", calcularResumen);

// === Modals ===
function closeModal(id) { document.getElementById(id).style.display = "none"; }

async function openModalFactura(rowIdx) {
    currentRowIdxToFill = rowIdx;
    document.getElementById("qFactura").value = "";
    document.getElementById("tbModalFacturas").innerHTML = "";
    document.getElementById("modalFacturas").style.display = "flex";
}

async function buscarFacturax() {
    const q = document.getElementById("qFactura").value;
    if(q.length < 3) return Swal.fire("Atención", "Ingrese al menos 3 caracteres", "info");
    
    const codcia = document.getElementById('selEmpresa').value || '003';
    try {
        Swal.showLoading();
        const res = await axios.get(`${API_URL}/finanzas/rendiciones/buscar-factura?codcia=${codcia}&q=${q}`);
        Swal.close();
        
        const tb = document.getElementById("tbModalFacturas");
        tb.innerHTML = "";
        
        if (res.data.length === 0) {
            tb.innerHTML = "<tr><td colspan='5' class='text-center'>No se encontraron coincidencias</td></tr>";
            return;
        }
        
        res.data.forEach(f => {
            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${f.FecEmision.substring(0,10)}</td>
                <td>${f.Serie}-${f.Numero}</td>
                <td>${f.RucPro || ''}</td>
                <td>${f.NomPro || ''}</td>
                <td>${f.CodMon} ${f.Total}</td>
            `;
            tr.onclick = () => {
                llenarFilaDesdeFactura(f);
                closeModal('modalFacturas');
            };
            tb.appendChild(tr);
        });
    } catch(e) {
        Swal.fire("Error","Error buscando factura", "error");
    }
}

function llenarFilaDesdeFactura(f) {
    const tr = document.getElementById(`fila-${currentRowIdxToFill}`);
    if(!tr) return;
    
    tr.dataset.refId = f.FacturaId;
    tr.querySelector(".f-tipo").value = "01-Factura";
    tr.querySelector(".f-fecha").value = f.FecEmision.substring(0,10);
    tr.querySelector(".f-serie").value = f.Serie;
    tr.querySelector(".f-numero").value = f.Numero;
    tr.querySelector(".f-ruc").value = f.RucPro || "";
    tr.querySelector(".f-proveedor").value = f.NomPro || "";
    
    if (f.CodMon === "USD") {
        tr.querySelector(".f-sol").value = "0.00";
        tr.querySelector(".f-dol").value = parseFloat(f.Total).toFixed(2);
    } else {
        tr.querySelector(".f-sol").value = parseFloat(f.Total).toFixed(2);
        tr.querySelector(".f-dol").value = "0.00";
    }
    calcularResumen();
}

async function openModalPlanilla(rowIdx) {
    currentRowIdxToFill = rowIdx;
    const codcia = document.getElementById('selEmpresa').value || '003';
    
    // Si hay un codaux, podemos enviarlo, pero ahora el backend soporta mostrar todas las planillas sin codaux.
    let url = `${API_URL}/finanzas/planillas/pendientes_rendicion?codcia=${codcia}`;
    
    try {
        Swal.showLoading();
        const res = await axios.get(url);
        Swal.close();
        
        const tb = document.getElementById("tbModalPlanillas");
        tb.innerHTML = "";
        
        if (res.data.length === 0) {
            tb.innerHTML = "<tr><td colspan='4' class='text-center'>No tiene planillas pendientes de rendir en esta empresa.</td></tr>";
        } else {
            res.data.forEach(p => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td>${p.NroPlanilla}</td>
                    <td>${p.FechaEmision}</td>
                    <td>S/ ${p.TotalGastado}</td>
                    <td><button class="btn btn-search">Seleccionar</button></td>
                `;
                tr.onclick = () => {
                    llenarFilaDesdePlanilla(p);
                    closeModal('modalPlanillas');
                };
                tb.appendChild(tr);
            });
        }
        
        document.getElementById("modalPlanillas").style.display = "flex";
    } catch(e) {
        Swal.fire("Error","Error buscando planillas", "error");
    }
}

function llenarFilaDesdePlanilla(p) {
    const tr = document.getElementById(`fila-${currentRowIdxToFill}`);
    if(!tr) return;
    
    tr.dataset.refId = p.Id;
    tr.querySelector(".f-tipo").value = "PGM-Planilla";
    tr.querySelector(".f-fecha").value = p.FechaEmision;
    tr.querySelector(".f-serie").value = "PGM";
    tr.querySelector(".f-numero").value = p.NroPlanilla.replace('PGM-','');
    tr.querySelector(".f-ruc").value = p.RucDni || "";
    tr.querySelector(".f-proveedor").value = p.NomAux || "";
    tr.querySelector(".f-cat").value = "MOVILIDAD";
    
    tr.querySelector(".f-sol").value = parseFloat(p.TotalGastado).toFixed(2);
    tr.querySelector(".f-dol").value = "0.00";
    
    calcularResumen();
}

// CONGASTO
function openModalCongasto(rowIdx) {
    currentRowIdxToFill = rowIdx;
    document.getElementById("qCongasto").value = "";
    document.getElementById("modalCongasto").style.display = "flex";
    filtrarCongasto();
}

function filtrarCongasto() {
    const q = document.getElementById("qCongasto").value.toLowerCase();
    const tb = document.getElementById("tbModalCongasto");
    tb.innerHTML = "";
    
    const filtrados = categoriasCosto.filter(c => 
        c.DESCGAS.toLowerCase().includes(q) || c.CODCGAS.toLowerCase().includes(q)
    );
    
    if (filtrados.length === 0) {
        tb.innerHTML = "<tr><td colspan='3' class='text-center'>No se encontraron categorías</td></tr>";
        return;
    }
    
    filtrados.forEach(c => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td>${c.CODCGAS}</td>
            <td>${c.DESCGAS}</td>
            <td>${c.CODCTA || ''}</td>
        `;
        tr.onclick = () => {
            const rowTr = document.getElementById(`fila-${currentRowIdxToFill}`);
            if(rowTr) {
                rowTr.querySelector(".f-cat").value = c.DESCGAS;
            }
            closeModal('modalCongasto');
        };
        tb.appendChild(tr);
    });
}

// ============================================================
//  ARCHIVOS ADJUNTOS ACUMULATIVOS
// ============================================================
function agregarArchivos() {
    const input = document.getElementById('fileInput');
    if (input.files.length > 0) {
        Array.from(input.files).forEach(f => {
            archivosAdjuntos.push(f);
        });
        renderFileList();
    }
    // Reset el input para permitir seleccionar los mismos archivos
    input.value = '';
}

function renderFileList() {
    const box = document.getElementById('fileList');
    box.innerHTML = "";
    archivosAdjuntos.forEach((f, idx) => {
        box.innerHTML += `<div style="display:flex; align-items:center; gap:5px; margin-bottom:3px;">
            <span>📄 ${f.name} (${(f.size/1024).toFixed(1)} kb)</span>
            <button type="button" onclick="quitarArchivo(${idx})" style="background:#ef4444; color:white; border:none; border-radius:3px; padding:1px 6px; cursor:pointer; font-size:0.75rem;">✕</button>
        </div>`;
    });
}

function quitarArchivo(idx) {
    archivosAdjuntos.splice(idx, 1);
    renderFileList();
}

// ============================================================
//  GUARDAR RENDICIÓN
// ============================================================
async function guardarRendicion() {
    const selPersona = document.getElementById("selPersona").value;
    if (!selPersona) return Swal.fire("Alerta", "Seleccione el Trabajador/Socio arriba.", "warning");
    
    const detalle = [];
    let isValid = true;

    document.querySelectorAll("#tbodyRendicion tr").forEach(tr => {
        const d = {
            fecha: tr.querySelector(".f-fecha").value,
            tipo_doc: tr.querySelector(".f-tipo").value,
            serie: tr.querySelector(".f-serie").value.trim(),
            numero: tr.querySelector(".f-numero").value.trim(),
            ruc_pro: tr.querySelector(".f-ruc").value.trim(),
            nom_pro: tr.querySelector(".f-proveedor").value.trim(),
            project_card: tr.querySelector(".f-project").value.trim(),
            centro_costos: tr.querySelector(".f-cc").value.trim(),
            expense_category: tr.querySelector(".f-cat").value.trim(),
            detalles: tr.querySelector(".f-det").value.trim(),
            importe_soles: parseFloat(tr.querySelector(".f-sol").value) || 0,
            importe_dolares: parseFloat(tr.querySelector(".f-dol").value) || 0,
            doc_referencia_id: tr.dataset.refId ? parseInt(tr.dataset.refId) : null
        };
        
        if (!d.fecha || (!d.importe_soles && !d.importe_dolares) || !d.serie || !d.numero) {
            isValid = false;
        }
        detalle.push(d);
    });

    if (detalle.length === 0 || !isValid) {
        return Swal.fire("Alerta", "Complete las filas correctamente. Verifique fechas, series, números e importes.", "warning");
    }

    const currentUser = JSON.parse(localStorage.getItem('yelave_user') || '{}');
    const uName = currentUser.nombre || currentUser.login || "SISTEMA";
    
    const formData = new FormData();
    if (_editId) formData.append("id", _editId);
    
    formData.append("codcia", document.getElementById("selEmpresa").value);
    formData.append("fecha", document.getElementById("iptFecha").value);
    formData.append("periodo", document.getElementById("iptPeriodo").value);
    formData.append("moneda", document.getElementById("selMoneda").value);
    formData.append("codaux", selPersona);
    formData.append("nomaux", document.getElementById("iptPersonaNom").value);
    formData.append("rucdni", document.getElementById("iptPersonaDoc").value);
    formData.append("tipo_rendicion", document.getElementById("selTipoRendicion").value);
    formData.append("saldo_inicial", document.getElementById("iptSaldoInicial").value);
    formData.append("saldo_final", document.getElementById("iptSaldoFinal").value);
    formData.append("total_gastado", document.getElementById("lblTotalGas").textContent);
    formData.append("total_reembolso", document.getElementById("lblReembolso").textContent);
    formData.append("usuario", uName);
    formData.append("detalle", JSON.stringify(detalle));
    
    // Adjuntar archivos acumulativos
    archivosAdjuntos.forEach(f => {
        formData.append("archivos", f);
    });

    try {
        Swal.fire({ title: 'Registrando...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});
        const res = await axios.post(`${API_URL}/finanzas/rendiciones`, formData, { headers: { 'Content-Type': 'multipart/form-data' }});
        
        const publicUrl = `${window.location.origin}/visor_rendicion.html?uuid=${res.data.uuid_link}`;
        
        Swal.fire({
            title: "¡Éxito!",
            html: `<div style="text-align:left; padding:10px;">
                <div style="background:#f0fdf4; border:1px solid #86efac; padding:12px; border-radius:8px; margin-bottom:12px;">
                    <div style="font-weight:bold; color:#166534;">N° Rendición: ${res.data.nro_rendicion}</div>
                    <div style="font-size:0.85rem; color:#15803d; margin-top:4px;">Socio/Trabajador: ${document.getElementById("iptPersonaNom").value}</div>
                    <div style="font-size:0.85rem; color:#15803d;">DNI: ${document.getElementById("iptPersonaDoc").value}</div>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <a href="${publicUrl}" target="_blank" style="background:#2563eb; color:white; padding:8px 16px; border-radius:6px; text-decoration:none; font-weight:bold; font-size:0.85rem;">👁 Abrir Visor PDF</a>
                    <button onclick="navigator.clipboard.writeText('${publicUrl}'); this.textContent='✓ Copiado!'" style="background:#f1f5f9; border:1px solid #cbd5e1; padding:8px 16px; border-radius:6px; cursor:pointer; font-size:0.85rem;">📋 Copiar Enlace</button>
                </div>
            </div>`,
            icon: "success",
            showConfirmButton: true,
            confirmButtonText: "Cerrar"
        }).then(() => {
            window.location.reload();
        });
    } catch (e) {
        console.error(e);
        const errJson = e.response && e.response.data && e.response.data.detail ? e.response.data.detail : "Error procesando el registro.";
        Swal.fire("Error", errJson, "error");
    }
}
