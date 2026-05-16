const API_URL = "/api";

axios.interceptors.request.use(config => {
    const token = localStorage.getItem('yelave_token');
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

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
    if (editId) {
        cargarRendicionParaEditar(editId);
    } else {
        agregarFilaGastos();
    }

    // Eliminar historial si existía
    const tb = document.getElementById("tbodyHistorial");
    if (tb) tb.innerHTML = "";
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
        if (fileZone) {
            let fileListViejos = document.getElementById("fileListViejos");
            if (!fileListViejos) {
                fileListViejos = document.createElement("div");
                fileListViejos.id = "fileListViejos";
                fileListViejos.style.marginTop = "10px";
                fileZone.appendChild(fileListViejos);
            }
            fileListViejos.innerHTML = adj.map(a => `
                <div id="adj-old-${a.Id}" style="padding:4px; font-weight:bold; display:flex; align-items:center; gap:10px;">
                    <a href="${API_URL}/finanzas/adjuntos/rendicion/${a.Id}" target="_blank" style="color:#2563eb;">📎 ${a.ArchivoNombre} (Anterior)</a>
                    <button type="button" onclick="eliminarAdjuntoAntiguo('rendicion', ${a.Id})" style="background:#ef4444; color:white; border:none; border-radius:3px; padding:1px 6px; cursor:pointer; font-size:0.75rem;">✕ Eliminar</button>
                </div>`).join("");
        }

        _editId = id;
        document.getElementById("iptNroRendicion").value = cab.NroRendicion;
        document.getElementById("selEmpresa").value = cab.CodCia;
        await seleccionarEmpresa();

        document.getElementById("iptFecha").value = cab.Fecha;
        document.getElementById("iptPeriodo").value = cab.Periodo;

        let mon = String(cab.Moneda || '').trim().toLowerCase();
        if (mon === '1' || mon === 'soles' || mon === 'pen' || mon === 's/') {
            document.getElementById("selMoneda").value = "1";
        } else if (mon === '2' || mon === 'dolares' || mon === 'usd' || mon === 'dólares') {
            document.getElementById("selMoneda").value = "2";
        } else {
            document.getElementById("selMoneda").value = "1";
        }

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
                <td>${rId}</td>
                <td><input type="date" class="f-fecha" value="${d.Fecha}"></td>
                <td>
                    <select class="f-tipo" onchange="tipoDocChanged(${rId})">
                        <option value="01-Factura" ${d.TipoDoc === '01-Factura' ? 'selected' : ''}>01 - Factura</option>
                        <option value="03-Boleta" ${d.TipoDoc === '03-Boleta' ? 'selected' : ''}>03 - Boleta</option>
                        <option value="12-Ticket" ${d.TipoDoc === '12-Ticket' ? 'selected' : ''}>12 - Ticket</option>
                        <option value="PGM-Planilla" ${d.TipoDoc === 'PGM-Planilla' ? 'selected' : ''}>PGM - Planilla Mov.</option>
                        <option value="Otros" ${d.TipoDoc === 'Otros' ? 'selected' : ''}>Otros</option>
                    </select>
                </td>
                <td><input type="text" class="f-serie" value="${d.Serie || ''}"></td>
                <td><input type="text" class="f-numero" value="${d.Numero || ''}"></td>
                <td><input type="text" class="f-ruc" value="${d.RucPro || ''}"></td>
                <td><input type="text" class="f-proveedor" value="${d.NomPro || ''}"></td>
                <td><input type="text" class="f-project" value="${d.ProjectCard || ''}"></td>
                <td><input type="text" class="f-cc" value="${d.CentroCostos || ''}"></td>
                <td><input type="text" class="f-cat cursor-pointer" readonly onclick="openModalCongasto(${rId})" value="${d.ExpenseCategory || ''}"></td>
                <td><input type="text" class="f-det" value="${d.Detalles || ''}"></td>
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
    } catch (e) {
        console.error("Edit load error:", e);
        Swal.fire("Error", "Detalle: " + e.message, "error");
    }
}

async function cargarEmpresas() {
    try {
        const res = await axios.get(`${API_URL}/permisos/empresas/me`);
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
    if (emp) {
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
    if (arr.length === 3) {
        const d = new Date(arr[0], arr[1] - 1, arr[2]);
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
                <option value="12-Ticket">12-Ticket</option>
                <option value="02-Recibo por Honorarios">02-Recibo por Honorarios</option>
                <option value="07-Nota de Crédito">07-Nota de Crédito</option>
                <option value="08-Nota de Débito">08-Nota de Débito</option>
                <option value="PGM-Planilla">PGM-Planilla</option>
                <option value="00-Otros">00-Otros</option>
                <option value="99-Bancos">99-Bancos</option>
            </select>
        </td>
        <td><input type="text" class="f-serie" placeholder="Ej: F001"></td>
        <td><input type="text" class="f-numero" placeholder="Ej: 1332"></td>
        <td><input type="text" class="f-ruc"></td>
        <td><input type="text" class="f-proveedor"></td>
        <td><input type="text" class="f-project" value="${window.vinculadasOCsStr || ''}"></td>
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

    document.querySelectorAll(".f-sol").forEach(ip => totSol += parseFloat(ip.value || 0));
    document.querySelectorAll(".f-dol").forEach(ip => totDol += parseFloat(ip.value || 0));

    document.getElementById("iptTotalSol").value = totSol.toFixed(2);
    document.getElementById("iptTotalUS").value = totDol.toFixed(2);

    const saldoInicial = parseFloat(document.getElementById("iptSaldoInicial").value) || 0;

    const monedaMain = document.getElementById("selMoneda").value;
    const totalGasto = monedaMain === "2" ? totDol : totSol;

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
    if (q.length < 3) return Swal.fire("Atención", "Ingrese al menos 3 caracteres", "info");

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
            let symbol = f.CodMon;
            if (symbol === '1' || symbol === 'PEN' || symbol === 'S/') symbol = 'S/';
            else if (symbol === '2' || symbol === 'USD' || symbol === '$') symbol = '$';

            const tr = document.createElement("tr");
            tr.innerHTML = `
                <td>${f.FecEmision.substring(0, 10)}</td>
                <td>${f.Serie}-${f.Numero}</td>
                <td>${f.RucPro || ''}</td>
                <td>${f.NomPro || ''}</td>
                <td>${symbol} ${parseFloat(f.Total).toLocaleString('es-PE', { minimumFractionDigits: 2 })}</td>
            `;
            tr.onclick = () => {
                llenarFilaDesdeFactura(f);
                closeModal('modalFacturas');
            };
            tb.appendChild(tr);
        });
    } catch (e) {
        Swal.fire("Error", "Error buscando factura", "error");
    }
}

function llenarFilaDesdeFactura(f) {
    const monedaMain = document.getElementById("selMoneda").value;
    const isFacturaUSD = (f.CodMon === "2" || f.CodMon === "USD" || f.CodMon === "$");

    // Validación: No mezclar monedas
    if (monedaMain === "1" && isFacturaUSD) {
        return Swal.fire("Alerta", "No es posible mezclar monedas en una misma rendición. La rendición actual es en Soles y la factura seleccionada es en Dólares.", "warning");
    }
    if (monedaMain === "2" && !isFacturaUSD) {
        return Swal.fire("Alerta", "No es posible mezclar monedas en una misma rendición. La rendición actual es en Dólares y la factura seleccionada es en Soles.", "warning");
    }

    const tr = document.getElementById(`fila-${currentRowIdxToFill}`);
    if (!tr) return;

    tr.dataset.refId = f.FacturaId;
    
    // Asignar el tipo de documento real
    let tipoStr = "01-Factura";
    if (f.TipoDoc) {
        const t = f.TipoDoc.trim();
        if (t === '01') tipoStr = "01-Factura";
        else if (t === '03') tipoStr = "03-Boleta";
        else if (t === '12') tipoStr = "12-Ticket";
        else if (t === '02' || t === '14') tipoStr = "02-Recibo por Honorarios";
        else if (t === '07') tipoStr = "07-Nota de Crédito";
        else if (t === '08') tipoStr = "08-Nota de Débito";
        else tipoStr = "00-Otros";
    }
    
    // Si la opción no existe en el select, crearla dinámicamente
    const selTipo = tr.querySelector(".f-tipo");
    if (!Array.from(selTipo.options).some(opt => opt.value === tipoStr)) {
        const newOpt = new Option(tipoStr, tipoStr);
        selTipo.add(newOpt);
    }
    selTipo.value = tipoStr;
    tr.querySelector(".f-fecha").value = f.FecEmision.substring(0, 10);
    tr.querySelector(".f-serie").value = f.Serie;
    tr.querySelector(".f-numero").value = f.Numero;
    tr.querySelector(".f-ruc").value = f.RucPro || "";
    tr.querySelector(".f-proveedor").value = f.NomPro || "";
    tr.querySelector(".f-det").value = f.Observaciones || "";

    if (isFacturaUSD) {
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
    } catch (e) {
        Swal.fire("Error", "Error buscando planillas", "error");
    }
}

function llenarFilaDesdePlanilla(p) {
    const monedaMain = document.getElementById("selMoneda").value;
    if (monedaMain === "2") {
        return Swal.fire("Alerta", "No es posible mezclar monedas en una misma rendición. La rendición actual es en Dólares y la planilla de movilidad es en Soles.", "warning");
    }

    const tr = document.getElementById(`fila-${currentRowIdxToFill}`);
    if (!tr) return;

    tr.dataset.refId = p.Id;
    tr.querySelector(".f-tipo").value = "PGM-Planilla";
    tr.querySelector(".f-fecha").value = p.FechaEmision;
    tr.querySelector(".f-serie").value = "PGM";
    tr.querySelector(".f-numero").value = p.NroPlanilla.replace('PGM-', '');
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
            if (rowTr) {
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
            <span>📄 ${f.name} (${(f.size / 1024).toFixed(1)} kb)</span>
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
    } catch (e) {
        console.error(e);
        Swal.fire("Error", "No se pudo eliminar el archivo", "error");
    }
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
    const uName = currentUser.login || "SISTEMA";

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
    formData.append("saldo_inicial", parseFloat(document.getElementById("iptSaldoInicial").value) || 0);
    formData.append("saldo_final", parseFloat(document.getElementById("iptSaldoFinal").value) || 0);
    formData.append("total_gastado", parseFloat(document.getElementById("lblTotalGas").textContent) || 0);
    formData.append("total_reembolso", parseFloat(document.getElementById("lblReembolso").textContent) || 0);
    formData.append("usuario", uName);
    formData.append("detalle", JSON.stringify(detalle));

    // Adjuntar archivos acumulativos
    archivosAdjuntos.forEach(f => {
        formData.append("archivos", f);
    });

    try {
        Swal.fire({ title: 'Registrando...', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
        const res = await axios.post(`${API_URL}/finanzas/rendiciones`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });

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
        let errJson = e.response && e.response.data && e.response.data.detail ? e.response.data.detail : "Error procesando el registro.";
        if (typeof errJson !== 'string') {
            errJson = JSON.stringify(errJson);
        }
        Swal.fire("Error", errJson, "error");
    }
}

// ============================================================
//  BÚSQUEDA DE ÓRDENES DE COMPRA
// ============================================================
let selectedOCsMap = new Map();

function openModalBusquedaOC() {
    document.getElementById("modalBusquedaOC").style.display = "flex";
    document.getElementById("qBuscarOC").value = "";
    document.getElementById("tbModalOC").innerHTML = "";
    selectedOCsMap.clear();
    actualizarUiSeleccionOC();
}

async function buscarOC() {
    const q = document.getElementById("qBuscarOC").value;
    const codcia = document.getElementById('selEmpresa').value || '003';
    try {
        Swal.showLoading();
        const res = await axios.get(`${API_URL}/logistics/orders?codcia=${codcia}&search=${encodeURIComponent(q)}&only_my_records=false`);
        Swal.close();
        
        const tb = document.getElementById("tbModalOC");
        tb.innerHTML = "";
        
        if (res.data.length === 0) {
            tb.innerHTML = "<tr><td colspan='6' class='text-center'>No se encontraron coincidencias</td></tr>";
            return;
        }
        
        res.data.forEach(oc => {
            const tr = document.createElement("tr");
            const isSelected = selectedOCsMap.has(oc.nrodoc);
            
            let symbol = String(oc.moneda);
            if (symbol === '1' || symbol === 'PEN' || symbol === 'S/') symbol = 'S/';
            if (symbol === '2' || symbol === 'USD' || symbol === '$') symbol = '$';
            
            const monto = parseFloat(oc.total || 0);

            tr.style.cursor = "pointer";
            if(isSelected) tr.style.background = "#e0e7ff";

            tr.innerHTML = `
                <td style="text-align:center;">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} style="pointer-events:none;">
                </td>
                <td>${oc.tipooc || ''}</td>
                <td>${oc.nrodoc}</td>
                <td>${oc.proveedor || ''}</td>
                <td>${symbol}</td>
                <td style="text-align:right;">${monto.toLocaleString('es-PE', {minimumFractionDigits: 2})}</td>
            `;
            
            tr.onclick = () => {
                if (selectedOCsMap.has(oc.nrodoc)) {
                    selectedOCsMap.delete(oc.nrodoc);
                    tr.style.background = "";
                    tr.querySelector("input").checked = false;
                } else {
                    if (selectedOCsMap.size > 0) {
                        const firstOC = Array.from(selectedOCsMap.values())[0];
                        if (String(firstOC.moneda) !== String(oc.moneda)) {
                            Swal.fire("Alerta", "No puede mezclar OCs de diferentes monedas", "warning");
                            return;
                        }
                    }
                    selectedOCsMap.set(oc.nrodoc, oc);
                    tr.style.background = "#e0e7ff";
                    tr.querySelector("input").checked = true;
                }
                actualizarUiSeleccionOC();
            };
            tb.appendChild(tr);
        });
    } catch(e) {
        Swal.fire("Error", "Error buscando órdenes", "error");
    }
}

function actualizarUiSeleccionOC() {
    let total = 0;
    let moneda = "-";
    const lista = document.getElementById("listaOCsSeleccionadas");
    lista.innerHTML = "";
    
    if (selectedOCsMap.size > 0) {
        selectedOCsMap.forEach(oc => {
            let symbol = String(oc.moneda);
            if (symbol === '1' || symbol === 'PEN' || symbol === 'S/') symbol = 'S/';
            if (symbol === '2' || symbol === 'USD' || symbol === '$') symbol = '$';
            moneda = symbol;
            
            const monto = parseFloat(oc.total || 0);
            total += monto;
            
            lista.innerHTML += `<span style="background:#3b82f6; color:white; padding:2px 6px; border-radius:4px; font-size:0.7rem;">${oc.tipooc||''}${oc.nrodoc}</span>`;
        });
    }
    
    document.getElementById("lblMonedaSeleccionada").textContent = moneda;
    document.getElementById("lblTotalAcumuladoOC").textContent = total.toLocaleString('es-PE', {minimumFractionDigits: 2});
}

function aplicarOCsVinculadas() {
    if (selectedOCsMap.size === 0) {
        Swal.fire("Atención", "No ha seleccionado ninguna OC.", "info");
        return;
    }
    
    let total = 0;
    let monedaCode = "1";
    let nros = [];
    
    selectedOCsMap.forEach(oc => {
        total += parseFloat(oc.total || 0);
        let sym = String(oc.moneda);
        monedaCode = (sym === '2' || sym === 'USD' || sym === '$') ? "2" : "1";
        nros.push(`${(oc.tipooc||'').trim()}${oc.nrodoc.trim()}`);
    });
    
    document.getElementById("selMoneda").value = monedaCode;
    document.getElementById("iptSaldoInicial").value = total.toFixed(2);
    
    window.vinculadasOCsStr = nros.join(", ");
    
    document.getElementById("ocVinculadasContainer").style.display = "block";
    document.getElementById("lblOcVinculadas").textContent = window.vinculadasOCsStr;
    
    // Auto-fill existing rows that have empty project
    document.querySelectorAll(".f-project").forEach(ipt => {
        if (!ipt.value.trim()) ipt.value = window.vinculadasOCsStr;
    });
    
    calcularResumen();
    closeModal('modalBusquedaOC');
}
