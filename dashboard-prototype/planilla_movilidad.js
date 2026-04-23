const API_URL = "http://localhost:8000/api";
const LIMITE_DIARIO_RMV = 41.00; // 4% de 1025 (RMV actual)

let empresas = [];
let trabajadores = [];
let rowCount = 0;
let archivosAdjuntos = []; // Almacenar archivos múltiples


document.addEventListener("DOMContentLoaded", async () => {
    const iptFecha = document.getElementById("iptFechaEmision");
    iptFecha.valueAsDate = new Date();
    iptFecha.addEventListener("change", autoFillPeriod);
    autoFillPeriod();
    
    await cargarEmpresas();
    await cargarTrabajadores();
    
    // Check if Edit Mode
    const args = new URLSearchParams(window.location.search);
    const editId = args.get("id");
    if(editId) {
        cargarPlanillaParaEditar(editId);
    } else {
        agregarFila();
    }
});

let _editId = null;

async function cargarPlanillaParaEditar(id) {
    try {
        Swal.showLoading();
        const res = await axios.get(`${API_URL}/finanzas/planillas/${id}`);
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
            fileListViejos.innerHTML = adj.map(a => `
                <div id="adj-old-${a.Id}" style="padding:4px; font-weight:bold; display:flex; align-items:center; gap:10px;">
                    <a href="${API_URL}/finanzas/adjuntos/planilla/${a.Id}" target="_blank" style="color:#2563eb;">📎 ${a.ArchivoNombre} (Anterior)</a>
                    <button type="button" onclick="eliminarAdjuntoAntiguo('planilla', ${a.Id})" style="background:#ef4444; color:white; border:none; border-radius:3px; padding:1px 6px; cursor:pointer; font-size:0.75rem;">✕ Eliminar</button>
                </div>`).join("");
        }
        
        _editId = id;
        document.getElementById("iptNroPlanilla").value = cab.NroPlanilla;
        document.getElementById("selEmpresa").value = cab.CodCia;
        await seleccionarEmpresa();
        
        const sel = document.getElementById("selTrabajador");
        sel.value = cab.CodAux ? cab.CodAux.trim() : "";
        seleccionarTrabajador();
        
        document.getElementById("iptFechaEmision").value = cab.FechaEmision;
        document.getElementById("iptPeriodo").value = cab.Periodo;
        
        const tbody = document.getElementById("tbodyGastos");
        tbody.innerHTML = "";
        det.forEach(d => {
            const rId = ++rowCount;
            const tr = document.createElement("tr");
            tr.id = `row-${rId}`;
            tr.innerHTML = `
                <td><input type="date" class="f-fecha" value="${d.Fecha}"></td>
                <td><input type="text" class="f-motivo" placeholder="Ej: Visita Cliente" value="${d.Motivo}" style="text-transform: uppercase;" oninput="this.value = this.value.toUpperCase()"></td>
                <td><input type="text" class="f-desde" placeholder="Origen" value="${d.Desde}" style="text-transform: uppercase;" oninput="this.value = this.value.toUpperCase()"></td>
                <td><input type="text" class="f-hasta" placeholder="Destino" value="${d.Hasta}" style="text-transform: uppercase;" oninput="this.value = this.value.toUpperCase()"></td>
                <td><input type="number" step="0.01" class="f-monto" value="${d.Monto}" onkeyup="calcularTotal()" onchange="calcularTotal()"></td>
                <td style="text-align:center;">
                    <button class="btn-icon text-red" onclick="borrarFila(${rId})" title="Eliminar fila">&#10006;</button>
                </td>
            `;
            tbody.appendChild(tr);
        });
        calcularTotal();
        Swal.close();
    } catch(e) {
        console.error("Edit load error:", e);
        Swal.fire("Error interno", "Detalle: " + e.message, "error");
    }
}


function autoFillPeriod() {
    const arr = document.getElementById("iptFechaEmision").value.split("-");
    if(arr.length === 3) {
        const d = new Date(arr[0], arr[1]-1, arr[2]);
        const m = d.toLocaleString('es-ES', { month: 'long' });
        document.getElementById("iptPeriodo").value = m.charAt(0).toUpperCase() + m.slice(1) + " " + arr[0];
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
        
        const currentUser = JSON.parse(localStorage.getItem('yelave_user') || '{}');
        const defaultCodCia = currentUser.codcia || '003';
        sel.value = defaultCodCia;
        seleccionarEmpresa();
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
    // Recargar trabajadores al cambiar de empresa
    await cargarTrabajadores();
}

async function cargarTrabajadores() {
    try {
        const codcia = document.getElementById("selEmpresa").value || '003';
        const res = await axios.get(`${API_URL}/finanzas/auxiliares/003?codcia=${codcia}`);
        trabajadores = res.data;
        
        const sel = document.getElementById("selTrabajador");
        // Limpiar opciones previas excepto la primera
        sel.innerHTML = '<option value="">-- Buscar Trabajador --</option>';
        trabajadores.forEach(t => {
            const opt = document.createElement("option");
            opt.value = t.codaux ? t.codaux.trim() : '';
            const name = t.nomaux ? t.nomaux.trim() : '';
            const ruc = t.rucaux ? t.rucaux.trim() : '';
            opt.textContent = `${ruc} - ${name}`;
            sel.appendChild(opt);
        });
    } catch (e) {
        console.error("Error cargando trabajadores:", e);
        Swal.fire("Error", "No se pudieron cargar los trabajadores.", "error");
    }
}

function seleccionarTrabajador() {
    const codaux = document.getElementById("selTrabajador").value;
    const t = trabajadores.find(x => x.codaux === codaux);
    if (t) {
        document.getElementById("iptTrabajadorNom").value = t.nomaux ? t.nomaux.trim() : '';
        document.getElementById("iptTrabajadorDni").value = t.rucaux ? t.rucaux.trim() : '';
    } else {
        document.getElementById("iptTrabajadorNom").value = '';
        document.getElementById("iptTrabajadorDni").value = '';
    }
}

function agregarFila() {
    rowCount++;
    const tr = document.createElement("tr");
    tr.id = `fila-${rowCount}`;
    tr.innerHTML = `
        <td><input type="date" class="f-fecha" required></td>
        <td><input type="text" class="f-motivo text-left" placeholder="Motivo..." style="text-transform: uppercase;" oninput="this.value = this.value.toUpperCase()"></td>
        <td><input type="text" class="f-desde text-left" placeholder="De..." style="text-transform: uppercase;" oninput="this.value = this.value.toUpperCase()"></td>
        <td><input type="text" class="f-hasta text-left" placeholder="A..." style="text-transform: uppercase;" oninput="this.value = this.value.toUpperCase()"></td>
        <td style="padding:0;">
            <div style="display:flex; align-items:center;">
                <span style="padding-left:5px;">S/</span>
                <input type="number" step="0.01" class="f-monto text-right" style="width:calc(100% - 25px); padding-right:5px;" value="0.00" onchange="calcularTotal()" onkeyup="calcularTotal()">
            </div>
        </td>
        <td><button type="button" class="btn-del" onclick="eliminarFila(${rowCount})">-</button></td>
    `;
    document.getElementById("tbodyGastos").appendChild(tr);
}

function eliminarFila(id) {
    const tr = document.getElementById(`fila-${id}`);
    if (tr) {
        tr.remove();
        calcularTotal();
    }
}

function calcularTotal() {
    let total = 0;
    document.querySelectorAll(".f-monto").forEach(input => {
        const val = parseFloat(input.value) || 0;
        total += val;
    });
    document.getElementById("iptTotal").value = total.toFixed(2);
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
    // Reset el input para permitir seleccionar los mismos archivos otra vez
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

async function eliminarAdjuntoAntiguo(tipo, idAdjunto) {
    if (!confirm("¿Está seguro de eliminar este archivo adjunto permanentemente?")) return;
    try {
        Swal.showLoading();
        await axios.delete(`${API_URL}/finanzas/adjuntos/${tipo}/${idAdjunto}`);
        document.getElementById(`adj-old-${idAdjunto}`).remove();
        Swal.fire("Eliminado", "El archivo fue eliminado", "success");
    } catch(e) {
        console.error(e);
        Swal.fire("Error", "No se pudo eliminar el archivo", "error");
    }
}

// ============================================================
//  GUARDAR PLANILLA
// ============================================================
async function guardarPlanilla() {
    const selTrabajador = document.getElementById("selTrabajador").value;
    if (!selTrabajador) {
        return Swal.fire({ title: "Atención", text: "Seleccione un trabajador válido.", icon: "warning", confirmButtonColor: "#2563eb" });
    }
    
    const detalle = [];
    let isValid = true;
    const totalsPorFecha = {};

    document.querySelectorAll("#tbodyGastos tr").forEach(tr => {
        const f_fecha = tr.querySelector(".f-fecha").value;
        const f_motivo = tr.querySelector(".f-motivo").value.trim();
        const f_desde = tr.querySelector(".f-desde").value.trim();
        const f_hasta = tr.querySelector(".f-hasta").value.trim();
        const f_monto = parseFloat(tr.querySelector(".f-monto").value) || 0;

        if (!f_fecha || f_monto <= 0) {
            isValid = false;
        }

        detalle.push({ fecha: f_fecha, motivo: f_motivo, desde: f_desde, hasta: f_hasta, monto: f_monto });
        totalsPorFecha[f_fecha] = (totalsPorFecha[f_fecha] || 0) + f_monto;
    });

    if (detalle.length === 0 || !isValid) {
        return Swal.fire({ title: "Atención", text: "Complete todas las fechas y montos en el detalle.", icon: "warning", confirmButtonColor: "#2563eb" });
    }

    // Validar límite del 4% RMV
    let fechasExcedidas = [];
    for (let f in totalsPorFecha) {
        if (totalsPorFecha[f] > LIMITE_DIARIO_RMV) {
            fechasExcedidas.push(`${f} (S/ ${totalsPorFecha[f].toFixed(2)})`);
        }
    }

    if (fechasExcedidas.length > 0) {
        const msg = `<div style="text-align:left; font-size:0.9rem;">
            <p>Los siguientes días superan el <b>4% de la RMV</b> (S/ ${LIMITE_DIARIO_RMV.toFixed(2)}):</p>
            <ul style="color:#dc2626;">${fechasExcedidas.map(f => `<li>${f}</li>`).join('')}</ul>
            <p style="color:#64748b; font-size:0.8rem;">Base Legal: Inc. a1) Art. 37° TUO LIR e Inc. v) Art. 21° Reglamento.</p>
        </div>`;
        
        const res = await Swal.fire({
            title: "⚠️ Límite Diario Superado",
            html: msg,
            icon: "warning",
            showCancelButton: true,
            confirmButtonText: "Continuar de todos modos",
            cancelButtonText: "Corregir importes",
            confirmButtonColor: "#ef4444",
            cancelButtonColor: "#64748b"
        });

        if (!res.isConfirmed) return;
    }

    // Preparar formData
    const currentUser = JSON.parse(localStorage.getItem('yelave_user') || '{}');
    const uName = currentUser.login || "SISTEMA";
    
    const formData = new FormData();
    if (_editId) formData.append("id", _editId);
    
    const codcia = document.getElementById("selEmpresa").value;
    formData.append("codcia", codcia);
    formData.append("fecha_emision", document.getElementById("iptFechaEmision").value);
    formData.append("periodo", document.getElementById("iptPeriodo").value);
    formData.append("codaux", selTrabajador);
    formData.append("nomaux", document.getElementById("iptTrabajadorNom").value);
    formData.append("rucdni", document.getElementById("iptTrabajadorDni").value);
    formData.append("total_gastado", document.getElementById("iptTotal").value);
    formData.append("usuario", uName);
    formData.append("detalle", JSON.stringify(detalle));
    
    // Adjuntar TODOS los archivos acumulados
    archivosAdjuntos.forEach(f => {
        formData.append("archivos", f);
    });

    // Guardar
    try {
        Swal.fire({ title: 'Registrando planilla...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); }});
        
        const res = await axios.post(`${API_URL}/finanzas/planillas`, formData, { headers: { 'Content-Type': 'multipart/form-data' }});
        
        const publicUrl = `${window.location.origin}/visor_planilla.html?uuid=${res.data.uuid_link}`;
        
        Swal.fire({
            title: "✅ Planilla Registrada",
            html: `<div style="text-align:left; padding:10px;">
                <div style="background:#f0fdf4; border:1px solid #86efac; padding:12px; border-radius:8px; margin-bottom:12px;">
                    <div style="font-weight:bold; color:#166534;">N° Planilla: ${res.data.nro_planilla}</div>
                    <div style="font-size:0.85rem; color:#15803d; margin-top:4px;">Trabajador: ${document.getElementById("iptTrabajadorNom").value}</div>
                    <div style="font-size:0.85rem; color:#15803d;">DNI: ${document.getElementById("iptTrabajadorDni").value}</div>
                </div>
                <div style="display:flex; gap:8px; flex-wrap:wrap;">
                    <a href="${publicUrl}" target="_blank" style="background:#2563eb; color:white; padding:8px 16px; border-radius:6px; text-decoration:none; font-weight:bold; font-size:0.85rem;">👁 Abrir Visor PDF</a>
                    <button onclick="navigator.clipboard.writeText('${publicUrl}'); this.textContent='✓ Copiado!'" style="background:#f1f5f9; border:1px solid #cbd5e1; padding:8px 16px; border-radius:6px; cursor:pointer; font-size:0.85rem;">📋 Copiar Enlace</button>
                </div>
            </div>`,
            icon: "success",
            showConfirmButton: true,
            confirmButtonText: "Cerrar",
            confirmButtonColor: "#2563eb"
        }).then(() => {
            window.location.reload();
        });

    } catch (e) {
        console.error(e);
        const errMsg = e.response?.data?.detail || "No se pudo registrar la planilla.";
        Swal.fire({ title: "Error", text: errMsg, icon: "error", confirmButtonColor: "#dc2626" });
    }
}
