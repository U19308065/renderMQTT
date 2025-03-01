require('dotenv').config();
const express = require('express');
const mqtt = require('mqtt');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectTimeout: 10000 // Aumentar el tiempo de espera de la conexión
};

let db;

function handleDisconnect() {
    db = mysql.createConnection(dbConfig);

    db.connect(err => {
        if (err) {
            console.error('Error conectando a la BD:', err);
            setTimeout(handleDisconnect, 2000); // Intentar reconectar después de 2 segundos
        } else {
            console.log('Conectado a la BD MySQL');
        }
    });

    db.on('error', err => {
        console.error('Error en la conexión de la BD:', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            handleDisconnect(); // Reconectar si la conexión se pierde
        } else {
            throw err;
        }
    });
}

handleDisconnect();

// Configurar conexión con el broker MQTT
const mqttClient = mqtt.connect(process.env.MQTT_BROKER, {
    username: process.env.MQTT_USER,
    password: process.env.MQTT_PASS
});

mqttClient.on('connect', () => {
    console.log('Conectado al broker MQTT');
    mqttClient.subscribe('LALO/esp32', err => {
        if (!err) console.log('Suscrito a LALO/esp32');
    });
});

// Recibir datos desde MQTT y guardarlos en la base de datos
mqttClient.on('message', (topic, message) => {
    console.log(`Mensaje recibido en ${topic}: ${message.toString()}`);
    try {
        const data = JSON.parse(message.toString());
        const { temperatura, humedad, fecha, hora } = data;
        const fechaHora = `${fecha} ${hora}`;
        const query = 'INSERT INTO mediciones (temperatura, humedad, fecha) VALUES (?, ?, ?)';
        db.query(query, [temperatura, humedad, fechaHora], (err, result) => {
            if (err) console.error('Error insertando en BD:', err);
            else console.log('Dato guardado en BD:', result.insertId);
        });
    } catch (err) {
        console.error('Error procesando mensaje MQTT:', err);
    }
});

// Endpoint para obtener datos desde la base de datos
app.get('/datos', (req, res) => {
    db.query('SELECT * FROM mediciones ORDER BY id DESC LIMIT 10', (err, results) => {
        if (err) return res.status(500).send(err);
        res.json(results);
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});