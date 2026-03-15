
// Unlock audio on first tap
document.addEventListener("click", () => Tone.start(), { once: true });

const socket = io(); // uses the global from /socket.io/socket.io.js
let myNote = null;
const synth = new Tone.Synth().toDestination();

socket.on("assigned", ({ note, instrument }) => {
    myNote = note;
    document.getElementById("role").textContent = instrument;
    document.getElementById("note").textContent = note;
    socket.emit("ready");
});

socket.on("players_update", (players) => {
    document.getElementById("players").innerHTML = players
        .map((p) => `<li>${p.instrument} — ${p.note} ${p.ready ? "✅" : "⏳"}</li>`)
        .join("");
});

socket.on("play_chord", ({ startAt }) => {
    const delay = startAt - Date.now();
    setTimeout(() => {
        synth.triggerAttack(myNote);
        setTimeout(() => synth.triggerRelease(), 8000);
    }, Math.max(0, delay));
});