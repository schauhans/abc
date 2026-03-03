const express = require('express');
const https = require("https");
const fs = require("fs");
const app = express();
/*const server = http.createServer(app);
const io = new Server(server);*/

const PORT = 3000; //4220 custom port for class

app.use(express.static('public'));

const options = {
    key: fs.readFileSync("keys-for-local-https/localhost-key.pem"),
    cert: fs.readFileSync("keys-for-local-https/localhost.pem"),
};

httpsServer = https.createServer(options, app);

const { Server } = require("socket.io");
const io = new Server(httpsServer);

// ── Server helpers ───────────────────────────────────────────
const ROLES = ["violin1", "violin2", "viola", "cello"];

// start/end times in milliseconds for when each part should be playing
const partsData = {
    violin1: [
        { start: 320,   end: 10280 },
        { start: 13230, end: 22380 },
        { start: 24110, end: 28330 }
    ],
    violin2: [
        { start: 310,   end: 11220 },
        { start: 13220, end: 17010 },
        { start: 22850, end: 29180 }
    ],
    viola: [
        { start: 10830, end: 16990 },
        { start: 17610, end: 29170 }
    ],
    cello: [
        { start: 13230, end: 17020 },
        { start: 17610, end: 29200 }
    ]
};

const roleToSocketId = Object.fromEntries(ROLES.map((r) => [r, null])); // role -> socket.id
const socketIdToRole = new Map(); // socket.id -> role
const readySocketIds = new Set(); // tracks which sockets have pressed Ready
let performanceStarted = false; // prevents duplicate quartet_ready broadcasts

function getAvailableRole() {
    return ROLES.find((r) => roleToSocketId[r] === null);
}

function broadcastPlayersUpdate() {
    const occupiedRoles = ROLES.filter((r) => roleToSocketId[r] !== null);
    io.emit("players_update", occupiedRoles);
}

function assignRole(socket, role) {
    roleToSocketId[role] = socket.id;
    socketIdToRole.set(socket.id, role);
    console.log(`Assigned ${socket.id} to ${role}`);
    socket.emit("assigned", {
        role,
        audioSrc: `/audio/${role}.mp3`,
        parts: partsData[role]
    });
}

function numOccupied() {
    return ROLES.filter((r) => roleToSocketId[r] !== null).length;
}

function isQuartetFull() {
    return numOccupied() === ROLES.length;
}

// ── Socket.IO handlers ───────────────────────────────────────
io.on("connection", (socket) => {
    console.log("a user connected: " + socket.id);
    let role = getAvailableRole();

    if (!role) {
        socket.emit("full", { message: "Sorry, the game is full. Please try again later." });
        setTimeout(() => {
            if (socket.connected) socket.disconnect(true);
        }, 1000);
        return;
    }

    assignRole(socket, role);
    broadcastPlayersUpdate(io);

    // Once all 4 players press Ready, broadcasts a shared timestamp so audio starts in sync.
    socket.on("player_ready", () => {
        if (!isQuartetFull() || performanceStarted) return;
        readySocketIds.add(socket.id);
        if (readySocketIds.size < ROLES.length) return; // wait for all 4
        performanceStarted = true;
        const countdownSeconds = 3;
        const startAtMs = Date.now() + countdownSeconds * 1000 + 500; // 500ms buffer after countdown
        console.log(`Broadcasting quartet_ready (startAtMs: ${startAtMs})`);
        io.emit("quartet_ready", { startAtMs, countdownSeconds });
    });

    socket.on("disconnect", () => { //disconnect handler to free up role when someone leaves
        const role = socketIdToRole.get(socket.id);
        if (role) {
            roleToSocketId[role] = null;
            socketIdToRole.delete(socket.id);
            readySocketIds.delete(socket.id);
            broadcastPlayersUpdate();
            // Reset so the quartet can start a new performance after reconnecting
            if (!isQuartetFull()) {
                performanceStarted = false;
                readySocketIds.clear();
            }
        }
    });
});

httpsServer.listen(PORT, function () {
    console.log("HTTPS Server started at port", PORT);
});