const socket = io({ path: '/sanjana/port-4220/socket.io' });

const ROLES = {
    "birds-rain":  { name: "Birds & Rain", image: "assets/birds-rain-img.jpg", loop: "audio/birds-rain-loop.wav" },
    "handpan1":    { name: "Handpan I",    image: "assets/handpan-img.jpg",    loop: "audio/handpan1-loop.wav" },
    "handpan2":    { name: "Handpan II",   image: "assets/handpan-img.jpg",    loop: "audio/handpan2-loop.wav" },
    "wind-chimes": { name: "Wind Chimes",  image: "assets/wind-chimes-img.jpg",loop: "audio/wind-chimes-loop.wav" },
};

const screenWaiting = document.getElementById("screen-waiting");
const screenRole    = document.getElementById("screen-role");
const playerIdEl    = document.getElementById("player-id-display");
const roleBg        = document.getElementById("role-bg");
const roleNameEl    = document.getElementById("role-name");
const audioBtn      = document.getElementById("audio-btn");

// One shared Audio element — reusing it keeps iOS audio unlocked across role changes
const loopAudio = new Audio();
loopAudio.loop = true;
loopAudio.volume = 0.8;

let audioReady = false; // true after user taps the button

// Auto-register on connect so the player appears on the conductor immediately
socket.on("connect", () => {
    socket.emit("player_join");
});

socket.on("players_update", (players) => {
    const me = players.find(p => p.id === socket.id);
    if (me) playerIdEl.textContent = `Player ${me.playerNum}`;
});

socket.on("role_assigned", ({ role }) => {
    const data = ROLES[role];
    if (!data) return;

    // Update the image and name
    roleBg.style.backgroundImage = `url("${data.image}")`;
    roleNameEl.textContent = data.name;
    screenWaiting.classList.add("hidden");
    screenRole.classList.remove("hidden");

    // Swap audio src on the shared element
    loopAudio.pause();
    loopAudio.src = data.loop;
    loopAudio.load();

    // Play immediately if the user already unlocked audio
    if (audioReady) {
        loopAudio.play().catch(err => console.warn("Playback error:", err));
    }
});

socket.on("volume_set", ({ volume }) => {
    loopAudio.volume = volume;
});

socket.on("set_mute", ({ muted }) => {
    if (muted) {
        loopAudio.pause();
    } else if (audioReady) {
        loopAudio.play().catch(err => console.warn("Playback error:", err));
    }
});

// One-time tap to unlock audio on iOS, then play starts
audioBtn.addEventListener("click", () => {
    audioReady = true;
    audioBtn.style.display = "none";
    loopAudio.play().catch(err => console.warn("Playback error:", err)); //Loop the audio to create continuous sound
});
