const express = require('express');
const https   = require('https');
const fs      = require('fs');
const { Server } = require('socket.io');

const app       = express();
const portHTTPS = 3000;

app.use(express.json());
app.use(express.static('public'));

const options = {
    key:  fs.readFileSync('localhost-key.pem'),
    cert: fs.readFileSync('localhost.pem'),
};

const HTTPSserver = https.createServer(options, app);
const io = new Server(HTTPSserver);


// ============================================================
//  CONSTANTS
// ============================================================

const HEADSTART_MS       = 30 * 1000;        // 30 sec (testing) — change to 3 * 60 * 1000 for real game
const HUNT_MS            = 10 * 60 * 1000;   // 10 min hunt window
const TRAP_RADIUS_M      = 6;                // metres — trap trigger distance
const CATCH_RADIUS_M     = 6;                // metres — fox must be this close to catch
// const CARROT_COUNT       = 4;                // carrots randomly placed per game
// const CARROT_FREEZE_MS   = 15 * 1000;        // how long foxes freeze when carrot is picked up
const TRAP_FREEZE_MS     = 10 * 1000;        // how long a rabbit freezes when trap triggers
const REVEAL_TIMES_MS    = [2, 4, 6, 8, 9].map(m => m * 60 * 1000);
const REVEAL_DURATION_MS = 5 * 1000;

// NOTE FOR TESTING INDOORS: GPS accuracy indoors is ~30-50m.
// TRAP_RADIUS_M=6 and CATCH_RADIUS_M=6 will almost never trigger with that accuracy.
// Temporarily increase both to 30 or 40 for indoor testing, then restore to 6 for the real game.

// const MAP_HALF_SPAN = 0.0015;


// ============================================================
//  GAME STATE
// ============================================================

let gamePhase = 'lobby';

let players = {};   // socketId → { name, role, password, caught, frozenUntil, trapPlaced, position }
let traps   = [];   // [ { id, foxId, lat, lng, triggered } ]
// let carrots = [];   // [ { id, lat, lng, active } ]

let headstartTimeout = null;
let huntTimeout      = null;
let revealTimeouts   = [];
let huntStartTime    = null;


// ============================================================
//  HELPERS
// ============================================================

function haversineDistance(lat1, lng1, lat2, lng2) {
    const R    = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a    = Math.sin(dLat / 2) ** 2
               + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
               * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function generatePassword() { //the random character password
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let pwd = '';
    for (let i = 0; i < 6; i++) pwd += chars[Math.floor(Math.random() * chars.length)];
    return pwd;
}

function assignRoles() {
    const ids = Object.keys(players);
    for (let i = ids.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const foxCount = Math.max(1, Math.floor(ids.length / 5));
    ids.forEach((id, i) => {
        players[id].role        = i < foxCount ? 'fox' : 'rabbit';
        players[id].password    = players[id].role === 'rabbit' ? generatePassword() : null;
        players[id].caught      = false;
        players[id].frozenUntil = 0;
        players[id].trapPlaced  = false;
    });
}

// function placeCarrots() {
//     // Derive bounds from the centroid of all players who have a known position.
//     const positioned = Object.values(players).filter(p => p.position);
//     let centerLat = 0, centerLng = 0;
//     if (positioned.length > 0) {
//         centerLat = positioned.reduce((s, p) => s + p.position.lat, 0) / positioned.length;
//         centerLng = positioned.reduce((s, p) => s + p.position.lng, 0) / positioned.length;
//     }
//     const bounds = {
//         minLat: centerLat - MAP_HALF_SPAN,
//         maxLat: centerLat + MAP_HALF_SPAN,
//         minLng: centerLng - MAP_HALF_SPAN,
//         maxLng: centerLng + MAP_HALF_SPAN,
//     };
//
//     carrots = [];
//     for (let i = 0; i < CARROT_COUNT; i++) {
//         carrots.push({
//             id:     'carrot_' + i,
//             lat:    bounds.minLat + Math.random() * (bounds.maxLat - bounds.minLat),
//             lng:    bounds.minLng + Math.random() * (bounds.maxLng - bounds.minLng),
//             active: true,
//         });
//     }
// }

function countUncaughtRabbits() {
    return Object.values(players).filter(p => p.role === 'rabbit' && !p.caught).length;
}

function rabbitsSummary() {
    return Object.entries(players)
        .filter(([, p]) => p.role === 'rabbit')
        .map(([socketId, p]) => ({ id: socketId, name: p.name, caught: p.caught }));
}

function buildLobbyUpdate() {
    const playerList = Object.values(players).map(p => ({ name: p.name }));
    return { players: playerList, canStart: playerList.length >= 2 };
}

// Send a role-filtered position snapshot to one player.
// BUG FIX: includes rabbitNearby flag for foxes so client can enable Catch Rabbit button.
function emitPositionUpdateTo(socketId) {
    const me = players[socketId];
    if (!me || !me.role) return;

    // same-role teammates (excluding self)
    const visiblePlayers = {};
    for (const [id, p] of Object.entries(players)) {
        if (id === socketId)    continue;
        if (p.role !== me.role) continue;
        if (!p.position)        continue;
        visiblePlayers[id] = { lat: p.position.lat, lng: p.position.lng, name: p.name };
    }

    const visibleTraps = me.role === 'fox'
        ? traps.filter(t => !t.triggered)
        : [];

    // const visibleCarrots = me.role === 'rabbit'
    //     ? carrots.filter(c => c.active)
    //     : [];
    const visibleCarrots = [];

    // BUG FIX: compute whether any uncaught rabbit is within catch range of this fox.
    // Without this flag the client has no way to enable the Catch Rabbit button.
    let rabbitNearby = false;
    if (me.role === 'fox' && me.position) {
        for (const [id, p] of Object.entries(players)) {
            if (p.role !== 'rabbit' || p.caught || !p.position) continue;
            const dist = haversineDistance(
                me.position.lat, me.position.lng,
                p.position.lat,  p.position.lng
            );
            console.log(`[proximity] ${me.name} → ${p.name}: ${dist.toFixed(1)}m (catch radius: ${CATCH_RADIUS_M}m)`);
            if (dist <= CATCH_RADIUS_M) {
                rabbitNearby = true;
                console.log(`[proximity] RABBIT IN RANGE: ${p.name} is ${dist.toFixed(1)}m away`);
                break;
            }
        }
    }

    io.to(socketId).emit('positionUpdate', {
        visiblePlayers,
        visibleTraps,
        visibleCarrots,
        frozenUntil:  me.frozenUntil,
        rabbits:      rabbitsSummary(),
        rabbitNearby,
    });
}

// BUG FIX: also checks rabbit proximity to each fox so foxes get
// updated rabbitNearby status whenever a rabbit moves.
function notifyAllFoxesOfRabbitMove() {
    for (const [foxId, fox] of Object.entries(players)) {
        if (fox.role === 'fox') emitPositionUpdateTo(foxId);
    }
}

function checkTrapTriggers(rabbitSocketId) {
    const rabbit = players[rabbitSocketId];
    if (!rabbit || !rabbit.position) return; 

    if (traps.length === 0) {
        console.log(`[trap] ${rabbit.name}: no traps on the field`);
        return;
    }

    for (const trap of traps) {
        if (trap.triggered) continue;

        const dist = haversineDistance(
            rabbit.position.lat, rabbit.position.lng,
            trap.lat, trap.lng
        );
        console.log(`[trap] ${rabbit.name} → trap_${trap.foxId.slice(0,6)}: ${dist.toFixed(1)}m (trigger radius: ${TRAP_RADIUS_M}m)`);

        if (dist <= TRAP_RADIUS_M) {
            trap.triggered     = true;
            rabbit.frozenUntil = Date.now() + TRAP_FREEZE_MS;

            io.to(rabbitSocketId).emit('trapTriggered', { freezeUntil: rabbit.frozenUntil });
            io.to(trap.foxId).emit('trapSprang', { rabbitName: rabbit.name });

            console.log(`[trap] SPRUNG: ${rabbit.name} frozen for ${TRAP_FREEZE_MS / 1000}s`);
        }
    }
}

function checkWinCondition() {
    if (gamePhase !== 'active') return;
    if (countUncaughtRabbits() === 0) endGame('foxes');
}

function startHunt() {
    gamePhase     = 'active';
    huntStartTime = Date.now();
    io.emit('huntBegin', { huntDurationMs: HUNT_MS });
    console.log('Hunt started.');

    for (const id of Object.keys(players)) {
        emitPositionUpdateTo(id);
    }

    revealTimeouts = REVEAL_TIMES_MS.map(delay =>
        setTimeout(() => {
            const allPositions = {};
            for (const [id, p] of Object.entries(players)) {
                if (p.position) {
                    allPositions[id] = {
                        lat:  p.position.lat,
                        lng:  p.position.lng,
                        name: p.name,
                        role: p.role,
                    };
                }
            }
            io.emit('allPlayersVisible', allPositions);
            console.log('All-players reveal fired.');
            setTimeout(() => io.emit('allPlayersHidden'), REVEAL_DURATION_MS);
        }, delay)
    );

    huntTimeout = setTimeout(() => endGame('rabbits'), HUNT_MS);
}

function endGame(winner) {
    gamePhase = 'ended';
    clearAllTimers();
    const summary = Object.values(players).map(p => ({
        name:   p.name,
        role:   p.role,
        caught: p.caught ?? false,
    }));
    io.emit('gameEnded', { winner, summary });
    console.log('Game over. Winner:', winner);
}

function clearAllTimers() {
    if (headstartTimeout) { clearTimeout(headstartTimeout); headstartTimeout = null; }
    if (huntTimeout)      { clearTimeout(huntTimeout);      huntTimeout      = null; }
    revealTimeouts.forEach(t => clearTimeout(t));
    revealTimeouts = [];
}

function resetGame() {
    clearAllTimers();
    gamePhase     = 'lobby';
    players       = {};
    traps         = [];
    // carrots       = [];
    huntStartTime = null;
}


// ============================================================
//  SOCKET.IO
// ============================================================

io.on('connection', (socket) => {
    console.log('connected:', socket.id, '| gamePhase:', gamePhase);

    // Immediately send current state to this socket so it never shows stale data.
    // This fixes the host/player page seeing "0 players" after a page load or reconnect.
    if (gamePhase === 'lobby') {
        socket.emit('lobbyUpdate', buildLobbyUpdate());
    }

    // ── RECONNECTION RECOVERY ─────────────────────────────
    // When a socket drops and reconnects, socket.io assigns a NEW socket ID.
    // The old ID was deleted from players by the disconnect handler.
    // The client emits 'rejoinLobby' with the player's name so the server can
    // re-register them and they receive future targeted events (roleAssigned, etc.).
    socket.on('rejoinLobby', ({ name }) => {
        if (gamePhase !== 'lobby') {
            console.log(`[rejoin] ${name} tried to rejoin but gamePhase is ${gamePhase} — ignoring`);
            return;
        }
        // Avoid duplicate entries: remove any stale entry with the same name
        for (const [id, p] of Object.entries(players)) {
            if (p.name === name && id !== socket.id) {
                console.log(`[rejoin] removing stale entry for ${name} (${id})`);
                delete players[id];
            }
        }
        players[socket.id] = {
            name:        name.trim().substring(0, 20),
            role:        null,
            password:    null,
            caught:      false,
            frozenUntil: 0,
            trapPlaced:  false,
            position:    null,
        };
        console.log(`[rejoin] ${name} re-registered as ${socket.id}. Total: ${Object.keys(players).length}`);
        io.emit('lobbyUpdate', buildLobbyUpdate());
    });

    socket.on('joinGame', ({ name }) => {
        if (gamePhase !== 'lobby') return;
        players[socket.id] = {
            name:        name.trim().substring(0, 20),
            role:        null,
            password:    null,
            caught:      false,
            frozenUntil: 0,
            trapPlaced:  false,
            position:    null,
        };
        console.log(`${name} joined. Total: ${Object.keys(players).length}`);
        io.emit('lobbyUpdate', buildLobbyUpdate());
    });

    socket.on('startGame', () => {
        if (gamePhase !== 'lobby') return;
        if (Object.keys(players).length < 2) return;

        assignRoles();
        // placeCarrots();
        gamePhase = 'headstart';

        for (const [id, p] of Object.entries(players)) {
            io.to(id).emit('roleAssigned', {
                role:        p.role,
                password:    p.password,
                headstartMs: HEADSTART_MS,
            });
        }

        const roleList = Object.values(players).map(p => ({ name: p.name, role: p.role }));
        io.emit('roleListReveal', roleList);
        io.emit('gameStarted', { players: roleList });

        for (const id of Object.keys(players)) {
            emitPositionUpdateTo(id);
        }

        headstartTimeout = setTimeout(startHunt, HEADSTART_MS);
        console.log('Roles assigned. Headstart begun.');
    });

    socket.on('myPosition', ({ lat, lng }) => {
        const p = players[socket.id];
        if (!p) return;
        p.position = { lat, lng };
        console.log(`[pos] ${p.name} (${p.role ?? 'no role'}): ${lat.toFixed(5)}, ${lng.toFixed(5)}`);

        if (gamePhase === 'active' && p.role === 'rabbit') {
            checkTrapTriggers(socket.id);
            // BUG FIX: when a rabbit moves, push fresh proximity updates to all foxes
            // so their Catch Rabbit button reflects the new distance.
            notifyAllFoxesOfRabbitMove();
        }

        if (gamePhase === 'headstart' || gamePhase === 'active') {
            emitPositionUpdateTo(socket.id);
        }
    });

    socket.on('placeTrap', ({ lat, lng }) => {
        const p = players[socket.id];
        if (!p || p.role !== 'fox' || gamePhase !== 'active') return;
        if (p.trapPlaced) { console.log(`[trap] ${p.name} already placed their trap`); return; }

        const trap = { id: 'trap_' + socket.id, foxId: socket.id, lat, lng, triggered: false };
        traps.push(trap);
        p.trapPlaced = true;
        console.log(`[trap] ${p.name} placed trap at ${lat.toFixed(6)}, ${lng.toFixed(6)}`);

        for (const [id, player] of Object.entries(players)) {
            if (player.role === 'fox') io.to(id).emit('trapPlaced', trap);
        }

        // BUG FIX: immediately check if any rabbit is already standing on this new trap.
        // Previously this was never done — traps only checked on rabbit position updates.
        console.log('[trap] checking all rabbit positions against new trap...');
        for (const [rabbitId, rabbit] of Object.entries(players)) {
            if (rabbit.role === 'rabbit' && !rabbit.caught && rabbit.position) {
                checkTrapTriggers(rabbitId);
            }
        }
    });

    // socket.on('pickupCarrot', ({ carrotId }) => {
    //     const p = players[socket.id];
    //     if (!p || p.role !== 'rabbit' || gamePhase !== 'active') return;
    //
    //     const carrot = carrots.find(c => c.id === carrotId && c.active);
    //     if (!carrot) { console.log(`[carrot] ${p.name}: carrot ${carrotId} not found or inactive`); return; }
    //
    //     if (p.position) {
    //         const dist = haversineDistance(p.position.lat, p.position.lng, carrot.lat, carrot.lng);
    //         console.log(`[carrot] ${p.name} → carrot: ${dist.toFixed(1)}m`);
    //         if (dist > CATCH_RADIUS_M) {
    //             console.log(`[carrot] too far: ${dist.toFixed(1)}m > ${CATCH_RADIUS_M}m`);
    //             return;
    //         }
    //     }
    //
    //     carrot.active = false;
    //     const freezeUntil = Date.now() + CARROT_FREEZE_MS;
    //
    //     for (const [id, player] of Object.entries(players)) {
    //         if (player.role === 'fox') {
    //             player.frozenUntil = freezeUntil;
    //             io.to(id).emit('carrotActivated', { freezeUntil, pickedUpBy: p.name });
    //         }
    //     }
    //     io.emit('carrotPickedUp', { carrotId });
    //     console.log(`[carrot] ${p.name} picked up carrot. Foxes frozen for ${CARROT_FREEZE_MS / 1000}s.`);
    // });

    socket.on('attemptCatch', ({ password }) => {
        const fox = players[socket.id];
        if (!fox || fox.role !== 'fox' || gamePhase !== 'active') return;
        console.log(`[catch] ${fox.name} attempting catch with password: "${password}"`);

        if (fox.frozenUntil > Date.now()) {
            console.log(`[catch] ${fox.name} is frozen (${Math.ceil((fox.frozenUntil - Date.now()) / 1000)}s left)`);
            io.to(socket.id).emit('catchFailed', { reason: 'frozen' });
            return;
        }

        let matchedId     = null;
        let matchedRabbit = null;
        const trimmedPwd  = password.trim().toUpperCase();
        for (const [id, p] of Object.entries(players)) {
            if (p.role !== 'rabbit' || p.caught) continue;
            console.log(`[catch] comparing "${trimmedPwd}" vs ${p.name}'s password "${p.password}"`);
            if (p.password === trimmedPwd) {
                matchedId     = id;
                matchedRabbit = p;
                break;
            }
        }

        if (!matchedRabbit) {
            console.log(`[catch] no password match for "${trimmedPwd}"`);
            io.to(socket.id).emit('catchFailed', { reason: 'wrongPassword' });
            return;
        }
        console.log(`[catch] password matched: ${matchedRabbit.name}`);

        if (fox.position && matchedRabbit.position) {
            const dist = haversineDistance(
                fox.position.lat, fox.position.lng,
                matchedRabbit.position.lat, matchedRabbit.position.lng
            );
            console.log(`[catch] distance ${fox.name} → ${matchedRabbit.name}: ${dist.toFixed(1)}m (radius: ${CATCH_RADIUS_M}m)`);
            if (dist > CATCH_RADIUS_M) {
                console.log(`[catch] FAILED: too far (${dist.toFixed(1)}m)`);
                io.to(socket.id).emit('catchFailed', { reason: 'tooFar' });
                return;
            }
        } else {
            console.log(`[catch] skipping distance check — fox pos: ${!!fox.position}, rabbit pos: ${!!matchedRabbit.position}`);
        }

        matchedRabbit.caught = true;
        io.to(socket.id).emit('catchSuccess', { rabbitName: matchedRabbit.name });
        io.to(matchedId).emit('youWereCaught');
        io.emit('rabbitCaught', {
            rabbitName:  matchedRabbit.name,
            rabbitsLeft: countUncaughtRabbits(),
            rabbits:     rabbitsSummary(),
        });
        console.log(`[catch] SUCCESS: ${fox.name} caught ${matchedRabbit.name}. Uncaught: ${countUncaughtRabbits()}`);
        checkWinCondition();
    });

    socket.on('resetGame', () => {
        resetGame();
        io.emit('gameReset');
        console.log('Game reset to lobby.');
    });

    socket.on('disconnect', () => {
        console.log('disconnected:', socket.id);
        if (!players[socket.id]) return;
        const name = players[socket.id].name;
        delete players[socket.id];
        if (gamePhase === 'lobby') {
            io.emit('lobbyUpdate', buildLobbyUpdate());
        } else if (gamePhase === 'active') {
            io.emit('playerLeft', { name });
            checkWinCondition();
        }
    });
});


// ============================================================
//  REST — quick state peek
// ============================================================

app.get('/gameState', (_req, res) => {
    res.json({
        phase:         gamePhase,
        playerCount:   Object.keys(players).length,
        rabbitsLeft:   countUncaughtRabbits(),
        timeElapsedMs: huntStartTime ? Date.now() - huntStartTime : 0,
        traps:         traps.map(t => ({ id: t.id, triggered: t.triggered, lat: t.lat, lng: t.lng })),
        players:       Object.entries(players).map(([id, p]) => ({
            id: id.slice(0, 6), name: p.name, role: p.role,
            caught: p.caught, hasPos: !!p.position,
        })),
    });
});


// ============================================================
//  START
// ============================================================

HTTPSserver.listen(portHTTPS, () => {
    console.log(`Foxes & Rabbits running on port ${portHTTPS}`);
});
