const express = require('express');
const https = require("https");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = 3000;

// Disable caching so browsers always get the latest JS/HTML during development
app.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
});
app.use(express.static('public'));

// Named routes so URLs don't need .html
app.get('/player', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'player.html'));
});
app.get('/conductor', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'conductor.html'));
});

const options = {
    key: fs.readFileSync("keys-for-local-https/localhost-key.pem"),
    cert: fs.readFileSync("keys-for-local-https/localhost.pem"),
};

const httpsServer = https.createServer(options, app);

const { Server } = require("socket.io");
const io = new Server(httpsServer);

// players: socketId -> { id, playerNum, role, volume }
const players = {};
let playerCounter = 0;

io.on("connection", (socket) => {
    console.log("connected: " + socket.id);

    // Send current player list immediately (so conductor sees existing players on load)
    socket.emit("players_update", Object.values(players));

    // Player registers themselves
    socket.on("player_join", () => {
        playerCounter++;
        players[socket.id] = {
            id: socket.id,
            playerNum: playerCounter,
            role: null,
            volume: 0.8,
        };
        console.log(`Player ${playerCounter} joined`);
        broadcastPlayersUpdate();
    });

    // Conductor assigns a role to a specific player
    socket.on("assign_role", ({ targetId, role }) => {
        if (players[targetId]) {
            players[targetId].role = role;
            io.to(targetId).emit("role_assigned", { role });
            broadcastPlayersUpdate();
        }
    });

    // Conductor sets volume for a specific player (0–1)
    socket.on("set_volume", ({ targetId, volume }) => {
        if (players[targetId]) {
            players[targetId].volume = volume;
            io.to(targetId).emit("volume_set", { volume });
        }
    });

    // Conductor mutes or unmutes a specific player
    socket.on("set_mute", ({ targetId, muted }) => {
        if (players[targetId]) {
            players[targetId].muted = muted;
            io.to(targetId).emit("set_mute", { muted });
            broadcastPlayersUpdate();
        }
    });

    // Conductor stops or resumes all players at once
    socket.on("set_mute_all", ({ muted }) => {
        Object.values(players).forEach(p => { p.muted = muted; });
        io.emit("set_mute", { muted });
        broadcastPlayersUpdate();
    });

    // Conductor applies a scene preset — assigns roles to players in order
    socket.on("apply_preset", ({ roles }) => {
        const playerList = Object.values(players);
        playerList.forEach((player, i) => {
            const role = roles[i % roles.length];
            player.role = role;
            io.to(player.id).emit("role_assigned", { role });
        });
        broadcastPlayersUpdate();
    });

    socket.on("disconnect", () => {
        if (players[socket.id]) {
            console.log(`Player ${players[socket.id].playerNum} disconnected`);
            delete players[socket.id];
            broadcastPlayersUpdate();
        }
    });
});

function broadcastPlayersUpdate() {
    const list = Object.values(players);
    console.log("broadcasting players_update to all —", list.length, "player(s)");
    io.emit("players_update", list);
}

httpsServer.listen(PORT, function () {
    console.log("HTTPS Server started at port", PORT);
});
