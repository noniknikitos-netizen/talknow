const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname)));

let waitingUsers = [];

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const data = JSON.parse(message);

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
