const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname)));

// База даних акаунтів прямо на сервері (тимчасова, в пам'яті)
let usersDatabase = {};
let waitingUsers = [];

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const data = JSON.parse(message);

        // Обробка реєстрації
        if (data.type === 'register_account') {
            const profile = data.profile;
            usersDatabase[profile.name] = {
                name: profile.name,
                password: data.password,
                gender: profile.gender,
                age: profile.age,
                about: profile.about,
                customSetting: profile.customSetting || "",
                avatar: profile.avatar
            };
            ws.send(JSON.stringify({ type: 'auth_success', profile: usersDatabase[profile.name] }));
        }

        // Обробка входу
        if (data.type === 'login_account') {
            const user = usersDatabase[data.name];
            if (user && user.password === data.password) {
                ws.send(JSON.stringify({ type: 'auth_success', profile: user }));
            } else {
                ws.send(JSON.stringify({ type: 'auth_fail', reason: 'Невірний логін або пароль' }));
            }
        }

        if (data.type === 'join') {
            ws.userId = data.userId;
            ws.profile = data.profile;
            findPartner(ws);
        }

        if (data.type === 'next') {
            disconnectPartner(ws);
            findPartner(ws);
        }

        if (data.type === 'message') {
            if (ws.partner && ws.partner.readyState === WebSocket.OPEN) {
                ws.partner.send(JSON.stringify({ type: 'chat_message', text: data.text }));
            }
        }

        if (data.type === 'offer' || data.type === 'answer' || data.type === 'candidate') {
            if (ws.partner && ws.partner.readyState === WebSocket.OPEN) {
                ws.partner.send(JSON.stringify(data));
            }
        }
    });

    ws.on('close', () => {
        disconnectPartner(ws);
        waitingUsers = waitingUsers.filter(user => user !== ws);
    });
});

function findPartner(ws) {
    const partner = waitingUsers.find(user => user !== ws && user.readyState === WebSocket.OPEN);

    if (partner) {
        waitingUsers = waitingUsers.filter(user => user !== partner);
        ws.partner = partner;
        partner.partner = ws;

        ws.send(JSON.stringify({ type: 'connected', partnerProfile: partner.profile }));
        partner.send(JSON.stringify({ type: 'connected', partnerProfile: ws.profile }));
    } else {
        if (!waitingUsers.includes(ws)) {
            waitingUsers.push(ws);
        }
        ws.send(JSON.stringify({ type: 'waiting' }));
    }
}

function disconnectPartner(ws) {
    if (ws.partner) {
        const oldPartner = ws.partner;
        ws.partner = null;
        oldPartner.partner = null;
        oldPartner.send(JSON.stringify({ type: 'partner_disconnected' }));
        findPartner(oldPartner);
    }
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер працює на порту ${PORT}`);
});
