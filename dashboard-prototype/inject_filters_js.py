import re

with open('c:/SistemaGestionyelave/dashboard-prototype/cargos_documentales.js', 'r', encoding='utf-8') as f:
    js = f.read()

# 1. Modify switchSubTab
old_generar_log = """    if (tab === 'generar_log') {
        document.getElementById('tipoCargo').value = 'LOG_A_CONT';
        document.getElementById('filtroFechas').style.display = 'flex';
        document.getElementById('logisticaFilters').style.display = 'flex';
        document.getElementById('panelGenerar').style.display = 'block';
    } else if (tab === 'generar_cont') {
        document.getElementById('tipoCargo').value = 'CONT_A_TES';
        document.getElementById('filtroFechas').style.display = 'none';
        document.getElementById('logisticaFilters').style.display = 'none';
        document.getElementById('panelGenerar').style.display = 'block';
        loadOCsDisponibles();"""

new_generar_log = """    if (tab === 'generar_log') {
        document.getElementById('tipoCargo').value = 'LOG_A_CONT';
        document.getElementById('filtroFechas').style.display = 'flex';
        document.getElementById('logisticaFilters').style.display = 'flex';
        const cbDirectas = document.getElementById('lblDirectasContabilidad');
        if(cbDirectas) cbDirectas.style.display = 'none';
        
        document.getElementById('panelGenerar').style.display = 'block';
    } else if (tab === 'generar_cont') {
        document.getElementById('tipoCargo').value = 'CONT_A_TES';
        document.getElementById('filtroFechas').style.display = 'flex';
        document.getElementById('logisticaFilters').style.display = 'flex';
        const cbDirectas = document.getElementById('lblDirectasContabilidad');
        if(cbDirectas) cbDirectas.style.display = 'flex';
        
        document.getElementById('panelGenerar').style.display = 'block';
        loadOCsDisponibles();"""

js = js.replace(old_generar_log, new_generar_log)

# 2. Modify loadOCsDisponibles logic to send filterDirectasCont
old_load = """    const filterTipoOc = document.getElementById('filterTipoOC') ? document.getElementById('filterTipoOC').value : 'ALL';
    const filterMine = document.getElementById('filterMyRecords') ? document.getElementById('filterMyRecords').checked : true;

    Swal.fire({
        title: 'Cargando OCs...',
        text: 'Por favor espere',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    if (ocsDT) { ocsDT.destroy(); ocsDT = null; }

    try {
        const res = await axios.get(`/api/cargos/ocs-disponibles?codcia=${encodeURIComponent(codcia)}&ano=${ano}&mes=${mes}&tipo_cargo=${tipoCargo}&login=${encodeURIComponent(currentUser)}&tipo_oc=${encodeURIComponent(filterTipoOc)}&only_my_records=${filterMine}`);"""

new_load = """    const filterTipoOc = document.getElementById('filterTipoOC') ? document.getElementById('filterTipoOC').value : 'ALL';
    const filterMine = document.getElementById('filterMyRecords') ? document.getElementById('filterMyRecords').checked : true;
    const filterDirectas = document.getElementById('filterDirectasCont') ? document.getElementById('filterDirectasCont').checked : false;

    Swal.fire({
        title: 'Cargando OCs...',
        text: 'Por favor espere',
        allowOutsideClick: false,
        didOpen: () => { Swal.showLoading(); }
    });

    if (ocsDT) { ocsDT.destroy(); ocsDT = null; }

    try {
        const res = await axios.get(`/api/cargos/ocs-disponibles?codcia=${encodeURIComponent(codcia)}&ano=${ano}&mes=${mes}&tipo_cargo=${tipoCargo}&login=${encodeURIComponent(currentUser)}&tipo_oc=${encodeURIComponent(filterTipoOc)}&only_my_records=${filterMine}&ocs_directas=${filterDirectas}`);"""

js = js.replace(old_load, new_load)

with open('c:/SistemaGestionyelave/dashboard-prototype/cargos_documentales.js', 'w', encoding='utf-8') as f:
    f.write(js)

print("JS filters logic updated.")
