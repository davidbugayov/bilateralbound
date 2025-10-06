const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes для сессий EMDR
app.post('/api/sessions', (req, res) => {
    console.log('Создание сессии:', req.body);
    const sessionId = Date.now().toString();
    res.json({
        success: true,
        sessionId: sessionId,
        message: 'Сессия создана успешно'
    });
});

app.post('/api/session', (req, res) => {
    console.log('Создание сессии (альтернативный маршрут):', req.body);
    const sessionId = Date.now().toString();
    res.json({
        success: true,
        sessionId: sessionId,
        message: 'Сессия создана успешно'
    });
});

app.get('/api/sessions/:id', (req, res) => {
    res.json({
        success: true,
        sessionId: req.params.id,
        status: 'active'
    });
});

app.get('/api/session/:id', (req, res) => {
    res.json({
        success: true,
        sessionId: req.params.id,
        status: 'active'
    });
});

// Дополнительные API маршруты для EMDR
app.post('/api/sessions/create', (req, res) => {
    console.log('Создание сессии (альтернативный маршрут):', req.body);
    const sessionId = Date.now().toString();
    res.json({
        success: true,
        sessionId: sessionId,
        message: 'Сессия создана успешно'
    });
});

app.get('/api/sessions/:id/status', (req, res) => {
    res.json({
        success: true,
        sessionId: req.params.id,
        status: 'active',
        connectedUsers: 1
    });
});

app.post('/api/session/:id/controller/connect', (req, res) => {
    res.json({
        success: true,
        message: 'Контроллер подключен к сессии'
    });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        server: 'EMDR Production Server'
    });
});

// Обработка статических файлов
app.use(express.static(path.join(__dirname, 'public')));

// Для всех остальных запросов возвращаем index.html (SPA)
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Обработка ошибок
app.use((err, req, res, next) => {
    console.error('Ошибка сервера:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

app.use((req, res) => {
    res.status(404).json({ error: 'Маршрут не найден' });
});

const server = app.listen(PORT, () => {
    console.log('🚀 EMDR Production Сервер запущен');
    console.log(`📍 Порт: ${PORT}`);
    console.log(`🌐 http://localhost:${PORT}`);
    console.log(`📁 Статические файлы: ./public`);
});

module.exports = app;
