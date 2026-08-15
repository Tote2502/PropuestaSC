/**
 * public/js/offline.js
 * Módulo de almacenamiento y sincronización Offline-First para la Fundación Misión Nevado.
 * Permite guardar consultas, vacunas, esterilizaciones y citas sin conexión a internet
 * y enviarlas en lote (batch) al servidor central cuando la conexión retorna.
 */

const NevadoOffline = (() => {
    const STORAGE_KEY = 'nevado_offline_queue_v1';
    const LOCAL_PATIENTS_KEY = 'nevado_local_patients_v1';

    // Obtener la cola de almacenamiento local
    const getQueue = () => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            return raw ? JSON.parse(raw) : { animales: [], consultas: [], vacunas: [], esterilizaciones: [], citas_cvi: [] };
        } catch (e) {
            console.error('Error leyendo LocalStorage:', e);
            return { animales: [], consultas: [], vacunas: [], esterilizaciones: [], citas_cvi: [] };
        }
    };

    // Guardar la cola en LocalStorage
    const saveQueue = (queue) => {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
            updateSyncUI();
        } catch (e) {
            console.error('Error guardando en LocalStorage:', e);
        }
    };

    // Obtener número total de ítems no sincronizados (sincronizado = 0)
    const getPendingCount = () => {
        const q = getQueue();
        return (q.animales?.length || 0) + 
               (q.consultas?.length || 0) + 
               (q.vacunas?.length || 0) + 
               (q.esterilizaciones?.length || 0) + 
               (q.citas_cvi?.length || 0);
    };

    // Guardar un paciente localmente
    const saveAnimalLocal = (animal) => {
        const q = getQueue();
        animal.sincronizado = 0;
        if (!animal.id) animal.id = 'anim-off-' + Date.now() + '-' + Math.floor(Math.random() * 100);
        if (!animal.codigo) animal.codigo = 'NEV-OFF-' + Math.floor(100 + Math.random() * 900);
        
        q.animales.push(animal);
        saveQueue(q);

        // Guardar en índice local de pacientes para autocompletar en los otros formularios
        try {
            const localP = JSON.parse(localStorage.getItem(LOCAL_PATIENTS_KEY) || '[]');
            localP.unshift(animal);
            localStorage.setItem(LOCAL_PATIENTS_KEY, JSON.stringify(localP));
        } catch(e) {}

        return animal;
    };

    // Guardar registro de cualquier otro módulo localmente
    const saveRecordLocal = (type, record) => {
        const q = getQueue();
        record.sincronizado = 0;
        if (!record.id) record.id = `${type.substring(0,3)}-off-${Date.now()}-${Math.floor(Math.random() * 100)}`;
        
        if (!q[type]) q[type] = [];
        q[type].push(record);
        saveQueue(q);
        return record;
    };

    // Obtener todos los pacientes (Servidor + Cola Local)
    const getLocalPatientsList = () => {
        try {
            return JSON.parse(localStorage.getItem(LOCAL_PATIENTS_KEY) || '[]');
        } catch (e) {
            return [];
        }
    };

    // Actualizar indicador visual de conexión y pendientes en el DOM
    const updateSyncUI = () => {
        const count = getPendingCount();
        const badgeElem = document.getElementById('offline-badge-count');
        const statusElem = document.getElementById('network-status-text');
        const dotElem = document.getElementById('network-status-dot');

        if (badgeElem) {
            badgeElem.textContent = count;
            badgeElem.className = count > 0 
                ? 'bg-amber-500 text-white font-bold px-2 py-0.5 rounded-full text-xs animate-pulse ml-2'
                : 'bg-emerald-600 text-white font-bold px-2 py-0.5 rounded-full text-xs ml-2';
        }

        const isOnline = navigator.onLine;
        if (statusElem) {
            statusElem.textContent = isOnline ? (count > 0 ? `En Línea (${count} por sincronizar)` : 'En Línea') : 'Modo Offline (Campo)';
        }

        if (dotElem) {
            dotElem.className = isOnline 
                ? 'h-3 w-3 rounded-full bg-emerald-500 inline-block mr-1' 
                : 'h-3 w-3 rounded-full bg-amber-500 animate-ping inline-block mr-1';
        }
    };

    // Sincronizar todos los datos pendientes con el servidor Express
    const syncPendingData = async () => {
        if (!navigator.onLine) {
            alert('⚠️ No hay conexión a internet disponible en este momento. Los datos permanecerán seguros en este dispositivo.');
            return false;
        }

        const q = getQueue();
        const pendingCount = getPendingCount();

        if (pendingCount === 0) {
            alert('✅ Todos los registros ya están sincronizados con la base de datos central.');
            return true;
        }

        const syncBtn = document.getElementById('btn-sync-now');
        if (syncBtn) {
            syncBtn.disabled = true;
            syncBtn.innerHTML = '⏳ Sincronizando...';
        }

        try {
            const response = await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(q)
            });

            if (response.ok) {
                const resData = await response.json();
                // Limpiar la cola local de pendientes
                localStorage.setItem(STORAGE_KEY, JSON.stringify({ animales: [], consultas: [], vacunas: [], esterilizaciones: [], citas_cvi: [] }));
                updateSyncUI();

                if (window.onSyncSuccess) window.onSyncSuccess();

                alert(`🎉 ¡Sincronización Exitosa! ${resData.procesados || pendingCount} registros de campo fueron subidos a la base de datos central.`);
                return true;
            } else {
                throw new Error('Error en la respuesta del servidor');
            }
        } catch (err) {
            console.error('Error al sincronizar:', err);
            alert('❌ Ocurrió un problema durante la sincronización. Intenta nuevamente.');
            return false;
        } finally {
            if (syncBtn) {
                syncBtn.disabled = false;
                syncBtn.innerHTML = '🔄 Sincronizar Ahora';
            }
        }
    };

    // Eliminar un paciente de la cola local
    const deleteAnimalLocal = (id) => {
        const q = getQueue();
        if (q.animales) {
            q.animales = q.animales.filter(a => a.id !== id);
            saveQueue(q);
        }
        try {
            const localP = JSON.parse(localStorage.getItem(LOCAL_PATIENTS_KEY) || '[]');
            const updated = localP.filter(a => a.id !== id);
            localStorage.setItem(LOCAL_PATIENTS_KEY, JSON.stringify(updated));
        } catch(e) {}
    };

    // Eliminar un registro cualquiera de la cola local
    const deleteRecordLocal = (type, id) => {
        const q = getQueue();
        if (q[type]) {
            q[type] = q[type].filter(r => r.id !== id);
            saveQueue(q);
        }
    };

    // Escuchadores de eventos de red
    window.addEventListener('online', () => {
        console.log('🌐 Conexión reestablecida.');
        updateSyncUI();
        // Sincronización automática suave si hay elementos
        if (getPendingCount() > 0) {
            console.log('🔄 Intentando auto-sincronización diferida...');
            syncPendingData();
        }
    });

    window.addEventListener('offline', () => {
        console.warn('📶 Pasando a modo Offline de campo.');
        updateSyncUI();
    });

    document.addEventListener('DOMContentLoaded', () => {
        updateSyncUI();
    });

    return {
        getQueue,
        getPendingCount,
        saveAnimalLocal,
        saveRecordLocal,
        deleteAnimalLocal,
        deleteRecordLocal,
        getLocalPatientsList,
        syncPendingData,
        updateSyncUI
    };
})();

