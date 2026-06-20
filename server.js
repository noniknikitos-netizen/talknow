const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = 3000;
const DB_FILE = path.join(__dirname, 'database.json');

if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: [] }, null, 2));
}

const server = http.createServer((req, res) => {
    if (req.method === 'GET' && (req.url === '/' || req.url === '/index.html')) {
        fs.readFile(path.join(__dirname, 'index.html'), (err, content) => {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(content);
        });
    } 
    else if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            const db = JSON.parse(fs.readFileSync(DB_FILE));

            if (req.url === '/api/auth') {
                const { action, username, email, password, gender } = JSON.parse(body);

                if (action === 'register') {
                    if (db.users.find(u => u.username === username || u.email === email)) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({ success: false, error: 'Логін або Email вже зайняті' }));
                    }
                    const newUser = { username, email, password, gender, avatar: '👤', bio: 'Привіт, я використовую TalkNow!' };
                    db.users.push(newUser);
                    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: true }));
                } 
                else if (action === 'login') {
                    const user = db.users.find(u => u.username === username && u.password === password);
                    if (!user) {
                        res.writeHead(400, { 'Content-Type': 'application/json' });
                        return res.end(JSON.stringify({ success: false, error: 'Невірний логін або пароль' }));
                    }
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: true, user }));
                }
            }
            else if (req.url === '/api/profile-update') {
                const { username, avatar, bio } = JSON.parse(body);
                const userIndex = db.users.findIndex(u => u.username === username);
                if (userIndex !== -1) {
                    db.users[userIndex].avatar = avatar;
                    db.users[userIndex].bio = bio;
                    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    return res.end(JSON.stringify({ success: true, user: db.users[userIndex] }));
                }
                res.writeHead(404).end();
            }
        });
    } else {
        res.writeHead(404).end();
    }
});

const wss = new WebSocketServer({ server });
let waitingUser = null;

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        const data = JSON.parse(message);

        if (data.type === 'join') {
            ws.userData = data.user;
            
            if (waitingUser && waitingUser !== ws) {
                ws.partner = waitingUser;
                waitingUser.partner = ws;

                ws.send(JSON.stringify({ type: 'system', text: 'connected', partner: waitingUser.userData, initiateCall: true }));
                waitingUser.send(JSON.stringify({ type: 'system', text: 'connected', partner: ws.userData, initiateCall: false }));
                
                waitingUser = null;
            } else {
                waitingUser = ws;
                ws.send(JSON.stringify({ type: 'system', text: 'searching' }));
            }
        }

        if (data.type === 'chat' && ws.partner) {
            const payload = JSON.stringify({ type: 'chat', sender: ws.userData.username, text: data.text });
            ws.send(payload);
            ws.partner.send(payload);
        }

        if (['offer', 'answer', 'candidate'].includes(data.type) && ws.partner) {
            ws.partner.send(JSON.stringify(data));
        }
    });

    ws.on('close', () => {
        if (waitingUser === ws) waitingUser = null;
        if (ws.partner) {
            ws.partner.send(JSON.stringify({ type: 'system', text: 'disconnected', disconnect: true }));
            ws.partner.partner = null;
        }
    });
});

// Запускаємо на 0.0.0.0, щоб сервер був видимим у локальній Wi-Fi мережі
server.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Сервер запущено!`);
    console.log(`💻 Локально: http://localhost:${PORT}`);
});