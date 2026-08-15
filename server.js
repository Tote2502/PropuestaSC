/**
 * server.js
 * Servidor Express backend en Node.js para la Fundación Misión Nevado.
 * Ofrece API REST asíncrona, ligera y soporta sincronización batch Offline-First.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Servir archivos estáticos del frontend
app.use(express.static(path.join(__dirname, 'public')));

// Helper para generar IDs únicos sencillos
const generateId = (prefix = 'item') => `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

// ----------------------------------------------------
// RUTAS API REST
// ----------------------------------------------------

/**
 * GET /api/stats
 * Obtiene métricas analíticas e impacto mensual de rescates
 */
app.get('/api/stats', (req, res) => {
    const fechaActual = new Date();
    const year = fechaActual.getFullYear();
    const month = String(fechaActual.getMonth() + 1).padStart(2, '0');
    const mesActualStr = `${year}-${month}`;

    const queryRescatesMensuales = `
        SELECT mes_rescate, COUNT(*) as total_rescatados
        FROM animales
        WHERE condicion = 'Rescatado' AND mes_rescate IS NOT NULL
        GROUP BY mes_rescate
        ORDER BY mes_rescate DESC
        LIMIT 6
    `;

    const queryTotales = `
        SELECT 
            (SELECT COUNT(*) FROM animales) as total_pacientes,
            (SELECT COUNT(*) FROM animales WHERE condicion = 'Rescatado' AND mes_rescate = ?) as rescatados_mes_actual,
            (SELECT COUNT(*) FROM consultas) as total_consultas,
            (SELECT COUNT(*) FROM vacunas) as total_vacunas,
            (SELECT COUNT(*) FROM esterilizaciones WHERE estado = 'Operado') as total_esterilizados,
            (SELECT COUNT(*) FROM citas_cvi) as total_citas_cvi,
            (
                (SELECT COUNT(*) FROM animales WHERE sincronizado = 0) +
                (SELECT COUNT(*) FROM consultas WHERE sincronizado = 0) +
                (SELECT COUNT(*) FROM vacunas WHERE sincronizado = 0) +
                (SELECT COUNT(*) FROM esterilizaciones WHERE sincronizado = 0) +
                (SELECT COUNT(*) FROM citas_cvi WHERE sincronizado = 0)
            ) as pendientes_sincronizar
    `;

    db.all(queryRescatesMensuales, [], (err, rescatesRows) => {
        if (err) return res.status(500).json({ error: err.message });

        db.get(queryTotales, [mesActualStr], (errTot, totales) => {
            if (errTot) return res.status(500).json({ error: errTot.message });

            res.json({
                totales,
                rescates_historico: rescatesRows,
                mes_actual: mesActualStr
            });
        });
    });
});

/**
 * GET /api/animales
 * Obtiene la lista de animales registrados
 */
app.get('/api/animales', (req, res) => {
    const sql = `SELECT * FROM animales ORDER BY fecha_registro DESC LIMIT 100`;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

/**
 * POST /api/animales
 * Registra un nuevo paciente animal
 */
app.post('/api/animales', (req, res) => {
    const { nombre, especie, raza, sexo, edad_aprox, condicion, tutor_nombre, tutor_cedula, tutor_telefono, tutor_direccion } = req.body;

    if (!nombre || !especie || !condicion) {
        return res.status(400).json({ error: 'Nombre, especie y condición son requeridos' });
    }

    const id = req.body.id || generateId('anim');
    const codigo = req.body.codigo || `NEV-${Math.floor(100 + Math.random() * 900)}`;
    const fechaActual = new Date();
    const mes_rescate = req.body.mes_rescate || `${fechaActual.getFullYear()}-${String(fechaActual.getMonth() + 1).padStart(2, '0')}`;
    const sincronizado = req.body.sincronizado !== undefined ? req.body.sincronizado : 1;

    const sql = `
        INSERT INTO animales (id, codigo, nombre, especie, raza, sexo, edad_aprox, condicion, mes_rescate, tutor_nombre, tutor_cedula, tutor_telefono, tutor_direccion, sincronizado)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(sql, [id, codigo, nombre, especie, raza || 'Mestizo', sexo || 'Macho', edad_aprox, condicion, mes_rescate, tutor_nombre, tutor_cedula, tutor_telefono, tutor_direccion, sincronizado], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ message: 'Paciente registrado exitosamente', id, codigo });
    });
});

/**
 * GET /api/consultas
 */
app.get('/api/consultas', (req, res) => {
    const sql = `
        SELECT c.*, a.nombre as animal_nombre, a.codigo as animal_codigo, a.especie
        FROM consultas c
        JOIN animales a ON c.animal_id = a.id
        ORDER BY c.fecha_registro DESC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

/**
 * POST /api/consultas
 */
app.post('/api/consultas', (req, res) => {
    const { animal_id, peso_kg, temperatura, tipo_atencion, sintomas, diagnostico, tratamiento_indicado, veterinario } = req.body;

    if (!animal_id || !tipo_atencion) {
        return res.status(400).json({ error: 'animal_id y tipo_atencion son requeridos' });
    }

    const id = req.body.id || generateId('cons');
    const sincronizado = req.body.sincronizado !== undefined ? req.body.sincronizado : 1;

    const sql = `
        INSERT INTO consultas (id, animal_id, peso_kg, temperatura, tipo_atencion, sintomas, diagnostico, tratamiento_indicado, veterinario, sincronizado)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(sql, [id, animal_id, peso_kg, temperatura, tipo_atencion, sintomas, diagnostico, tratamiento_indicado, veterinario, sincronizado], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ message: 'Consulta médica registrada', id });
    });
});

/**
 * GET /api/vacunas
 */
app.get('/api/vacunas', (req, res) => {
    const sql = `
        SELECT v.*, a.nombre as animal_nombre, a.codigo as animal_codigo, a.especie
        FROM vacunas v
        JOIN animales a ON v.animal_id = a.id
        ORDER BY v.fecha_registro DESC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

/**
 * POST /api/vacunas
 */
app.post('/api/vacunas', (req, res) => {
    const { animal_id, tipo_servicio, producto, dosis, observaciones } = req.body;
    if (!animal_id || !producto) {
        return res.status(400).json({ error: 'animal_id y producto son requeridos' });
    }

    const id = req.body.id || generateId('vac');
    const sincronizado = req.body.sincronizado !== undefined ? req.body.sincronizado : 1;

    const sql = `
        INSERT INTO vacunas (id, animal_id, tipo_servicio, producto, dosis, observaciones, sincronizado)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(sql, [id, animal_id, tipo_servicio || 'Vacunación', producto, dosis, observaciones, sincronizado], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ message: 'Vacuna/Tratamiento registrado', id });
    });
});

/**
 * GET /api/esterilizaciones
 */
app.get('/api/esterilizaciones', (req, res) => {
    const sql = `
        SELECT e.*, a.nombre as animal_nombre, a.codigo as animal_codigo, a.especie, a.tutor_nombre, a.tutor_telefono
        FROM esterilizaciones e
        JOIN animales a ON e.animal_id = a.id
        ORDER BY e.fecha_registro DESC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

/**
 * POST /api/esterilizaciones
 */
app.post('/api/esterilizaciones', (req, res) => {
    const { animal_id, tipo_procedimiento, estado, fecha_programada, cirujano, observaciones } = req.body;
    if (!animal_id || !tipo_procedimiento) {
        return res.status(400).json({ error: 'animal_id y tipo_procedimiento son requeridos' });
    }

    const id = req.body.id || generateId('est');
    const sincronizado = req.body.sincronizado !== undefined ? req.body.sincronizado : 1;

    const sql = `
        INSERT INTO esterilizaciones (id, animal_id, tipo_procedimiento, estado, fecha_programada, cirujano, observaciones, sincronizado)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(sql, [id, animal_id, tipo_procedimiento, estado || 'Censado', fecha_programada, cirujano, observaciones, sincronizado], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ message: 'Registro de esterilización creado', id });
    });
});

/**
 * GET /api/citas-cvi
 */
app.get('/api/citas-cvi', (req, res) => {
    const sql = `
        SELECT c.*, a.nombre as animal_nombre, a.codigo as animal_codigo, a.especie, a.tutor_nombre, a.tutor_telefono
        FROM citas_cvi c
        JOIN animales a ON c.animal_id = a.id
        ORDER BY c.fecha_cita ASC
    `;
    db.all(sql, [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

/**
 * POST /api/citas-cvi
 */
app.post('/api/citas-cvi', (req, res) => {
    const { animal_id, cvi_destino, motivo_derivacion, fecha_cita, prioridad, observaciones } = req.body;
    if (!animal_id || !cvi_destino || !fecha_cita) {
        return res.status(400).json({ error: 'animal_id, cvi_destino y fecha_cita son requeridos' });
    }

    const id = req.body.id || generateId('cvi');
    const sincronizado = req.body.sincronizado !== undefined ? req.body.sincronizado : 1;

    const sql = `
        INSERT INTO citas_cvi (id, animal_id, cvi_destino, motivo_derivacion, fecha_cita, prioridad, observaciones, sincronizado)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(sql, [id, animal_id, cvi_destino, motivo_derivacion, fecha_cita, prioridad || 'Normal', observaciones, sincronizado], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.status(201).json({ message: 'Cita para CVI programada', id });
    });
});

// ----------------------------------------------------
// RUTAS DE ELIMINACIÓN (DELETE)
// ----------------------------------------------------

/**
 * DELETE /api/animales/:id
 */
app.delete('/api/animales/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM animales WHERE id = ?', [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Registro no encontrado' });
        res.json({ message: 'Paciente eliminado exitosamente', id });
    });
});

/**
 * DELETE /api/consultas/:id
 */
app.delete('/api/consultas/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM consultas WHERE id = ?', [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Consulta no encontrada' });
        res.json({ message: 'Consulta eliminada exitosamente', id });
    });
});

/**
 * DELETE /api/vacunas/:id
 */
app.delete('/api/vacunas/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM vacunas WHERE id = ?', [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Vacuna no encontrada' });
        res.json({ message: 'Vacuna eliminada exitosamente', id });
    });
});

/**
 * DELETE /api/esterilizaciones/:id
 */
app.delete('/api/esterilizaciones/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM esterilizaciones WHERE id = ?', [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Registro no encontrado' });
        res.json({ message: 'Registro de esterilización eliminado', id });
    });
});

/**
 * DELETE /api/citas-cvi/:id
 */
app.delete('/api/citas-cvi/:id', (req, res) => {
    const { id } = req.params;
    db.run('DELETE FROM citas_cvi WHERE id = ?', [id], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Cita no encontrada' });
        res.json({ message: 'Cita eliminada exitosamente', id });
    });
});

// ----------------------------------------------------
// PATRÓN DE SINCRONIZACIÓN OFFLINE-FIRST (POST /api/sync)
// ----------------------------------------------------
/**
 * POST /api/sync
 * Recibe un lote (batch) de registros creados en campo en modo offline
 * los inserta o actualiza en SQLite y marca sincronizado = 1.
 */
app.post('/api/sync', (req, res) => {
    const { animales = [], consultas = [], vacunas = [], esterilizaciones = [], citas_cvi = [] } = req.body;

    let procesados = 0;
    const nowMes = new Date().toISOString().substring(0, 7);

    db.serialize(() => {
        db.run('BEGIN TRANSACTION;');

        let hasError = false;
        let errorMessage = '';

        // 1. Sincronizar Animales
        const stmtAnim = db.prepare(`
            INSERT INTO animales (id, codigo, nombre, especie, raza, sexo, edad_aprox, condicion, mes_rescate, tutor_nombre, tutor_cedula, tutor_telefono, tutor_direccion, sincronizado)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            ON CONFLICT(id) DO UPDATE SET
                nombre = excluded.nombre,
                especie = excluded.especie,
                condicion = excluded.condicion,
                sincronizado = 1;
        `);
        animales.forEach(a => {
            if (hasError) return;
            const mes = a.mes_rescate || nowMes;
            const cod = a.codigo || `NEV-${Math.floor(100 + Math.random() * 900)}`;
            stmtAnim.run([a.id, cod, a.nombre, a.especie, a.raza || 'Mestizo', a.sexo || 'Macho', a.edad_aprox || '', a.condicion, mes, a.tutor_nombre || '', a.tutor_cedula || '', a.tutor_telefono || '', a.tutor_direccion || ''], (err) => {
                if (err) {
                    hasError = true;
                    errorMessage = `Error sincronizando animal (${a.nombre}): ${err.message}`;
                    console.error(errorMessage);
                } else {
                    procesados++;
                }
            });
        });
        stmtAnim.finalize();

        // 2. Sincronizar Consultas
        const stmtCons = db.prepare(`
            INSERT INTO consultas (id, animal_id, peso_kg, temperatura, tipo_atencion, sintomas, diagnostico, tratamiento_indicado, veterinario, sincronizado)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
            ON CONFLICT(id) DO UPDATE SET sincronizado = 1;
        `);
        consultas.forEach(c => {
            if (hasError) return;
            stmtCons.run([c.id, c.animal_id, c.peso_kg || null, c.temperatura || null, c.tipo_atencion || 'Triaje', c.sintomas || '', c.diagnostico || '', c.tratamiento_indicado || '', c.veterinario || 'Dr. Misión Nevado'], (err) => {
                if (err) {
                    hasError = true;
                    errorMessage = `Error sincronizando consulta (${c.id}): ${err.message}`;
                    console.error(errorMessage);
                } else {
                    procesados++;
                }
            });
        });
        stmtCons.finalize();

        // 3. Sincronizar Vacunas (7 columnas -> 6 placeholders '?' + 1 hardcoded '1')
        const stmtVac = db.prepare(`
            INSERT INTO vacunas (id, animal_id, tipo_servicio, producto, dosis, observaciones, sincronizado)
            VALUES (?, ?, ?, ?, ?, ?, 1)
            ON CONFLICT(id) DO UPDATE SET sincronizado = 1;
        `);
        vacunas.forEach(v => {
            if (hasError) return;
            stmtVac.run([v.id, v.animal_id, v.tipo_servicio || 'Vacunación', v.producto || 'Vacuna', v.dosis || '1 ml', v.observaciones || ''], (err) => {
                if (err) {
                    hasError = true;
                    errorMessage = `Error sincronizando vacuna (${v.producto}): ${err.message}`;
                    console.error(errorMessage);
                } else {
                    procesados++;
                }
            });
        });
        stmtVac.finalize();

        // 4. Sincronizar Esterilizaciones
        const stmtEst = db.prepare(`
            INSERT INTO esterilizaciones (id, animal_id, tipo_procedimiento, estado, fecha_programada, cirujano, observaciones, sincronizado)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            ON CONFLICT(id) DO UPDATE SET sincronizado = 1;
        `);
        esterilizaciones.forEach(e => {
            if (hasError) return;
            stmtEst.run([e.id, e.animal_id, e.tipo_procedimiento || 'Esterilización', e.estado || 'Censado', e.fecha_programada || '', e.cirujano || '', e.observaciones || ''], (err) => {
                if (err) {
                    hasError = true;
                    errorMessage = `Error sincronizando esterilización (${e.id}): ${err.message}`;
                    console.error(errorMessage);
                } else {
                    procesados++;
                }
            });
        });
        stmtEst.finalize();

        // 5. Sincronizar Citas CVI
        const stmtCvi = db.prepare(`
            INSERT INTO citas_cvi (id, animal_id, cvi_destino, motivo_derivacion, estado, fecha_cita, prioridad, observaciones, sincronizado)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
            ON CONFLICT(id) DO UPDATE SET sincronizado = 1;
        `);
        citas_cvi.forEach(ci => {
            if (hasError) return;
            stmtCvi.run([ci.id, ci.animal_id, ci.cvi_destino || 'CVI Central', ci.motivo_derivacion || 'Consulta Especializada', ci.estado || 'Pendiente', ci.fecha_cita || new Date().toISOString().substring(0, 10), ci.prioridad || 'Normal', ci.observaciones || ''], (err) => {
                if (err) {
                    hasError = true;
                    errorMessage = `Error sincronizando cita CVI (${ci.id}): ${err.message}`;
                    console.error(errorMessage);
                } else {
                    procesados++;
                }
            });
        });
        stmtCvi.finalize();

        db.run(hasError ? 'ROLLBACK;' : 'COMMIT;', (err) => {
            if (err || hasError) {
                console.error('❌ Error finalizando sincronización:', err ? err.message : errorMessage);
                return res.status(500).json({ error: errorMessage || (err ? err.message : 'Error en sincronización') });
            }
            console.log(`📡 Sincronización exitosa: ${procesados} registros integrados en la nube/servidor.`);
            res.json({ success: true, procesados, message: `${procesados} registros sincronizados correctamente.` });
        });
    });
});


// Arrancar Servidor Express
app.listen(PORT, () => {
    console.log(`🚀 Servidor Misión Nevado ejecutándose en http://localhost:${PORT}`);
    console.log(`📶 Listo para recepción de datos locales y sincronización offline-first.`);
});
