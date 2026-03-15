const socket = io();

//asked ai to help debug connection issues
const statusEl = document.getElementById("socket-status");
const debugEl  = document.getElementById("debug-log");
function log(msg) {
    const line = new Date().toLocaleTimeString() + " — " + msg;
    console.log(line);
    if (debugEl) debugEl.textContent = line + "\n" + debugEl.textContent;
}
socket.on("connect",() => { if (statusEl) { statusEl.textContent = "🟢 Connected (" + socket.id + ")"; statusEl.style.color = "green"; } log("socket connected"); });
socket.on("disconnect",() => { if (statusEl) { statusEl.textContent = "🔴 Disconnected"; statusEl.style.color = "red"; } log("socket disconnected"); });
//socket.on("connect_error",(err) => { log("connect error: " + err.message); });

const ROLES = {
    "birds-rain":  "🌧️ Birds & Rain",
    "handpan1":    "🎵 Handpan I",
    "handpan2":    "🎶 Handpan II",
    "wind-chimes": "🎐 Wind Chimes",
};

// Scene presets — roles are assigned to players in order, cycling if needed
const PRESETS = {
    "Forest":    ["birds-rain", "wind-chimes", "handpan1", "birds-rain"],
    "Zen":       ["handpan1", "handpan2", "wind-chimes", "handpan1"],
    "Rain":      ["birds-rain", "birds-rain", "wind-chimes", "birds-rain"],
    "Handpans":  ["handpan1", "handpan2", "handpan1", "handpan2"],
};

const playerListEl = document.getElementById("player-list");
const noPlayersMsg = document.getElementById("no-players-msg");
const stopAllBtn   = document.getElementById("stop-all-btn");
const resumeAllBtn = document.getElementById("resume-all-btn");
let players = [];
let allMuted = false;

socket.on("players_update", (updatedPlayers) => {
    log("players_update received — " + updatedPlayers.length + " player(s)");
    players = updatedPlayers;
    renderPlayers();
});

// ── Global controls ───────────────────────────────────────────
stopAllBtn.addEventListener("click", () => {
    allMuted = true;
    socket.emit("set_mute_all", { muted: true });
});
resumeAllBtn.addEventListener("click", () => {
    allMuted = false;
    socket.emit("set_mute_all", { muted: false });
});

// Preset buttons
document.querySelectorAll("[data-preset]").forEach(btn => {
    btn.addEventListener("click", () => {
        const presetName = btn.dataset.preset;
        const roles = PRESETS[presetName];
        if (roles) socket.emit("apply_preset", { roles });
    });
});

// ── Render player cards ───────────────────────────────────────
function renderPlayers() {
    playerListEl.innerHTML = "";

    if (players.length === 0) {
        noPlayersMsg.style.display = "block";
        return;
    }
    noPlayersMsg.style.display = "none";

    players.forEach(player => {
        const card = document.createElement("div");
        card.className = "player-card" + (player.muted ? " muted" : "");

        // Header
        const header = document.createElement("div");
        header.className = "player-header";
        header.innerHTML = `
            <span class="player-label">Player ${player.playerNum}</span>
            <span class="player-role-badge ${player.role ? "has-role" : ""}">
                ${player.role ? ROLES[player.role] : "No role"}
            </span>
        `;

        // Role selector
        const roleRow = document.createElement("div");
        roleRow.className = "control-row";
        const roleSelect = document.createElement("select");
        roleSelect.innerHTML = `<option value="">— assign role —</option>`;
        Object.entries(ROLES).forEach(([key, label]) => {
            const opt = document.createElement("option");
            opt.value = key;
            opt.textContent = label;
            if (player.role === key) opt.selected = true;
            roleSelect.appendChild(opt);
        });
        roleSelect.addEventListener("change", () => {
            if (roleSelect.value) socket.emit("assign_role", { targetId: player.id, role: roleSelect.value });
        });
        roleRow.appendChild(roleSelect);

        // Volume slider (works on desktop/Android; iOS ignores JS volume)
        const volRow = document.createElement("div");
        volRow.className = "control-row volume-row";
        const volLabel = document.createElement("span");
        volLabel.className = "vol-label";
        volLabel.textContent = "Vol";
        const volSlider = document.createElement("input");
        volSlider.type  = "range";
        volSlider.min   = 0;
        volSlider.max   = 1;
        volSlider.step  = 0.05;
        volSlider.value = player.volume ?? 0.8;
        const volValue = document.createElement("span");
        volValue.className = "vol-value";
        volValue.textContent = Math.round((player.volume ?? 0.8) * 100) + "%";
        volSlider.addEventListener("input", () => {
            const v = parseFloat(volSlider.value);
            volValue.textContent = Math.round(v * 100) + "%";
            socket.emit("set_volume", { targetId: player.id, volume: v });
        });
        volRow.appendChild(volLabel);
        volRow.appendChild(volSlider);
        volRow.appendChild(volValue);

        // Mute/unmute button (works on all platforms including iOS)
        const muteBtn = document.createElement("button");
        muteBtn.className = "mute-btn" + (player.muted ? " is-muted" : "");
        muteBtn.textContent = player.muted ? "▶ Resume" : "⏸ Mute";
        muteBtn.addEventListener("click", () => {
            socket.emit("set_mute", { targetId: player.id, muted: !player.muted });
        });

        card.appendChild(header);
        card.appendChild(roleRow);
        card.appendChild(volRow);
        card.appendChild(muteBtn);
        playerListEl.appendChild(card);
    });
}
