// Connects to the server, handles role assignment, lobby display, and synchronized playback.

const socket = io();

// ── State ────────────────────────────────────────────────────
let myRole        = null;
let myAudio       = null;
let parts         = []; // { start: ms, end: ms }[] — windows when this part should be unmuted
let autoMuteIdx   = 0;  // tracks which part ends we've already auto-muted at
let scheduleTimer = null;
let audioPlaying  = false; // true once audio.play() is called

// ── Utilities ────────────────────────────────────────────────

function showScreen(id) {
    document.querySelectorAll(".screen").forEach(s => s.classList.add("hidden"));
    document.getElementById(id).classList.remove("hidden");
}

function prettyRole(role) {
    return { violin1: "Violin I", violin2: "Violin II", viola: "Viola", cello: "Cello" }[role] || role;
}

// ── Socket events ────────────────────────────────────────────

// Server assigns this device a role, audio file, and part timing windows.
socket.on("assigned", ({ role, audioSrc, parts: schedule }) => {
    myRole = role;
    parts  = schedule || [];

    myAudio         = new Audio(audioSrc);
    myAudio.preload = "auto";
    myAudio.muted   = true; // starts muted; user click will unmute at each entry

    document.getElementById("your-role-name").textContent = prettyRole(role);
    document.getElementById("perf-role-name").textContent  = prettyRole(role);
});

socket.on("full", () => {
    showScreen("screen-full");
});

// Updates lobby slot cards and switches to performance screen when all 4 are seated.
socket.on("players_update", (occupiedRoles) => {
    ["violin1", "violin2", "viola", "cello"].forEach(role => {
        document.getElementById("slot-" + role)
            .classList.toggle("occupied", occupiedRoles.includes(role));
    });

    const count = occupiedRoles.length;
    document.getElementById("lobby-msg").textContent = count === 4
        ? "All players ready — press the button to start!"
        : `Waiting for players… (${count} / 4)`;

    if (count === 4) showScreen("screen-performance");
});

// Fires on all devices once all 4 have pressed Ready.
// Runs the 3,2,1 overlay, then auto-starts audio (no second tap needed).
socket.on("quartet_ready", ({ startAtMs, countdownSeconds }) => {
    const statusText      = document.getElementById("status-text");
    const overlay         = document.getElementById("countdown-overlay");
    const countdownNumber = document.getElementById("countdown-number");

    statusText.textContent = "Get ready…";

    // Big 3,2,1 overlay — animation restarted each tick via the reflow trick.
    let remaining = countdownSeconds;
    function showNextNumber() {
        if (remaining > 0) {
            overlay.classList.remove("hidden");
            countdownNumber.textContent = remaining;
            countdownNumber.classList.remove("pop");
            void countdownNumber.offsetWidth; // forces reflow so animation restarts
            countdownNumber.classList.add("pop");
            remaining--;
            setTimeout(showNextNumber, 1000);
        } else {
            // Countdown done — audio auto-starts; gesture was already made when Ready was pressed.
            overlay.classList.add("hidden");
            statusText.textContent = "Starting…";
            const msLeft = startAtMs - Date.now();
            setTimeout(() => {
                myAudio.currentTime = 0;
                myAudio.muted = true;
                myAudio.play().catch(err => console.warn("Audio play failed:", err));
                audioPlaying     = true;
                playBtn.disabled = false;
                playBtn.classList.remove("active");
                playBtn.textContent = "♪ Play";
                statusText.textContent = "Audio running — button turns pink when it's your turn!";
                startPartSchedule();
            }, Math.max(0, msLeft));
        }
    }
    showNextNumber();
});

// ── Play button ──────────────────────────────────────────────
const playBtn = document.getElementById("play-btn");

playBtn.addEventListener("click", () => {

    // State 1: before ready — send ready signal to server
    if (!audioPlaying) {
        socket.emit("player_ready");
        playBtn.disabled = true;
        playBtn.classList.add("active");
        playBtn.textContent = "Waiting…";
        document.getElementById("status-text").textContent = "Waiting for all players…";
        return;
    }

    // State 2: audio running — click to unmute at part entry
    if (myAudio && myAudio.muted) {
        myAudio.muted = false;
        playBtn.classList.remove("prompted");
        playBtn.classList.add("active");
        playBtn.textContent = "♪ Playing";
        document.getElementById("status-text").textContent = "Currently playing";
    }
});

// ── Part schedule ────────────────────────────────────────────
// parts format: [{ start: ms, end: ms }, ...]
// Auto-mutes at each end; user must click to unmute at each start.

function startPartSchedule() {
    autoMuteIdx = 0;

    // Fast-forward autoMuteIdx if starting late.
    const startMs = myAudio.currentTime * 1000;
    while (autoMuteIdx < parts.length && startMs >= parts[autoMuteIdx].end) {
        autoMuteIdx++;
    }

    scheduleTimer = setInterval(() => {
        if (!myAudio) return;
        const t = myAudio.currentTime * 1000; // convert to ms to match parts data

        // Auto-mute when we pass the end of a part.
        while (autoMuteIdx < parts.length && t >= parts[autoMuteIdx].end) {
            myAudio.muted = true;
            playBtn.classList.remove("active");
            playBtn.textContent = "♪ Play";
            autoMuteIdx++;
        }

        updateStatusAndButton(t);

        if (myAudio.ended) {
            clearInterval(scheduleTimer);
            document.getElementById("status-text").textContent = "Performance complete";
            playBtn.classList.remove("active", "prompted");
            playBtn.textContent = "Done";
            playBtn.disabled = true;
        }
    }, 100);
}

// Updates status bar and button state based on current playback position.
function updateStatusAndButton(t) {
    if (!myAudio.muted) {
        document.getElementById("status-text").textContent = "Currently playing";
        return;
    }

    const missedEntry = parts.find(p => t >= p.start && t < p.end); // past start, not clicked yet
    const nextPart    = parts.find(p => p.start > t);

    if (missedEntry) {
        document.getElementById("status-text").textContent = "Tap to play!";
        playBtn.classList.add("prompted");
        playBtn.textContent = "♪ Play";
    } else if (nextPart) {
        const secsUntil = Math.ceil((nextPart.start - t) / 1000);
        if (secsUntil <= 5) {
            document.getElementById("status-text").textContent = `Your part in ${secsUntil}s — get ready!`;
            playBtn.classList.add("prompted");
            playBtn.textContent = `♪ ${secsUntil}s`;
        } else {
            document.getElementById("status-text").textContent = `Your part in ${secsUntil}s`;
            playBtn.classList.remove("prompted");
            playBtn.textContent = "♪ Play";
        }
    } else {
        document.getElementById("status-text").textContent = "Resting";
        playBtn.classList.remove("prompted");
    }
}