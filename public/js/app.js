/**
 * public/js/app.js
 * Lógica principal del prototipo web Misión Nevado.
 * Controla el renderizado de gráficos/tablas, envío de formularios y comunicación API.
 */

document.addEventListener('DOMContentLoaded', () => {
    // Inicializar vistas y eventos
    initApp();
});

function initApp() {
    loadDashboardStats();
    loadPatientsDropdowns();
    loadRecentPatientsTable();
    loadConsultasTable();
    loadVacunasTable();
    loadEsterilizacionesTable();
    loadCitasCviTable();

    // Callback global al sincronizar exitosamente
    window.onSyncSuccess = () => {
        loadDashboardStats();
        loadRecentPatientsTable();
        loadConsultasTable();
        loadVacunasTable();
        loadEsterilizacionesTable();
        loadCitasCviTable();
        loadPatientsDropdowns();
    };
}

/**
 * Carga métricas y gráficos estadísticos de impacto de rescates
 */
async function loadDashboardStats() {
    try {
        const response = await fetch('/api/stats');
        if (!response.ok) throw new Error('Modo offline o error en API stats');
        
        const data = await response.json();
        renderStatsCards(data.totales);
        renderRescuesChart(data.rescates_historico, data.mes_actual);
    } catch (error) {
        console.warn('⚠️ No se pudo conectar con la API de estadísticas. Usando métricas locales.', error);
        renderFallbackStats();
    }
}

function renderStatsCards(totales) {
    const offlinePending = NevadoOffline.getPendingCount();
    
    setElementText('stat-rescatados-mes', totales.rescatados_mes_actual || 0);
    setElementText('stat-total-pacientes', totales.total_pacientes || 0);
    setElementText('stat-total-consultas', totales.total_consultas || 0);
    setElementText('stat-total-vacunas', totales.total_vacunas || 0);
    setElementText('stat-total-esterilizados', totales.total_esterilizados || 0);
    setElementText('stat-total-cvi', totales.total_citas_cvi || 0);
    setElementText('stat-pendientes-sync', (totales.pendientes_sincronizar || 0) + offlinePending);
}

function renderFallbackStats() {
    const queue = NevadoOffline.getQueue();
    const localPatients = NevadoOffline.getLocalPatientsList();
    
    setElementText('stat-rescatados-mes', localPatients.filter(a => a.condicion === 'Rescatado').length || 0);
    setElementText('stat-total-pacientes', localPatients.length || 0);
    setElementText('stat-total-consultas', queue.consultas?.length || 0);
    setElementText('stat-total-vacunas', queue.vacunas?.length || 0);
    setElementText('stat-total-esterilizados', queue.esterilizaciones?.filter(e => e.estado === 'Operado').length || 0);
    setElementText('stat-total-cvi', queue.citas_cvi?.length || 0);
    setElementText('stat-pendientes-sync', NevadoOffline.getPendingCount());
}

/**
 * Renderiza el gráfico/barras de rescates mensuales comparativos
 */
function renderRescuesChart(historico = [], mesActualStr) {
    const container = document.getElementById('rescue-history-bars');
    if (!container) return;

    if (!historico || historico.length === 0) {
        container.innerHTML = `<p class="text-sm text-slate-500 italic py-4">No hay historial disponible para mostrar gráfico.</p>`;
        return;
    }

    // Calcular máximo para escala visual
    const maxVal = Math.max(...historico.map(h => h.total_rescatados), 1);

    container.innerHTML = historico.map(item => {
        const pct = Math.round((item.total_rescatados / maxVal) * 100);
        const esMesActual = item.mes_rescate === mesActualStr;
        const badgeTag = esMesActual ? '<span class="bg-emerald-600 text-white text-xs px-2 py-0.5 rounded font-bold ml-2">Mes Actual</span>' : '';
        
        return `
            <div class="mb-3">
                <div class="flex justify-between items-center text-sm mb-1 font-medium text-slate-700 dark:text-slate-200">
                    <span class="flex items-center">${formatMes(item.mes_rescate)} ${badgeTag}</span>
                    <span class="font-bold text-teal-700 dark:text-teal-400">${item.total_rescatados} Rescatados</span>
                </div>
                <div class="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-3.5 overflow-hidden">
                    <div class="${esMesActual ? 'bg-gradient-to-r from-teal-500 to-emerald-500' : 'bg-slate-400 dark:bg-slate-500'} h-3.5 rounded-full transition-all duration-500" style="width: ${pct}%"></div>
                </div>
            </div>
        `;
    }).join('');
}

// ----------------------------------------------------
// SISTEMA ACCESIBLE DE CONFIRMACIÓN Y ELIMINACIÓN
// ----------------------------------------------------

let pendingDeleteData = null;

function ensureDeleteModalExists() {
    if (document.getElementById('delete-modal')) return;

    const modalHtml = `
    <div id="delete-modal" class="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 hidden flex items-center justify-center p-4">
        <div class="bg-white dark:bg-slate-800 rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl border border-slate-200 dark:border-slate-700 text-center space-y-5 transform transition-all">
            <div class="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto text-red-600 text-3xl font-black">
                🗑️
            </div>
            <div>
                <h3 class="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">¿Eliminar este registro?</h3>
                <p id="delete-modal-text" class="text-base text-slate-600 dark:text-slate-300 mt-2 font-medium">
                    Esta acción eliminará el registro seleccionado.
                </p>
            </div>
            <div class="flex gap-3 pt-2">
                <button type="button" onclick="closeDeleteModal()" class="flex-1 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 font-bold py-3.5 px-4 rounded-xl text-base transition">
                    Cancelar
                </button>
                <button type="button" onclick="executeDelete()" class="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3.5 px-4 rounded-xl text-base shadow-lg transition transform active:scale-95 flex items-center justify-center gap-2">
                    ✓ Eliminar
                </button>
            </div>
        </div>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', modalHtml);
}

function confirmDelete(entityType, id, name) {
    ensureDeleteModalExists();
    pendingDeleteData = { entityType, id, name };
    const textElem = document.getElementById('delete-modal-text');
    if (textElem) {
        textElem.textContent = `¿Estás seguro de que deseas eliminar permanentemente el registro de "${name || 'este elemento'}"?`;
    }
    const modal = document.getElementById('delete-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeDeleteModal() {
    pendingDeleteData = null;
    const modal = document.getElementById('delete-modal');
    if (modal) modal.classList.add('hidden');
}

async function executeDelete() {
    if (!pendingDeleteData) return;
    const { entityType, id, name } = pendingDeleteData;
    closeDeleteModal();

    const typeMap = {
        'animales': 'animales',
        'consultas': 'consultas',
        'vacunas': 'vacunas',
        'esterilizaciones': 'esterilizaciones',
        'citas-cvi': 'citas_cvi'
    };

    // 1. Eliminar de la persisatencia local (cola de sincronización y caché)
    if (entityType === 'animales') {
        NevadoOffline.deleteAnimalLocal(id);
    } else {
        NevadoOffline.deleteRecordLocal(typeMap[entityType] || entityType, id);
    }

    // 2. Si hay conexión online, intentar eliminar del servidor central (SQLite)
    if (navigator.onLine) {
        try {
            await fetch(`/api/${entityType}/${id}`, { method: 'DELETE' });
        } catch (e) {
            console.warn('Eliminado localmente pero hubo error de servidor:', e);
        }
    }

    alert(`🗑️ El registro "${name || 'seleccionado'}" ha sido eliminado exitosamente.`);
    initApp();
}

/**
 * Carga la tabla de pacientes recientes
 */
async function loadRecentPatientsTable() {
    const tbody = document.getElementById('recent-patients-tbody');
    if (!tbody) return;

    let pacientes = [];
    try {
        const response = await fetch('/api/animales');
        if (response.ok) {
            pacientes = await response.json();
        }
    } catch (e) {
        console.warn('Cargando pacientes desde caché local...');
    }

    const localQueueAnim = NevadoOffline.getQueue().animales || [];
    const todos = [...localQueueAnim, ...pacientes];

    // Evitar duplicados por ID
    const mapa = new Map();
    todos.forEach(p => { if (p.id && !mapa.has(p.id)) mapa.set(p.id, p); });
    const listaUnica = Array.from(mapa.values());

    if (listaUnica.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-base text-slate-500 font-medium">No hay pacientes registrados aún.</td></tr>`;
        return;
    }

    tbody.innerHTML = listaUnica.slice(0, 15).map(p => `
        <tr class="border-b border-slate-200 dark:border-slate-700 hover:bg-teal-50/50 dark:hover:bg-slate-800/60 transition text-base">
            <td class="py-4 px-4 font-mono font-bold text-teal-700 dark:text-teal-400">${p.codigo || 'NEV-OFF'}</td>
            <td class="py-4 px-4 font-bold text-slate-900 dark:text-slate-100">${escapeHtml(p.nombre)}</td>
            <td class="py-4 px-4 text-slate-700 dark:text-slate-300">
                <span class="inline-flex items-center px-3 py-1 rounded-lg text-sm font-semibold bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                    ${p.especie === 'Perro' ? '🐶' : (p.especie === 'Gato' ? '🐱' : '🐾')} ${p.especie} (${p.sexo})
                </span>
            </td>
            <td class="py-4 px-4">
                <span class="${p.condicion === 'Rescatado' ? 'bg-amber-100 text-amber-900 font-bold dark:bg-amber-900/50 dark:text-amber-200' : 'bg-blue-100 text-blue-900 font-bold dark:bg-blue-900/50 dark:text-blue-200'} text-sm px-3 py-1 rounded-full">
                    ${p.condicion}
                </span>
            </td>
            <td class="py-4 px-4 text-slate-700 dark:text-slate-300 font-medium">${escapeHtml(p.tutor_nombre || 'Misión Nevado')}</td>
            <td class="py-4 px-4 text-center">
                ${p.sincronizado === 1 
                    ? '<span class="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 text-sm px-3 py-1 rounded-full font-bold">✓ Servidor</span>' 
                    : '<span class="bg-amber-500 text-white text-sm px-3 py-1 rounded-full font-bold animate-pulse">⏳ Local</span>'}
            </td>
            <td class="py-4 px-4 text-center">
                <button type="button" onclick="confirmDelete('animales', '${p.id}', '${escapeHtml(p.nombre)}')" 
                        class="bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-bold px-3 py-1.5 rounded-lg text-sm transition transform active:scale-95 flex items-center justify-center gap-1 mx-auto shadow-sm">
                    🗑️ Eliminar
                </button>
            </td>
        </tr>
    `).join('');
}

/**
 * Carga dropdowns de selección de pacientes en todos los formularios
 */
async function loadPatientsDropdowns() {
    const dropdowns = document.querySelectorAll('.select-patient-dropdown');
    if (dropdowns.length === 0) return;

    let pacientes = [];
    try {
        const response = await fetch('/api/animales');
        if (response.ok) {
            pacientes = await response.json();
        }
    } catch (e) {}

    const localQueueAnim = NevadoOffline.getQueue().animales || [];
    const localSaved = NevadoOffline.getLocalPatientsList();
    
    const mapa = new Map();
    [...localQueueAnim, ...localSaved, ...pacientes].forEach(p => {
        if (p.id && !mapa.has(p.id)) mapa.set(p.id, p);
    });

    const listaUnica = Array.from(mapa.values());

    dropdowns.forEach(select => {
        const selectedVal = select.value;
        select.innerHTML = '<option value="">-- Seleccionar Paciente Registrado --</option>' +
            listaUnica.map(p => `
                <option value="${p.id}">${p.codigo || 'OFF'} - ${escapeHtml(p.nombre)} (${p.especie} - ${p.condicion})</option>
            `).join('');
        if (selectedVal) select.value = selectedVal;
    });
}

/**
 * Carga tabla de Consultas y Triajes
 */
async function loadConsultasTable() {
    const tbody = document.getElementById('consultas-tbody');
    if (!tbody) return;

    let consultas = [];
    try {
        const res = await fetch('/api/consultas');
        if (res.ok) consultas = await res.json();
    } catch(e) {}

    const local = NevadoOffline.getQueue().consultas || [];
    const todas = [...local, ...consultas];

    const mapa = new Map();
    todas.forEach(c => { if (c.id && !mapa.has(c.id)) mapa.set(c.id, c); });
    const listaUnica = Array.from(mapa.values());

    if (listaUnica.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-base text-slate-500 font-medium">No hay consultas ni triajes registrados.</td></tr>`;
        return;
    }

    tbody.innerHTML = listaUnica.map(c => `
        <tr class="border-b border-slate-200 dark:border-slate-700 text-base">
            <td class="py-4 px-4 font-bold text-slate-900 dark:text-slate-100">${escapeHtml(c.animal_nombre || 'Paciente')}</td>
            <td class="py-4 px-4"><span class="bg-purple-100 text-purple-900 dark:bg-purple-900/40 dark:text-purple-300 text-sm px-3 py-1 rounded-lg font-bold">${c.tipo_atencion}</span></td>
            <td class="py-4 px-4 text-sm font-medium">${c.peso_kg ? c.peso_kg + ' kg' : 'N/E'} / ${c.temperatura ? c.temperatura + ' °C' : 'N/E'}</td>
            <td class="py-4 px-4 text-sm text-slate-700 dark:text-slate-300 font-medium">${escapeHtml(c.diagnostico || c.sintomas || 'En evaluación')}</td>
            <td class="py-4 px-4 text-sm font-bold text-slate-800 dark:text-slate-200">${escapeHtml(c.veterinario || 'Dr. Misión Nevado')}</td>
            <td class="py-4 px-4 text-center">
                ${c.sincronizado === 1 ? '<span class="text-emerald-600 font-bold text-sm">✓ Nube</span>' : '<span class="text-amber-500 font-bold text-sm">⏳ Local</span>'}
            </td>
            <td class="py-4 px-4 text-center">
                <button type="button" onclick="confirmDelete('consultas', '${c.id}', 'Consulta de ${escapeHtml(c.animal_nombre || 'Paciente')}')" 
                        class="bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-bold px-3 py-1.5 rounded-lg text-sm transition flex items-center justify-center gap-1 mx-auto">
                    🗑️ Eliminar
                </button>
            </td>
        </tr>
    `).join('');
}

/**
 * Carga tabla de Vacunas y Tratamientos
 */
async function loadVacunasTable() {
    const tbody = document.getElementById('vacunas-tbody');
    if (!tbody) return;

    let vacunas = [];
    try {
        const res = await fetch('/api/vacunas');
        if (res.ok) vacunas = await res.json();
    } catch(e) {}

    const local = NevadoOffline.getQueue().vacunas || [];
    const todas = [...local, ...vacunas];

    const mapa = new Map();
    todas.forEach(v => { if (v.id && !mapa.has(v.id)) mapa.set(v.id, v); });
    const listaUnica = Array.from(mapa.values());

    if (listaUnica.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-base text-slate-500 font-medium">No hay vacunas ni dosis aplicadas.</td></tr>`;
        return;
    }

    tbody.innerHTML = listaUnica.map(v => `
        <tr class="border-b border-slate-200 dark:border-slate-700 text-base">
            <td class="py-4 px-4 font-bold text-slate-900 dark:text-slate-100">${escapeHtml(v.animal_nombre || 'Paciente')}</td>
            <td class="py-4 px-4"><span class="bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-300 text-sm px-3 py-1 rounded-lg font-bold">${v.tipo_servicio}</span></td>
            <td class="py-4 px-4 font-bold text-teal-700 dark:text-teal-400 text-sm">${escapeHtml(v.producto)}</td>
            <td class="py-4 px-4 text-sm font-medium">${escapeHtml(v.dosis || 'Dosis Estándar')}</td>
            <td class="py-4 px-4 text-center">
                ${v.sincronizado === 1 ? '<span class="text-emerald-600 font-bold text-sm">✓ Nube</span>' : '<span class="text-amber-500 font-bold text-sm">⏳ Local</span>'}
            </td>
            <td class="py-4 px-4 text-center">
                <button type="button" onclick="confirmDelete('vacunas', '${v.id}', '${escapeHtml(v.producto)} para ${escapeHtml(v.animal_nombre || 'Paciente')}')" 
                        class="bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-bold px-3 py-1.5 rounded-lg text-sm transition flex items-center justify-center gap-1 mx-auto">
                    🗑️ Eliminar
                </button>
            </td>
        </tr>
    `).join('');
}

/**
 * Carga tabla de Esterilizaciones
 */
async function loadEsterilizacionesTable() {
    const tbody = document.getElementById('esterilizaciones-tbody');
    if (!tbody) return;

    let esterilizaciones = [];
    try {
        const res = await fetch('/api/esterilizaciones');
        if (res.ok) esterilizaciones = await res.json();
    } catch(e) {}

    const local = NevadoOffline.getQueue().esterilizaciones || [];
    const todas = [...local, ...esterilizaciones];

    const mapa = new Map();
    todas.forEach(e => { if (e.id && !mapa.has(e.id)) mapa.set(e.id, e); });
    const listaUnica = Array.from(mapa.values());

    if (listaUnica.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="text-center py-8 text-base text-slate-500 font-medium">No hay censos ni cirugías programadas.</td></tr>`;
        return;
    }

    tbody.innerHTML = listaUnica.map(e => `
        <tr class="border-b border-slate-200 dark:border-slate-700 text-base">
            <td class="py-4 px-4 font-bold text-slate-900 dark:text-slate-100">${escapeHtml(e.animal_nombre || 'Paciente')}</td>
            <td class="py-4 px-4 text-sm font-semibold">${e.tipo_procedimiento}</td>
            <td class="py-4 px-4 text-sm font-medium">${e.fecha_programada || 'Por definir'}</td>
            <td class="py-4 px-4">
                <span class="${e.estado === 'Operado' ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-300' : (e.estado === 'Programado' ? 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300')} text-sm px-3 py-1 rounded-full font-bold">
                    ${e.estado}
                </span>
            </td>
            <td class="py-4 px-4 text-center">
                ${e.sincronizado === 1 ? '<span class="text-emerald-600 font-bold text-sm">✓ Nube</span>' : '<span class="text-amber-500 font-bold text-sm">⏳ Local</span>'}
            </td>
            <td class="py-4 px-4 text-center">
                <button type="button" onclick="confirmDelete('esterilizaciones', '${e.id}', 'Esterilización de ${escapeHtml(e.animal_nombre || 'Paciente')}')" 
                        class="bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-bold px-3 py-1.5 rounded-lg text-sm transition flex items-center justify-center gap-1 mx-auto">
                    🗑️ Eliminar
                </button>
            </td>
        </tr>
    `).join('');
}

/**
 * Carga tabla de Citas CVI
 */
async function loadCitasCviTable() {
    const tbody = document.getElementById('citas-cvi-tbody');
    if (!tbody) return;

    let citas = [];
    try {
        const res = await fetch('/api/citas-cvi');
        if (res.ok) citas = await res.json();
    } catch(e) {}

    const local = NevadoOffline.getQueue().citas_cvi || [];
    const todas = [...local, ...citas];

    const mapa = new Map();
    todas.forEach(c => { if (c.id && !mapa.has(c.id)) mapa.set(c.id, c); });
    const listaUnica = Array.from(mapa.values());

    if (listaUnica.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-8 text-base text-slate-500 font-medium">No hay derivaciones a CVI agendadas.</td></tr>`;
        return;
    }

    tbody.innerHTML = listaUnica.map(c => `
        <tr class="border-b border-slate-200 dark:border-slate-700 text-base">
            <td class="py-4 px-4 font-bold text-slate-900 dark:text-slate-100">${escapeHtml(c.animal_nombre || 'Paciente')}</td>
            <td class="py-4 px-4 text-sm font-bold text-teal-700 dark:text-teal-300">${escapeHtml(c.cvi_destino)}</td>
            <td class="py-4 px-4 text-sm font-medium">${escapeHtml(c.motivo_derivacion)}</td>
            <td class="py-4 px-4 text-sm font-mono font-semibold">${c.fecha_cita}</td>
            <td class="py-4 px-4">
                <span class="${c.prioridad === 'Urgente' ? 'bg-red-100 text-red-900 font-bold' : 'bg-slate-100 text-slate-800'} text-sm px-3 py-1 rounded-lg">
                    ${c.prioridad}
                </span>
            </td>
            <td class="py-4 px-4 text-center">
                ${c.sincronizado === 1 ? '<span class="text-emerald-600 font-bold text-sm">✓ Nube</span>' : '<span class="text-amber-500 font-bold text-sm">⏳ Local</span>'}
            </td>
            <td class="py-4 px-4 text-center">
                <button type="button" onclick="confirmDelete('citas-cvi', '${c.id}', 'Cita CVI de ${escapeHtml(c.animal_nombre || 'Paciente')}')" 
                        class="bg-red-100 hover:bg-red-200 text-red-700 dark:bg-red-900/40 dark:text-red-300 font-bold px-3 py-1.5 rounded-lg text-sm transition flex items-center justify-center gap-1 mx-auto">
                    🗑️ Eliminar
                </button>
            </td>
        </tr>
    `).join('');
}

// ----------------------------------------------------
// MANEJADORES DE FORMULARIOS (CON SOPORTE OFFLINE RESILIENTE)
// ----------------------------------------------------

async function submitPatientForm(event) {
    event.preventDefault();
    const form = event.target;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    if (!data.nombre || !data.especie || !data.condicion) {
        alert('⚠️ Por favor completa los campos obligatorios: Nombre, Especie y Condición.');
        return;
    }

    let result;
    if (navigator.onLine) {
        try {
            const res = await fetch('/api/animales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (res.ok) {
                result = await res.json();
                alert(`✅ Paciente "${data.nombre}" registrado exitosamente en el servidor central (${result.codigo}).`);
            } else {
                throw new Error('Servidor retornó error');
            }
        } catch (e) {
            console.warn('Fallo de red, guardando localmente...', e);
            result = NevadoOffline.saveAnimalLocal(data);
            alert(`📶 Sin conexión directa. Paciente "${data.nombre}" guardado LOCALMENTE en la plaza (${result.codigo}). Se sincronizará al conectar.`);
        }
    } else {
        result = NevadoOffline.saveAnimalLocal(data);
        alert(`📶 Modo Offline Activo: Paciente "${data.nombre}" guardado LOCALMENTE (${result.codigo}).`);
    }

    form.reset();
    initApp();
}

async function submitConsultaForm(event) {
    event.preventDefault();
    const form = event.target;
    const data = Object.fromEntries(new FormData(form).entries());

    if (!data.animal_id || !data.tipo_atencion) {
        alert('⚠️ Selecciona un paciente y el tipo de atención.');
        return;
    }

    if (navigator.onLine) {
        try {
            const res = await fetch('/api/consultas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (res.ok) {
                alert('✅ Consulta médica registrada correctamente.');
            } else {
                throw new Error('Error al registrar consulta');
            }
        } catch(e) {
            NevadoOffline.saveRecordLocal('consultas', data);
            alert('📶 Consulta guardada LOCALMENTE en este dispositivo (Modo Offline).');
        }
    } else {
        NevadoOffline.saveRecordLocal('consultas', data);
        alert('📶 Consulta guardada LOCALMENTE (Modo Offline).');
    }

    form.reset();
    initApp();
}

async function submitVacunaForm(event) {
    event.preventDefault();
    const form = event.target;
    const data = Object.fromEntries(new FormData(form).entries());

    if (!data.animal_id || !data.producto) {
        alert('⚠️ Selecciona un paciente y el producto/vacuna aplicada.');
        return;
    }

    if (navigator.onLine) {
        try {
            const res = await fetch('/api/vacunas', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (res.ok) {
                alert('✅ Vacunación/Tratamiento registrado correctamente.');
            } else throw new Error();
        } catch (e) {
            NevadoOffline.saveRecordLocal('vacunas', data);
            alert('📶 Dosis guardada LOCALMENTE en la plaza (Modo Offline).');
        }
    } else {
        NevadoOffline.saveRecordLocal('vacunas', data);
        alert('📶 Dosis guardada LOCALMENTE (Modo Offline).');
    }

    form.reset();
    initApp();
}

async function submitEsterilizacionForm(event) {
    event.preventDefault();
    const form = event.target;
    const data = Object.fromEntries(new FormData(form).entries());

    if (!data.animal_id || !data.tipo_procedimiento) {
        alert('⚠️ Selecciona un paciente y el tipo de cirugía.');
        return;
    }

    if (navigator.onLine) {
        try {
            const res = await fetch('/api/esterilizaciones', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (res.ok) alert('✅ Censo de esterilización registrado.');
            else throw new Error();
        } catch(e) {
            NevadoOffline.saveRecordLocal('esterilizaciones', data);
            alert('📶 Registro de esterilización guardado LOCALMENTE (Modo Offline).');
        }
    } else {
        NevadoOffline.saveRecordLocal('esterilizaciones', data);
        alert('📶 Registro de esterilización guardado LOCALMENTE (Modo Offline).');
    }

    form.reset();
    initApp();
}

async function submitCitaCviForm(event) {
    event.preventDefault();
    const form = event.target;
    const data = Object.fromEntries(new FormData(form).entries());

    if (!data.animal_id || !data.cvi_destino || !data.fecha_cita) {
        alert('⚠️ Por favor completa el paciente, CVI de destino y fecha.');
        return;
    }

    if (navigator.onLine) {
        try {
            const res = await fetch('/api/citas-cvi', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });
            if (res.ok) alert('✅ Derivación a CVI agendada exitosamente.');
            else throw new Error();
        } catch(e) {
            NevadoOffline.saveRecordLocal('citas_cvi', data);
            alert('📶 Cita CVI guardada LOCALMENTE (Modo Offline).');
        }
    } else {
        NevadoOffline.saveRecordLocal('citas_cvi', data);
        alert('📶 Cita CVI guardada LOCALMENTE (Modo Offline).');
    }

    form.reset();
    initApp();
}

// ----------------------------------------------------
// FUNCIONES AUXILIARES DE UI
// ----------------------------------------------------

function setElementText(id, text) {
    const elem = document.getElementById(id);
    if (elem) elem.textContent = text;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function formatMes(yyyyMm) {
    if (!yyyyMm) return '';
    const partes = yyyyMm.split('-');
    if (partes.length < 2) return yyyyMm;
    const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const index = parseInt(partes[1], 10) - 1;
    return `${meses[index] || partes[1]} ${partes[0]}`;
}

// Cambiar pestañas dinámicas en la vista de registro
function switchTab(tabId) {
    const tabs = document.querySelectorAll('.tab-content');
    const buttons = document.querySelectorAll('.tab-btn');

    tabs.forEach(t => t.classList.add('hidden'));
    buttons.forEach(b => {
        b.classList.remove('border-teal-600', 'text-teal-600', 'font-bold', 'bg-teal-50', 'dark:bg-teal-900/30');
        b.classList.add('border-transparent', 'text-slate-600', 'dark:text-slate-400');
    });

    const activeTab = document.getElementById(`tab-${tabId}`);
    const activeBtn = document.getElementById(`btn-tab-${tabId}`);

    if (activeTab) activeTab.classList.remove('hidden');
    if (activeBtn) {
        activeBtn.classList.remove('border-transparent', 'text-slate-600', 'dark:text-slate-400');
        activeBtn.classList.add('border-teal-600', 'text-teal-600', 'font-bold', 'bg-teal-50', 'dark:bg-teal-900/30');
    }
}

