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

// 🌟 Usamos un pool de conexiones para MySQL
const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

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
        const messageString = message.toString();
        
        // Verificar si el mensaje es un JSON válido
        if (messageString.trim().startsWith('{') && messageString.trim().endsWith('}')) {
            const hash = crypto.createHash('sha256').update(message).digest('hex');
            if (recentMessages.has(hash)) {
                console.log('Mensaje duplicado ignorado');
                return;
            }
            recentMessages.add(hash);
            setTimeout(() => recentMessages.delete(hash), 60000);

            const data = JSON.parse(messageString);
            const { temperatura, humedad, fecha, hora } = data;
            const fechaHora = `${fecha} ${hora}`;
            const query = 'INSERT INTO mediciones (temperatura, humedad, fecha) VALUES (?, ?, ?)';

            db.query(query, [temperatura, humedad, fechaHora], (err, result) => {
                if (err) console.error('❌ Error insertando en BD:', err);
                else console.log('✅ Dato guardado en BD:', result.insertId);
            });
        } else {
            console.log('Mensaje no es un JSON válido, ignorado');
        }
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

// 🌟 Mantener activo el servidor en Render
setInterval(() => {
    https.get('https://rendermqtt2025.onrender.com');
}, 10 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`Servidor corriendo en http://localhost:${PORT}`);
});