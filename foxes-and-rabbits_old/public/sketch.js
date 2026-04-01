// ============================================================
//  sketch.js — Foxes & Rabbits
//  p5.js map rendering + all client-side socket/UI logic
// ============================================================

const MAP_ZOOM = 18;       // 18 = very detailed street level (~5 m per pixel)


// ── GPS globals (written by requestGPS.js callbacks) ──────
let currentLatitude  = 0;
let currentLongitude = 0;


// ── GAME STATE ────────────────────────────────────────────
let socket;
let myRole     = null;   // 'fox' | 'rabbit'
let myPassword = null;   // rabbit's unique catch-password (from server)
let myName     = '';

// what the server tells us on each positionUpdate
let visiblePlayers = {};  // { [id]: { lat, lng, name } }  — same-team only
let visibleTraps   = [];  // [ { id, lat, lng } ]           — fox only
// let visibleCarrots = [];  // [ { id, lat, lng, active } ]   — rabbit only
let gameRabbits    = [];  // all rabbits + caught status    — for Players tab

// freeze states
let isFrozen        = false;   // rabbit: stepped on a trap
let freezeEndTime   = 0;
// let carrotFrozen    = false;   // fox: frozen by carrot power-up
// let carrotFreezeEnd = 0;

// all-players-visible reveal (2/4/6/8/9 min marks)
let allVisibleActive  = false;
let allVisiblePlayers = {};  // { [id]: { lat, lng, name, role } }

// hunt end timestamp (mirrors server)
let huntEndTime = 0;

// set to true when huntBegin fires — allows map to init even before GPS fix
let shouldInitMap = false;

// smoothed screen positions for each visible entity (lerped like class examples)
let playerPixels = {}; // { [id]: { x, y, goalX, goalY } }


// ── MAPPA / LEAFLET ───────────────────────────────────────
// Using the same Autonavi satellite tile URL as gps-just-map / gps-see-everyone.
// style=6 = satellite+road hybrid. Change to style=7 for road-only.
let mappa = new Mappa('Leaflet');
let myMap;
let canvas;
let mapInit = false;

const mappa_options = {
    lat:   0,
    lng:   0,
    zoom:  MAP_ZOOM,
    style: 'https://webst01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=6&x={x}&y={y}&z={z}',
};

// My own dot position (lerped, same pattern as class examples)
let myX = -999, myY = -999, myGoalX = -999, myGoalY = -999;


// ── p5: SETUP ─────────────────────────────────────────────
function setup() {
    console.log('[setup] p5 setup() running');
    canvas = createCanvas(windowWidth, windowHeight);
    canvas.parent('p5-canvas-container');
    textFont('sans-serif');
    frameRate(30);

    console.log('[setup] canvas created:', canvas.width, 'x', canvas.height);
    console.log('[setup] connecting socket...');
    
    if (location.hostname.toLowerCase().startsWith('browsercircus') || location.hostname.toLowerCase().startsWith('www')){
        socket = io({path: "/sanjana/port-4220/socket.io"});  
    } else{
     socket = io();
    } 


    socket.on('connect', () => {
        console.log('[socket] connected, id:', socket.id);
        // On reconnect: if the player already has a name and is in the lobby view,
        // re-register with the server. This fixes "stuck in lobby after network blip":
        // socket.io assigns a new socket ID on reconnect, so the server's player record
        // (keyed by the old ID) was deleted. Re-emitting rejoinLobby restores it.
        const inLobby = !document.getElementById('view-lobby').classList.contains('hidden');
        if (myName && inLobby) {
            console.log('[socket] reconnected in lobby — re-registering as:', myName);
            socket.emit('rejoinLobby', { name: myName });
        }
    });

    socket.on('disconnect', (reason) => {
        console.log('[socket] disconnected, reason:', reason);
        showToast('Connection lost — reconnecting...');
    });

    socket.on('reconnect', (attempt) => {
        console.log('[socket] reconnected after', attempt, 'attempt(s)');
    });


    // ════════════════════════════════════════════════════
    //  SOCKET EVENTS
    // ════════════════════════════════════════════════════

    // ── lobby ─────────────────────────────────────────────

    socket.on('lobbyUpdate', ({ players }) => {
        const countEl = document.getElementById('lobby-player-count');
        const listEl  = document.getElementById('lobby-player-list');
        if (countEl) countEl.textContent = players.length + ' players...';
        if (listEl) {
            listEl.innerHTML = '';
            players.forEach(p => {
                const item       = document.createElement('div');
                item.className   = 'lobby-player-item';
                item.textContent = p.name;
                listEl.appendChild(item);
            });
        }
    });

    // ── role reveal ───────────────────────────────────────

    socket.on('roleAssigned', ({ role, password, headstartMs }) => {
        myRole     = role;
        myPassword = password;

        const titleEl     = document.getElementById('role-title');
        const descEl      = document.getElementById('role-description');
        const pwdSect     = document.getElementById('rabbit-password-section');
        const pwdEl       = document.getElementById('player-password');
        const caughtPwdEl = document.getElementById('caught-password-display');

        if (titleEl) {
            titleEl.textContent = role === 'fox' ? 'Fox!' : 'Rabbit!';
            titleEl.style.color = role === 'fox' ? 'var(--orange)' : 'var(--light-blue)';
        }
        if (descEl) {
            descEl.textContent = role === 'fox'
                ? 'Wait until the timer is up to go & catch the rabbits!'
                : 'You have 3 minutes headstart — get away from the foxes!';
        }
        if (pwdSect)                   pwdSect.classList.toggle('hidden', role !== 'rabbit');
        if (pwdEl && password)         pwdEl.textContent       = password;
        if (caughtPwdEl && password)   caughtPwdEl.textContent = password;

        // headstart countdown on the reveal screen
        let remaining = headstartMs;
        const timerEl = document.getElementById('reveal-timer');
        const tick    = setInterval(() => {
            remaining -= 1000;
            if (timerEl) timerEl.textContent = msToTimer(Math.max(0, remaining));
            if (remaining <= 0) clearInterval(tick);
        }, 1000);

        showView('view-reveal');
    });

    socket.on('roleListReveal', (roleList) => {
        const listEl = document.getElementById('reveal-player-list');
        if (!listEl) return;
        listEl.innerHTML = '';
        roleList.forEach(p => {
            const item     = document.createElement('div');
            item.className = 'player-role-item';
            item.innerHTML =
                `<span>${p.name}</span>` +
                `<span class="role-tag-${p.role}">${p.role === 'fox' ? 'Fox' : 'Rabbit'}</span>`;
            listEl.appendChild(item);
        });
    });

    // ── hunt starts ───────────────────────────────────────

    socket.on('huntBegin', ({ huntDurationMs }) => {
        console.log('[huntBegin] received, huntDurationMs:', huntDurationMs);
        huntEndTime   = Date.now() + huntDurationMs;
        shouldInitMap = true; // draw() will init map on next requestAnimationFrame
        showToast('Hunt started — loading map...');

        if (myRole === 'fox') {
            document.getElementById('fox-controls').classList.remove('hidden');
            document.getElementById('rabbits-left-bar').classList.remove('hidden');
        } else {
            document.getElementById('rabbit-controls').classList.remove('hidden');
        }

        showView('view-game');

        // hunt timer via setInterval (reliable on iOS Safari)
        const timerEl = document.getElementById('hunt-timer');
        const huntInterval = setInterval(() => {
            const remaining = Math.max(0, huntEndTime - Date.now());
            if (timerEl) timerEl.textContent = msToTimer(remaining);
            if (remaining <= 0) clearInterval(huntInterval);
        }, 500);
    });

    // ── position update ───────────────────────────────────
    // server sends this back every time we emit 'myPosition'

    socket.on('positionUpdate', (data) => {
        console.log('[positionUpdate] players:', Object.keys(data.visiblePlayers || {}).length,
                    '| traps:', (data.visibleTraps || []).length,
                    // '| carrots:', (data.visibleCarrots || []).length,
                    '| rabbits:', (data.rabbits || []).length,
                    '| rabbitNearby:', data.rabbitNearby);
        visiblePlayers = data.visiblePlayers || {};
        visibleTraps   = data.visibleTraps   || [];
        // visibleCarrots = data.visibleCarrots || [];
        gameRabbits    = data.rabbits        || [];

        if (myRole === 'fox') {
            // Lock place-trap button once the server echoes our trap back
            const myTrapExists = visibleTraps.some(t => t.id === 'trap_' + socket.id);
            if (myTrapExists) {
                const btn = document.getElementById('btn-place-trap');
                if (btn) { btn.disabled = true; btn.textContent = 'Trap Placed ✓'; }
            }

            // Catch button is always enabled for foxes — password alone confirms the catch.
            const catchBtn = document.getElementById('btn-catch-rabbit');
            if (catchBtn) catchBtn.disabled = false;
        }

        updateRabbitsLeftDisplay();
        updatePlayersTab();

        // // Show carrot button only when rabbit is within ~8 m of an active carrot
        // if (myRole === 'rabbit') {
        //     const carrotBtn = document.getElementById('btn-pickup-carrot');
        //     if (carrotBtn && currentLatitude) {
        //         const nearby = visibleCarrots.some(c =>
        //             c.active && clientDist(currentLatitude, currentLongitude, c.lat, c.lng) <= 8
        //         );
        //         carrotBtn.classList.toggle('hidden', !nearby);
        //     }
        // }
    });

    // ── trap events ───────────────────────────────────────

    socket.on('trapTriggered', ({ freezeUntil }) => {
        isFrozen      = true;
        freezeEndTime = freezeUntil;

        const overlay = document.getElementById('overlay-freeze');
        const countEl = document.getElementById('freeze-countdown');
        if (overlay) overlay.classList.remove('hidden');

        const tick = setInterval(() => {
            const secs = Math.max(0, Math.ceil((freezeEndTime - Date.now()) / 1000));
            if (countEl) countEl.textContent = secs;
            if (secs <= 0) {
                clearInterval(tick);
                isFrozen = false;
                if (overlay) overlay.classList.add('hidden');
            }
        }, 500);
    });

    socket.on('trapSprang', ({ rabbitName }) => {
        showToast(`Your trap caught ${rabbitName}! They are frozen for 10 seconds.`);
    });

    socket.on('trapPlaced', (trap) => {
        // server echoes the new trap to all foxes (including the placer)
        if (!visibleTraps.find(t => t.id === trap.id)) visibleTraps.push(trap);
    });

    // // ── carrot events ─────────────────────────────────────

    // socket.on('carrotActivated', ({ freezeUntil, pickedUpBy }) => {
    //     carrotFrozen    = true;
    //     carrotFreezeEnd = freezeUntil;
    //
    //     const banner   = document.getElementById('banner-carrot-active');
    //     const catchBtn = document.getElementById('btn-catch-rabbit');
    //     if (banner) {
    //         banner.textContent = `${pickedUpBy} picked up a carrot — you are frozen!`;
    //         banner.classList.remove('hidden');
    //     }
    //     if (catchBtn) catchBtn.disabled = true;
    //
    //     const tick = setInterval(() => {
    //         if (Date.now() >= carrotFreezeEnd) {
    //             clearInterval(tick);
    //             carrotFrozen = false;
    //             if (banner)   banner.classList.add('hidden');
    //             if (catchBtn) catchBtn.disabled = false;
    //         }
    //     }, 500);
    // });

    // socket.on('carrotPickedUp', ({ carrotId }) => {
    //     visibleCarrots = visibleCarrots.filter(c => c.id !== carrotId);
    // });

    // ── all-players reveal ────────────────────────────────

    socket.on('allPlayersVisible', (allPlayers) => {
        console.log('[allPlayersVisible] showing', Object.keys(allPlayers).length, 'players');
        allVisibleActive  = true;
        allVisiblePlayers = allPlayers;
        const overlay = document.getElementById('overlay-all-visible');
        if (overlay) overlay.classList.remove('hidden');
        showToast('ALL PLAYERS VISIBLE for 5s');
    });

    socket.on('allPlayersHidden', () => {
        allVisibleActive  = false;
        allVisiblePlayers = {};
        const overlay = document.getElementById('overlay-all-visible');
        if (overlay) overlay.classList.add('hidden');
    });

    // ── catch results ─────────────────────────────────────

    socket.on('catchSuccess', ({ rabbitName }) => {
        document.getElementById('overlay-catch').classList.add('hidden');
        showToast(`You caught ${rabbitName}!`);
    });

    socket.on('catchFailed', ({ reason }) => {
        const messages = {
            wrongPassword: 'Wrong password — try again.',
            // frozen:        'You are frozen! A carrot was just picked up.',
            invalid:       'That rabbit is already caught.',
        };
        showToast(messages[reason] || 'Catch failed.');
    });

    socket.on('youWereCaught', () => {
        const overlay    = document.getElementById('overlay-caught');
        const heading    = overlay ? overlay.querySelector('h2')             : null;
        const note       = document.getElementById('caught-note');
        const dismissBtn = document.getElementById('btn-dismiss-caught');
        if (heading)    heading.textContent    = 'You\'ve been officially caught!';
        if (note)       note.textContent       = 'Show the fox your password if they need it again.';
        if (dismissBtn) dismissBtn.textContent = 'OK';
        if (overlay)    overlay.classList.remove('hidden');
    });

    socket.on('rabbitCaught', ({ rabbitName, rabbitsLeft, rabbits }) => {
        gameRabbits = rabbits;
        updateRabbitsLeftDisplay(rabbitsLeft);
        updatePlayersTab();
        showToast(`${rabbitName} has been caught!`);
    });

    // ── game over / reset ─────────────────────────────────

    socket.on('gameEnded', ({ winner, summary }) => {
        const winnerEl  = document.getElementById('winner-text');
        const summaryEl = document.getElementById('ended-summary-line');
        const listEl    = document.getElementById('ended-summary-list');

        if (winnerEl) winnerEl.textContent = winner === 'foxes' ? 'Foxes Win!' : 'Rabbits Win!';

        if (summaryEl) {
            const caught = summary.filter(p => p.role === 'rabbit' && p.caught).length;
            const total  = summary.filter(p => p.role === 'rabbit').length;
            summaryEl.textContent = `${caught} of ${total} rabbits were caught.`;
        }

        if (listEl) {
            listEl.innerHTML = '';
            summary.forEach(p => {
                const row     = document.createElement('div');
                row.className = 'summary-item';
                const status  = p.role === 'fox' ? 'Fox' : (p.caught ? 'Caught' : 'Survived');
                row.innerHTML = `<span>${p.name}</span><span>${status}</span>`;
                listEl.appendChild(row);
            });
        }

        showView('view-ended');
    });

    socket.on('gameReset', () => {
        myRole = null; myPassword = null;
        visiblePlayers = {}; visibleTraps = []; // visibleCarrots = [];
        gameRabbits = []; huntEndTime = 0; playerPixels = {};
        shouldInitMap = false;
        // remove the old Leaflet map so it re-inits cleanly next game
        if (mapInit && myMap) {
            myMap.map.remove();
            myMap    = null;
            mapInit  = false;
        }
        showView('view-join');
    });

    socket.on('playerLeft', ({ name }) => showToast(`${name} disconnected.`));


    // ════════════════════════════════════════════════════
    //  BUTTON LISTENERS
    // ════════════════════════════════════════════════════

    // ── join view ─────────────────────────────────────────
    const nameInput = document.getElementById('input-name');
    const checkBox  = document.getElementById('check-location');
    const joinBtn   = document.getElementById('btn-join');

    function checkJoinReady() {
        joinBtn.disabled = !(nameInput.value.trim().length > 0 && checkBox.checked);
    }
    nameInput.addEventListener('input',  checkJoinReady);
    checkBox.addEventListener('change',  checkJoinReady);

    joinBtn.addEventListener('click', () => {
        myName = nameInput.value.trim();
        console.log('[join] joining as:', myName);
        socket.emit('joinGame', { name: myName });
        showView('view-lobby');

        // Request GPS permission immediately so the browser prompt appears now,
        // giving maximum time to get a fix before the game starts.
        console.log('[join] calling requestGPS()');
        requestGPS();
    });

    // ── fox: place trap at current GPS position ───────────
    document.getElementById('btn-place-trap').addEventListener('click', () => {
        if (!currentLatitude || !currentLongitude) {
            showToast('GPS not ready yet — wait a moment.');
            return;
        }
        socket.emit('placeTrap', { lat: currentLatitude, lng: currentLongitude });
    });

    // ── fox: open catch password entry ────────────────────
    document.getElementById('btn-catch-rabbit').addEventListener('click', () => {
        document.getElementById('input-catch-password').value = '';
        document.getElementById('overlay-catch').classList.remove('hidden');
    });

    document.getElementById('btn-submit-catch').addEventListener('click', () => {
        const pwd = document.getElementById('input-catch-password').value.trim();
        if (!pwd) { showToast('Enter the rabbit\'s password.'); return; }
        socket.emit('attemptCatch', { password: pwd });
    });

    document.getElementById('btn-cancel-catch').addEventListener('click', () => {
        document.getElementById('overlay-catch').classList.add('hidden');
    });

    // // ── rabbit: pick up nearest carrot ────────────────────
    // document.getElementById('btn-pickup-carrot').addEventListener('click', () => {
    //     let nearest = null, nearestDist = Infinity;
    //     visibleCarrots.forEach(c => {
    //         if (!c.active) return;
    //         const d = clientDist(currentLatitude, currentLongitude, c.lat, c.lng);
    //         if (d < nearestDist) { nearestDist = d; nearest = c; }
    //     });
    //     if (nearest) socket.emit('pickupCarrot', { carrotId: nearest.id });
    // });

    // ── rabbit: show password to a nearby fox ─────────────
    document.getElementById('btn-show-password').addEventListener('click', () => {
        const overlay = document.getElementById('overlay-caught');
        const heading = overlay ? overlay.querySelector('h2')  : null;
        const note    = document.getElementById('caught-note');
        if (heading) heading.textContent    = 'You have been caught!';
        if (note)    note.textContent       = 'If not, a fox is near — run!';
        document.getElementById('btn-dismiss-caught').textContent = 'Dismiss';
        overlay.classList.remove('hidden');
    });

    document.getElementById('btn-dismiss-caught').addEventListener('click', () => {
        document.getElementById('overlay-caught').classList.add('hidden');
    });

    // ── end screen: play again ────────────────────────────
    document.getElementById('btn-play-again').addEventListener('click', () => {
        socket.emit('resetGame');
        // server's 'gameReset' event will call showView('view-join')
    });
}


// ── p5: DRAW ──────────────────────────────────────────────
// Map init lives here (same pattern as professor's gps-see-everyone).
// draw() runs inside requestAnimationFrame, which fires AFTER the browser
// completes its layout pass — so Leaflet always measures a real container.
function draw() {
    clear();

    // Always draw the debug panel (even before map is ready) so we can see state.
    // This draws over the yellow background when mapInit is false.
    drawDebugPanel();

    // Initialize Leaflet map the first frame after huntBegin fires.
    // draw() runs in requestAnimationFrame — by the time we get here the
    // browser has finished its layout pass and the container has real dimensions.
    if (!mapInit && shouldInitMap) {
        const cont = document.getElementById('p5-canvas-container');
        const cw   = cont ? cont.offsetWidth  : -1;
        const ch   = cont ? cont.offsetHeight : -1;
        console.log('[map init] draw() firing map init — container:', cw, 'x', ch,
                    '| canvas:', canvas.width, 'x', canvas.height,
                    '| GPS:', currentLatitude, currentLongitude);
        showToast('Map init... container ' + cw + 'x' + ch);

        if (cw === 0 || ch === 0) {
            // Container still hasn't got dimensions — skip this frame, try next
            console.warn('[map init] container is 0x0, skipping this frame');
            return;
        }

        // Resize canvas to exactly match the map container.
        // The canvas was created full-screen in setup(); if we leave it that size
        // it overflows the container and sits on top of the HTML controls,
        // intercepting taps even though it looks transparent.
        resizeCanvas(cw, ch);
        console.log('[map init] canvas resized to', cw, 'x', ch);

        try {
            if (currentLatitude !== 0 || currentLongitude !== 0) {
                mappa_options.lat = currentLatitude;
                mappa_options.lng = currentLongitude;
            }
            myMap = mappa.tileMap(mappa_options);
            myMap.overlay(canvas);
            myMap.onChange(updateMapContent);
            mapInit = true;
            console.log('[map init] mappa.tileMap + overlay OK');

            const L = myMap.map;
            L.dragging.disable();
            L.touchZoom.disable();
            L.doubleClickZoom.disable();
            L.scrollWheelZoom.disable();
            L.boxZoom.disable();
            L.keyboard.disable();
            if (L.tap)                L.tap.disable();
            if (L.zoomControl)        L.zoomControl.remove();
            if (L.attributionControl) L.attributionControl.remove();

            const lc = L.getContainer();
            console.log('[map init] Leaflet container:', lc.offsetWidth, 'x', lc.offsetHeight);
            showToast('Map OK ✓  leaflet ' + lc.offsetWidth + 'x' + lc.offsetHeight);
        } catch (err) {
            console.error('[map init] ERROR:', err);
            showToast('Map ERROR: ' + err.message);
        }
        return; // let this frame just init; tiles draw on the next frame
    }

    if (!mapInit) return;

    // ── decide whose positions to draw ────────────────────
    // During the 5-second all-visible reveal, show everyone colour-coded by role.
    // Otherwise show same-team players only.
    const drawPlayers = allVisibleActive ? allVisiblePlayers : visiblePlayers;

    // ── draw teammate / all-visible dots ──────────────────
    for (const id in drawPlayers) {
        const p   = drawPlayers[id];
        const pos = myMap.latLngToPixel(p.lat, p.lng);

        // initialise lerp state on first sight of this player
        if (!playerPixels[id]) {
            playerPixels[id] = { x: pos.x, y: pos.y, goalX: pos.x, goalY: pos.y };
        }
        playerPixels[id].goalX = pos.x;
        playerPixels[id].goalY = pos.y;
        playerPixels[id].x = lerp(playerPixels[id].x, playerPixels[id].goalX, 0.2);
        playerPixels[id].y = lerp(playerPixels[id].y, playerPixels[id].goalY, 0.2);

        push();
        translate(playerPixels[id].x, playerPixels[id].y);

        // during reveal: colour by role; otherwise use team colour
        const dotCol = allVisibleActive
            ? (p.role === 'fox' ? color('#F5CE7F') : color('#8088F5'))
            : (myRole   === 'fox' ? color('#F5CE7F') : color('#8088F5'));

        fill(dotCol);
        stroke('#5B5D75');
        strokeWeight(2);
        circle(0, 0, 10 + sin(frameCount * 0.08) * 1.5);

        noStroke();
        fill('#5B5D75');
        textSize(10);
        textAlign(CENTER, TOP);
        text(p.name, 0, 8);
        pop();
    }

    // ── draw self ─────────────────────────────────────────
    if (currentLatitude && currentLongitude) {
        const myPos = myMap.latLngToPixel(currentLatitude, currentLongitude);
        myGoalX = myPos.x;
        myGoalY = myPos.y;
        if (myX === -999) { myX = myGoalX; myY = myGoalY; } // first-frame snap
        myX = lerp(myX, myGoalX, 0.2);
        myY = lerp(myY, myGoalY, 0.2);

        push();
        translate(myX, myY);
        fill('#5B5D75');
        stroke('white');
        strokeWeight(2.5);
        circle(0, 0, 15 + sin(frameCount * 0.12) * 2);
        noStroke();
        fill('white');
        textSize(10);
        textAlign(CENTER, TOP);
        text('You', 0, 10);
        pop();
    }

    // ── draw traps (fox only) ─────────────────────────────
    // X marker with a dashed trigger-radius circle
    visibleTraps.forEach(t => {
        const pos = myMap.latLngToPixel(t.lat, t.lng);
        push();
        translate(pos.x, pos.y);
        stroke('#F5CE7F');
        strokeWeight(2.5);
        line(-7, -7,  7,  7);
        line( 7, -7, -7,  7);
        noFill();
        strokeWeight(1);
        drawingContext.setLineDash([3, 3]);
        circle(0, 0, metersToPixel(6, currentLatitude || 31.0) * 2);
        drawingContext.setLineDash([]);
        pop();
    });

    // // ── draw carrots (rabbit only) ────────────────────────
    // visibleCarrots.filter(c => c.active).forEach(c => {
    //     const pos = myMap.latLngToPixel(c.lat, c.lng);
    //     push();
    //     translate(pos.x, pos.y);
    //     fill('#F5CE7F');
    //     stroke('#5B5D75');
    //     strokeWeight(1.5);
    //     circle(0, 0, 13);
    //     line(0, -6, 0, -12); // stem
    //     pop();
    // });

    // ── draw fox catch-radius ring ────────────────────────
    // Dashed circle around the fox showing the 6 m catch range
    if (myRole === 'fox' && currentLatitude && currentLongitude) {
        const myPos = myMap.latLngToPixel(currentLatitude, currentLongitude);
        push();
        noFill();
        stroke('#5B5D75');
        strokeWeight(1);
        drawingContext.setLineDash([5, 5]);
        circle(myPos.x, myPos.y, metersToPixel(6, currentLatitude) * 2);
        drawingContext.setLineDash([]);
        pop();
    }
}

// ── DEBUG PANEL ───────────────────────────────────────────
// Small overlay in the bottom-left corner of the map showing live state.
// Remove this once the map is confirmed working.
function drawDebugPanel() {
    const lines = [
        'frame: ' + frameCount,
        'socket: ' + (socket && socket.connected ? 'OK ' + socket.id.slice(0,6) : 'DISCONNECTED'),
        'GPS_GRANTED: ' + GPS_GRANTED,
        'gps calls: ' + (handleNewPosition._callCount || 0),
        'lat: ' + currentLatitude.toFixed(5),
        'lng: ' + currentLongitude.toFixed(5),
        'shouldInit: ' + shouldInitMap,
        'mapInit: ' + mapInit,
        'role: ' + myRole,
    ];
    const x = 8, y = height - 8 - lines.length * 14;
    push();
    noStroke();
    fill(0, 0, 0, 140);
    rect(x - 4, y - 4, 220, lines.length * 14 + 8, 4);
    fill(255, 255, 180);
    textSize(11);
    textAlign(LEFT, TOP);
    textFont('monospace');
    lines.forEach((l, i) => text(l, x, y + i * 14));
    pop();
}


// ── GPS CALLBACK (called by requestGPS.js) ────────────────
// Same pattern as gps-just-map and gps-see-everyone.
function handleNewPosition(pos) {
    const acc = Math.round(pos.coords.accuracy);
    const rawLat = pos.coords.latitude;
    const rawLng = pos.coords.longitude;
    console.log('[GPS] position received — raw:', rawLat, rawLng, '| accuracy:', acc, 'm');

    const lonlat     = fixForChineseMap(pos);
    currentLongitude = lonlat[0];
    currentLatitude  = lonlat[1];
    console.log('[GPS] GCJ-02 corrected:', currentLatitude, currentLongitude);

    // update lobby status indicator
    const statusEl = document.getElementById('lobby-gps-status');
    if (statusEl) {
        statusEl.textContent = 'GPS ready ✓ (' + acc + 'm)';
        statusEl.style.color = 'var(--dark-blue)';
    }

    // toast on first fix, and again every 5th call so we know it's still updating
    handleNewPosition._callCount = (handleNewPosition._callCount || 0) + 1;
    if (handleNewPosition._callCount === 1 || handleNewPosition._callCount % 5 === 0) {
        showToast('GPS #' + handleNewPosition._callCount + '  acc:' + acc + 'm  mapInit:' + mapInit);
    }

    if (socket && socket.connected) {
        socket.emit('myPosition', { lat: currentLatitude, lng: currentLongitude });
    } else {
        console.warn('[GPS] socket not connected, skipping emit');
    }
}

// Called by Mappa's onChange — fires when the map redraws (locked, so rarely).
// All lat→pixel conversions happen in draw() each frame so this stays empty.
function updateMapContent() {}


// ── RESIZE ────────────────────────────────────────────────
function windowResized() {
    const cont = document.getElementById('p5-canvas-container');
    if (cont && cont.offsetWidth > 0 && cont.offsetHeight > 0) {
        resizeCanvas(cont.offsetWidth, cont.offsetHeight);
        if (mapInit) myMap.map.invalidateSize();
    }
}


// ── UI HELPERS ────────────────────────────────────────────

function showView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

// Called by onclick in HTML tab bar
function switchTab(tab) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-btn-' + tab).classList.add('active');
    document.getElementById('tab-' + tab).classList.add('active');
}

function msToTimer(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m + ':' + String(s).padStart(2, '0');
}

// Haversine on the client — for carrot proximity check
function clientDist(lat1, lng1, lat2, lng2) {
    const R    = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a    = Math.sin(dLat / 2) ** 2
               + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
               * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Same formula as gps-just-map: metres → canvas pixels at current zoom level
function metersToPixel(meters, lat) {
    if (!mapInit) return 0;
    const z   = myMap.zoom();
    const mpp = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, z);
    return meters / mpp;
}

function updateRabbitsLeftDisplay(count) {
    if (count === undefined) count = gameRabbits.filter(r => !r.caught).length;
    const el = document.getElementById('rabbits-left-count');
    if (el) el.textContent = count;
}

// Rebuild the Players tab — shows all rabbits + caught status for both roles
function updatePlayersTab() {
    const grid = document.getElementById('players-grid');
    if (!grid) return;
    grid.innerHTML = '';
    gameRabbits.forEach(r => {
        const card     = document.createElement('div');
        card.className = 'player-card';
        card.innerHTML =
            `<div class="player-avatar"></div>` +
            `<div class="player-card-name">${r.name}</div>` +
            `<div class="player-card-status">Caught?: ` +
            `<span class="${r.caught ? 'eliminated' : ''}">${r.caught ? 'Y' : 'N'}</span></div>`;
        grid.appendChild(card);
    });
}

// Inline toast — no library needed
let toastTimeout;
function showToast(message) {
    let toast = document.getElementById('_toast');
    if (!toast) {
        toast    = document.createElement('div');
        toast.id = '_toast';
        Object.assign(toast.style, {
            position:     'fixed',
            bottom:       '110px',
            left:         '50%',
            transform:    'translateX(-50%)',
            background:   '#5B5D75',
            color:        '#F5EB7F',
            fontFamily:   'Faustina, serif',
            fontSize:     '0.95rem',
            padding:      '10px 20px',
            borderRadius: '10px',
            zIndex:       '900',
            textAlign:    'center',
            maxWidth:     '280px',
            boxShadow:    '0 2px 8px rgba(0,0,0,0.25)',
            display:      'none',
        });
        document.body.appendChild(toast);
    }
    toast.textContent    = message;
    toast.style.display  = 'block';
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { toast.style.display = 'none'; }, 3500);
}
