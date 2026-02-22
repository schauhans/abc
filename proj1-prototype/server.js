const express = require('express');

const https = require("https");

const fs = require("fs");
const app = express();
/*const server = http.createServer(app);
const io = new Server(server);*/

const PORT = 3000;//4220; //custom port for class

app.use(express.static('public'));

const options = {
    key: fs.readFileSync("keys-for-local-https/localhost-key.pem"),
    cert: fs.readFileSync("keys-for-local-https/localhost.pem"),
};

httpsServer = https.createServer(options, app);

const { Server } = require("socket.io"); //socket.io setup
const io = new Server(httpsServer);

const CHORD_NOTES = ["G3", "B3", "D4", "G4", "B4", "D5"];

const players = {}; // socketId -> { note, instrument }

const INSTRUMENTS = ["violin", "cello", "flute", "oboe", "clarinet", "horn"];

io.on("connection", (socket) => {

    // Assign the next available note slot (round-robin)
    const playerCount = Object.keys(players).length; //# cilents currently connected
    const noteIndex = playerCount % CHORD_NOTES.length; //wrap around if more than 6 players

    players[socket.id] = {
        note: CHORD_NOTES[noteIndex],
        instrument: INSTRUMENTS[noteIndex],
        noteIndex,
    };

    console.log(`Player joined: ${socket.id} → ${players[socket.id].instrument} playing ${players[socket.id].note}`);

    // Tell this player their assigned note & instrument
    socket.emit("assigned", {
        note: players[socket.id].note,
        instrument: players[socket.id].instrument,
        noteIndex,
    });

    // Tell everyone the full player list has updated
    io.emit("players_update", buildPlayerList());

    // ── Sync: conductor tick ──────────────────────────────────────────
    // When enough players are ready, the server broadcasts a "start" signal.
    // Each client reports ready after loading their instrument sample.
    socket.on("ready", () => {
        players[socket.id].ready = true;
        console.log(`${socket.id} is ready`);

        const allReady = Object.values(players).every((p) => p.ready);
        if (allReady && Object.keys(players).length > 0) {
            // Send a precise future timestamp everyone should start playing at
            const startAt = Date.now() + 2000; // 2 second buffer
            io.emit("play_chord", { startAt });
            console.log(`All ready — chord starts at ${startAt}`);
        }
    });


    socket.on("disconnect", () => {
        console.log(`Player left: ${socket.id}`);
        delete players[socket.id];
        io.emit("players_update", buildPlayerList());
    });
});

function buildPlayerList() {
    return Object.values(players).map(({ note, instrument, noteIndex, ready }) => ({
        note,
        instrument,
        noteIndex,
        ready: !!ready,
    }));
}

httpsServer.listen(PORT, function (req, res) {
    console.log("HTTPS Server started at port", PORT);
});