// ============================================================
//  host.js — Foxes & Rabbits host/admin page
//  Connects as a non-player observer. Manages the lobby,
//  starts the game, and monitors live status during the hunt.
// ============================================================

let socket;
if (location.hostname.toLowerCase().startsWith('browsercircus') || location.hostname.toLowerCase().startsWith('www')){
    socket = io({path: "/sanjana/port-4220/socket.io"});  
} else{
    socket = io(); 
}

let huntEndTime  = 0;
let huntTimerInterval = null;


// ════════════════════════════════════════════════════════════
//  HELPERS
// ════════════════════════════════════════════════════════════

function showHostView(id) {
    document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
    document.getElementById(id).classList.remove('hidden');
}

function msToTimer(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(total / 60);
    const s = total % 60;
    return m + ':' + String(s).padStart(2, '0');
}


// ════════════════════════════════════════════════════════════
//  SOCKET EVENTS
// ════════════════════════════════════════════════════════════

// ── lobby ────────────────────────────────────────────────────

socket.on('lobbyUpdate', ({ players, canStart }) => {
    const countEl    = document.getElementById('host-player-count');
    const listEl     = document.getElementById('host-lobby-list');
    const startBtn   = document.getElementById('btn-start-game');
    const hintEl     = document.getElementById('start-game-hint');

    if (countEl) countEl.textContent = players.length + ' players joined';

    if (listEl) {
        listEl.innerHTML = '';
        players.forEach(p => {
            const row       = document.createElement('div');
            row.className   = 'host-player-row';
            row.innerHTML   = `<span>${p.name}</span><span class="small-accent">Waiting...</span>`;
            listEl.appendChild(row);
        });
    }

    if (startBtn) startBtn.disabled = !canStart;
    if (hintEl)   hintEl.style.display = canStart ? 'none' : 'block';
});

// ── game started (roles assigned, headstart begun) ───────────

socket.on('gameStarted', ({ players }) => {
    // switch to game monitoring view
    showHostView('view-host-game');

    const listEl = document.getElementById('host-game-list');
    if (listEl) {
        listEl.innerHTML = '';
        players.forEach(p => {
            const row     = document.createElement('div');
            row.className = 'host-player-row';
            row.id        = 'host-row-' + p.name.replace(/\s+/g, '-');
            row.innerHTML =
                `<span>${p.name}</span>` +
                `<span class="role-${p.role}">${p.role === 'fox' ? 'Fox' : 'Rabbit'}</span>`;
            listEl.appendChild(row);
        });
    }
});

// ── hunt begins ───────────────────────────────────────────────

socket.on('huntBegin', ({ huntDurationMs }) => {
    huntEndTime = Date.now() + huntDurationMs;

    // tick the host timer every second
    if (huntTimerInterval) clearInterval(huntTimerInterval);
    huntTimerInterval = setInterval(() => {
        const remaining = Math.max(0, huntEndTime - Date.now());
        const el = document.getElementById('host-hunt-timer');
        if (el) el.textContent = msToTimer(remaining);
        if (remaining <= 0) clearInterval(huntTimerInterval);
    }, 1000);
});

// ── rabbit caught ─────────────────────────────────────────────

socket.on('rabbitCaught', ({ rabbitName, rabbitsLeft, rabbits }) => {
    const leftEl = document.getElementById('host-rabbits-left');
    if (leftEl) leftEl.textContent = rabbitsLeft;

    // mark the rabbit's row as caught
    rabbits.forEach(r => {
        const rowId = 'host-row-' + r.name.replace(/\s+/g, '-');
        const row   = document.getElementById(rowId);
        if (!row) return;
        if (r.caught) {
            // add caught tag if not already there
            if (!row.querySelector('.caught-tag')) {
                const tag       = document.createElement('span');
                tag.className   = 'caught-tag';
                tag.textContent = 'Caught';
                row.appendChild(tag);
            }
        }
    });
});

// ── all-players reveal flash ──────────────────────────────────
// Host doesn't need the overlay, just a subtle indicator
socket.on('allPlayersVisible', () => {
    showToast('All-players reveal active (5 sec)');
});

// ── player disconnected ───────────────────────────────────────

socket.on('playerLeft', ({ name }) => {
    showToast(`${name} disconnected.`);
});

// ── game ended ────────────────────────────────────────────────

socket.on('gameEnded', ({ winner, summary }) => {
    if (huntTimerInterval) clearInterval(huntTimerInterval);
    showHostView('view-host-ended');

    const winnerEl  = document.getElementById('host-winner-text');
    const summaryEl = document.getElementById('host-ended-summary');
    const listEl    = document.getElementById('host-ended-list');

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
            row.className = 'host-player-row';
            const status  = p.role === 'fox' ? 'Fox' : (p.caught ? 'Caught' : 'Survived');
            row.innerHTML =
                `<span>${p.name}</span>` +
                `<span class="role-${p.role}">${status}</span>`;
            listEl.appendChild(row);
        });
    }
});

// ── game reset ────────────────────────────────────────────────

socket.on('gameReset', () => {
    if (huntTimerInterval) clearInterval(huntTimerInterval);
    huntEndTime = 0;
    showHostView('view-host-lobby');
});


// ════════════════════════════════════════════════════════════
//  BUTTON LISTENERS
// ════════════════════════════════════════════════════════════

document.getElementById('btn-start-game').addEventListener('click', () => {
    socket.emit('startGame');
});

document.getElementById('btn-end-game-early').addEventListener('click', () => {
    if (confirm('End the game early? This will declare a winner immediately.')) {
        socket.emit('resetGame');
    }
});

document.getElementById('btn-reset-game').addEventListener('click', () => {
    socket.emit('resetGame');
});


// ════════════════════════════════════════════════════════════
//  TOAST
// ════════════════════════════════════════════════════════════

let toastTimeout;
function showToast(message) {
    let toast = document.getElementById('_host_toast');
    if (!toast) {
        toast    = document.createElement('div');
        toast.id = '_host_toast';
        Object.assign(toast.style, {
            position:     'fixed',
            bottom:       '40px',
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
            maxWidth:     '300px',
            boxShadow:    '0 2px 8px rgba(0,0,0,0.25)',
            display:      'none',
        });
        document.body.appendChild(toast);
    }
    toast.textContent   = message;
    toast.style.display = 'block';
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => { toast.style.display = 'none'; }, 3500);
}
