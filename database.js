/**
 * database.js
 * Módulo de conexión y gestión de SQLite3 para la Fundación Misión Nevado.
 * Diseñado para entornos Offline-First en jornadas comunitarias y puntos fijos.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const DB_PATH = path.join(__dirname, 'mision_nevado.db');

// Conexión a la base de datos local SQLite
const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('❌ Error al conectar con la base de datos SQLite:', err.message);
    } else {
        console.log('✅ Conexión exitosa a la base de datos SQLite local:', DB_PATH);
    }
});

// Inicialización de Tablas y Datos Semilla
db.serialize(() => {
    // Habilitar claves foráneas
    db.run('PRAGMA foreign_keys = ON;');

    // 1. Tabla: animales (Pacientes atendidos y rescatados)
    db.run(`
        CREATE TABLE IF NOT EXISTS animales (
            id TEXT PRIMARY KEY,
            codigo TEXT UNIQUE NOT NULL,
            nombre TEXT NOT NULL,
            especie TEXT NOT NULL, -- Perro, Gato, Otro
            raza TEXT DEFAULT 'Mestizo',
            sexo TEXT NOT NULL, -- Macho, Hembra
            edad_aprox TEXT,
            condicion TEXT NOT NULL, -- Rescatado, Con Tutor, Situación de Calle
            mes_rescate TEXT, -- Formato YYYY-MM para estadísticas mensuales
            tutor_nombre TEXT,
            tutor_cedula TEXT,
            tutor_telefono TEXT,
            tutor_direccion TEXT,
            sincronizado INTEGER DEFAULT 0, -- 0: Local (Pendiente), 1: Nube/Servidor
            fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // 2. Tabla: consultas (Triaje y Atención Médica)
    db.run(`
        CREATE TABLE IF NOT EXISTS consultas (
            id TEXT PRIMARY KEY,
            animal_id TEXT NOT NULL,
            peso_kg REAL,
            temperatura REAL,
            tipo_atencion TEXT NOT NULL, -- Triaje, Consulta General, Emergencia
            sintomas TEXT,
            diagnostico TEXT,
            tratamiento_indicado TEXT,
            veterinario TEXT,
            sincronizado INTEGER DEFAULT 0,
            fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (animal_id) REFERENCES animales(id) ON DELETE CASCADE
        )
    `);

    // 3. Tabla: vacunas (Vacunación, Desparasitación y Tratamientos Menores)
    db.run(`
        CREATE TABLE IF NOT EXISTS vacunas (
            id TEXT PRIMARY KEY,
            animal_id TEXT NOT NULL,
            tipo_servicio TEXT NOT NULL, -- Vacuna, Desparasitación, Tratamiento Menor
            producto TEXT NOT NULL, -- Antirrábica, Séxtuple, Triple Felina, Ivermectina, etc.
            dosis TEXT,
            observaciones TEXT,
            sincronizado INTEGER DEFAULT 0,
            fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (animal_id) REFERENCES animales(id) ON DELETE CASCADE
        )
    `);

    // 4. Tabla: esterilizaciones (Censo y Control Poblacional)
    db.run(`
        CREATE TABLE IF NOT EXISTS esterilizaciones (
            id TEXT PRIMARY KEY,
            animal_id TEXT NOT NULL,
            tipo_procedimiento TEXT NOT NULL, -- Castración, OVH
            estado TEXT DEFAULT 'Censado', -- Censado, Programado, Operado
            fecha_programada TEXT,
            cirujano TEXT,
            observaciones TEXT,
            sincronizado INTEGER DEFAULT 0,
            fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (animal_id) REFERENCES animales(id) ON DELETE CASCADE
        )
    `);

    // 5. Tabla: citas_cvi (Derivaciones a Centros Veterinarios Integrales)
    db.run(`
        CREATE TABLE IF NOT EXISTS citas_cvi (
            id TEXT PRIMARY KEY,
            animal_id TEXT NOT NULL,
            cvi_destino TEXT NOT NULL, -- CVI Canódromo, CVI Nuevo Circo, CVI Caricuao
            motivo_derivacion TEXT NOT NULL, -- Cirugía Compleja, Rayos X, Eco, Traumatología
            estado TEXT DEFAULT 'Pendiente', -- Pendiente, Confirmado, Atendido
            fecha_cita TEXT NOT NULL,
            prioridad TEXT DEFAULT 'Normal', -- Normal, Alta, Urgente
            observaciones TEXT,
            sincronizado INTEGER DEFAULT 0,
            fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (animal_id) REFERENCES animales(id) ON DELETE CASCADE
        )
    `);

    // Insertar datos de prueba (Seed Data) si la tabla animales está vacía
    db.get('SELECT COUNT(*) as count FROM animales', (err, row) => {
        if (err) return console.error('Error al verificar semillas:', err.message);
        
        if (row.count === 0) {
            console.log('🌱 Poblando base de datos con datos de prueba e historial de rescates...');
            
            const seedStmt = db.prepare(`
                INSERT INTO animales (id, codigo, nombre, especie, raza, sexo, edad_aprox, condicion, mes_rescate, tutor_nombre, tutor_cedula, tutor_telefono, sincronizado, fecha_registro)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `);

            // Generar fechas dinámicas para los últimos 3 meses y el mes actual
            const fechaActual = new Date();
            const year = fechaActual.getFullYear();
            const month = String(fechaActual.getMonth() + 1).padStart(2, '0');
            const mesActual = `${year}-${month}`;

            const prevMonthDate1 = new Date(fechaActual.getFullYear(), fechaActual.getMonth() - 1, 1);
            const mesAnterior1 = `${prevMonthDate1.getFullYear()}-${String(prevMonthDate1.getMonth() + 1).padStart(2, '0')}`;

            const prevMonthDate2 = new Date(fechaActual.getFullYear(), fechaActual.getMonth() - 2, 1);
            const mesAnterior2 = `${prevMonthDate2.getFullYear()}-${String(prevMonthDate2.getMonth() + 1).padStart(2, '0')}`;

            const prevMonthDate3 = new Date(fechaActual.getFullYear(), fechaActual.getMonth() - 3, 1);
            const mesAnterior3 = `${prevMonthDate3.getFullYear()}-${String(prevMonthDate3.getMonth() + 1).padStart(2, '0')}`;

            // Pacientes Semilla
            const animalesSeed = [
                // Rescatados Mes Actual
                ['anim-001', 'NEV-001', 'Nevado', 'Perro', 'Mestizo', 'Macho', '3 años', 'Rescatado', mesActual, 'Fundación Nevado', 'V-0000000', '0412-1111111', 1, `${mesActual}-02 10:00:00`],
                ['anim-002', 'NEV-002', 'Luna', 'Gato', 'Mestizo', 'Hembra', '1 año', 'Rescatado', mesActual, 'Fundación Nevado', 'V-0000000', '0412-1111111', 1, `${mesActual}-05 11:30:00`],
                ['anim-003', 'NEV-003', 'Rocco', 'Perro', 'Pitbull Mix', 'Macho', '2 años', 'Rescatado', mesActual, 'María Delgado', 'V-18234567', '0414-2223344', 0, `${mesActual}-10 09:15:00`],
                ['anim-004', 'NEV-004', 'Misha', 'Gato', 'Siames Mix', 'Hembra', '8 meses', 'Rescatado', mesActual, 'Carlos Mendoza', 'V-15987654', '0424-5556677', 1, `${mesActual}-12 14:00:00`],
                ['anim-005', 'NEV-005', 'Sol', 'Perro', 'Mestizo', 'Hembra', '4 años', 'Rescatado', mesActual, 'Fundación Nevado', 'V-0000000', '0412-1111111', 1, `${mesActual}-14 08:45:00`],

                // Con Tutor (Atención Comunitaria Mes Actual)
                ['anim-006', 'NEV-006', 'Kaiser', 'Perro', 'Pastor Alemán', 'Macho', '5 años', 'Con Tutor', mesActual, 'José Rodríguez', 'V-14555888', '0416-9998877', 1, `${mesActual}-14 09:30:00`],
                ['anim-007', 'NEV-007', 'Pelusa', 'Gato', 'Persa Mix', 'Hembra', '2 años', 'Con Tutor', mesActual, 'Ana Gómez', 'V-20111222', '0412-3334455', 1, `${mesActual}-14 10:15:00`],

                // Rescatados Mes Anterior 1
                ['anim-008', 'NEV-008', 'Toby', 'Perro', 'Mestizo', 'Macho', '1 año', 'Rescatado', mesAnterior1, 'Fundación Nevado', 'V-0000000', '0412-1111111', 1, `${mesAnterior1}-10 10:00:00`],
                ['anim-009', 'NEV-009', 'Nala', 'Gato', 'Mestizo', 'Hembra', '6 meses', 'Rescatado', mesAnterior1, 'Fundación Nevado', 'V-0000000', '0412-1111111', 1, `${mesAnterior1}-15 11:00:00`],
                ['anim-010', 'NEV-010', 'Bruno', 'Perro', 'Mestizo', 'Macho', '4 años', 'Rescatado', mesAnterior1, 'Fundación Nevado', 'V-0000000', '0412-1111111', 1, `${mesAnterior1}-20 15:30:00`],

                // Rescatados Mes Anterior 2
                ['anim-011', 'NEV-011', 'Chocolat', 'Perro', 'Mestizo', 'Macho', '2 años', 'Rescatado', mesAnterior2, 'Fundación Nevado', 'V-0000000', '0412-1111111', 1, `${mesAnterior2}-05 09:00:00`],
                ['anim-012', 'NEV-012', 'Sombra', 'Gato', 'Mestizo', 'Macho', '1.5 años', 'Rescatado', mesAnterior2, 'Fundación Nevado', 'V-0000000', '0412-1111111', 1, `${mesAnterior2}-18 16:00:00`],

                // Rescatados Mes Anterior 3
                ['anim-013', 'NEV-013', 'Canela', 'Perro', 'Mestizo', 'Hembra', '5 años', 'Rescatado', mesAnterior3, 'Fundación Nevado', 'V-0000000', '0412-1111111', 1, `${mesAnterior3}-12 11:20:00`]
            ];

            db.serialize(() => {
                db.run('BEGIN TRANSACTION;');

                const seedStmt = db.prepare(`
                    INSERT INTO animales (id, codigo, nombre, especie, raza, sexo, edad_aprox, condicion, mes_rescate, tutor_nombre, tutor_cedula, tutor_telefono, sincronizado, fecha_registro)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                animalesSeed.forEach(a => seedStmt.run(a));
                seedStmt.finalize();

                // Consultas Semilla
                const consultaStmt = db.prepare(`
                    INSERT INTO consultas (id, animal_id, peso_kg, temperatura, tipo_atencion, sintomas, diagnostico, tratamiento_indicado, veterinario, sincronizado)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                consultaStmt.run(['cons-001', 'anim-001', 18.5, 38.6, 'Triaje', 'Desnutrición leve, dermatitis de contacto', 'Dermatitis bacteriana secundaria', 'Baños medicados y suplemento vitamínico', 'Dra. Yelitza Briceño', 1]);
                consultaStmt.run(['cons-002', 'anim-003', 24.0, 39.1, 'Emergencia', 'Herida punzante en pata trasera derecha', 'Laceración de tejido blando', 'Curación, sutura simple y antibiótico oral', 'Dr. Carlos Silva', 0]);
                consultaStmt.run(['cons-003', 'anim-006', 31.2, 38.4, 'Consulta General', 'Chequeo de rutina y desparasitación', 'Paciente clínico sano', 'Desparasitación oral preventiva', 'Dra. Yelitza Briceño', 1]);
                consultaStmt.finalize();

                // Vacunas Semilla
                const vacunaStmt = db.prepare(`
                    INSERT INTO vacunas (id, animal_id, tipo_servicio, producto, dosis, observaciones, sincronizado)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `);
                vacunaStmt.run(['vac-001', 'anim-001', 'Vacunación', 'Rabican (Antirrábica)', '1 ml SC', 'Aplicada en jornada comunitaria Plaza Bolívar', 1]);
                vacunaStmt.run(['vac-002', 'anim-002', 'Vacunación', 'Triple Felina', '1 ml SC', 'Primera dosis booster', 1]);
                vacunaStmt.run(['vac-003', 'anim-006', 'Vacunación', 'Octavalent Séxtuple', '1 ml SC', 'Refuerzo anual', 1]);
                vacunaStmt.run(['vac-004', 'anim-007', 'Desparasitación', 'Fendabendazol Polvo', '1 sobre 500mg', 'Repetir en 15 días', 1]);
                vacunaStmt.finalize();

                // Esterilizaciones Semilla
                const estStmt = db.prepare(`
                    INSERT INTO esterilizaciones (id, animal_id, tipo_procedimiento, estado, fecha_programada, cirujano, observaciones, sincronizado)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `);
                estStmt.run(['est-001', 'anim-002', 'OVH (Gata)', 'Operado', `${mesActual}-08`, 'Dr. Gustavo Rivas', 'Sin complicaciones posoperatorias', 1]);
                estStmt.run(['est-002', 'anim-004', 'OVH (Gata)', 'Programado', `${mesActual}-20`, 'Dra. Andrea Morales', 'Censo jornada especial de castración', 1]);
                estStmt.run(['est-003', 'anim-005', 'OVH (Perra)', 'Censado', `${mesActual}-25`, 'Dr. Gustavo Rivas', 'En espera de examen préquirúrgico', 0]);
                estStmt.finalize();

                // Citas CVI Semilla
                const cviStmt = db.prepare(`
                    INSERT INTO citas_cvi (id, animal_id, cvi_destino, motivo_derivacion, estado, fecha_cita, prioridad, observaciones, sincronizado)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `);
                cviStmt.run(['cvi-001', 'anim-003', 'CVI Canódromo (Los Símbolos)', 'Traumatología y Rayos X', 'Confirmado', `${mesActual}-18`, 'Alta', 'Evaluación de articulación coxofemoral', 0]);
                cviStmt.run(['cvi-002', 'anim-007', 'CVI Nuevo Circo', 'Ecografía Abdominal', 'Pendiente', `${mesActual}-22`, 'Normal', 'Descarte de masa abdominal', 1]);
                cviStmt.finalize();

                db.run('COMMIT;', (err) => {
                    if (err) console.error('Error al confirmar transacción semilla:', err);
                    else console.log('✅ Datos de prueba e historial de rescates cargados con éxito.');
                });
            });
        }
    });
});

module.exports = db;
