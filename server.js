require('dotenv').config();
const express = require('express');
const mqtt = require('mqtt');
const mysql = require('mysql2');
const cors = require('cors');
const https = require('https');
const crypto = require('crypto');

const app = express();
app.use(express.json());
app.use(cors());

const dbConfig = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    connectTimeout: 10000
};

let db;

function handleDisconnect() {
    db = mysql.createConnection(dbConfig);

    db.connect(err => {
        if (err) {
            console.error('Error conectando a la BD:', err);
            setTimeout(handleDisconnect, 2000);
        } else {
            console.log('Conectado a la BD MySQL');
        }
    });

    db.on('error', err => {
        console.error('Error en la conexión de la BD:', err);
        if (err.code === 'PROTOCOL_CONNECTION_LOST') {
            handleDisconnect();
        } else {
            throw err;
        }
    });
}

handleDisconnect();

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

const recentMessages = new Set();

mqttClient.on('message', (topic, message) => {
    console.log(`Mensaje recibido en ${topic}: ${message.toString()}`);
    try {
        const hash = crypto.createHash('sha256').update(message).digest('hex');
        if (recentMessages.has(hash)) {
            console.log('Mensaje duplicado ignorado');
            return;
        }
        recentMessages.add(hash);
        setTimeout(() => recentMessages.delete(hash), 60000);

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

app.get('/datos', (req, res) => {
    db.query('SELECT * FROM mediciones ORDER BY id DESC LIMIT 10', (err, results) => {
        if (err) return res.status(500).send(err);
        res.json(results);
    });
});

setInterval(() => {
    https.get('https://rendermqtt2025.onrender.com');
}, 10 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});