let userHUEKEY = "user-hue";
let usernameKEY = "user-name";
let quizDoneKEY = "quiz-done";

function assureUserHUE() {
    let hue = localStorage.getItem(userHUEKEY);
    if (hue == undefined) {
        hue = Math.random() * 360;
        localStorage.setItem(userHUEKEY, hue);
    }
}

function getOrCreateUserId() {
    let userID = localStorage.getItem("user-id");
    if (userID == undefined) {
        userID = crypto.randomUUID();
        localStorage.setItem("user-id", userID);
    }
    return userID;
}

assureUserHUE();
let hue = localStorage.getItem(userHUEKEY);
document.body.style.backgroundColor = "#000000";

const PALETTE = [
    { bg: '#4100F5', accent: '#CDF564' },  // Klein Blue / Citric
    { bg: '#CDF564', accent: '#4100F5' },  // Citric / Klein Blue
    { bg: '#F037A5', accent: '#9BF0E1' },  // Fushia / Aquamarine
    { bg: '#9BF0E1', accent: '#F037A5' },  // Aquamarine / Fushia
    { bg: '#FF4632', accent: '#191414' },  // Tangerine / Black
];

const quizColor = PALETTE[Math.floor((hue / 360) * PALETTE.length) % PALETTE.length];
const container = document.querySelector('#center-container');
container.style.setProperty('--card-bg', quizColor.bg);
container.style.setProperty('--card-accent', quizColor.accent);

// if quiz already completed, go straight to home
if (localStorage.getItem(quizDoneKEY)) {
    window.location.href = "home.html";
}

// start socket connection
if (location.hostname.toLowerCase().startsWith('browsercircus') || location.hostname.toLowerCase().startsWith('www')) {
    var socket = io({ path: "/sanjana/port-4220/socket.io" });
} else {
    var socket = io();
}

const myUserId = getOrCreateUserId();

let quizForm = document.querySelector("#quizForm");
quizForm.addEventListener("submit", quizSubmitted);

function quizSubmitted(event) {
    event.preventDefault();

    let username = document.querySelector("#nameInput").value.trim();
    if (!username) return;

    // collect selected genres
    let genreCheckboxes = document.querySelectorAll("#genreGrid input[type=checkbox]:checked");
    let musicGenres = Array.from(genreCheckboxes).map(cb => cb.value);

    let favoriteSong = document.querySelector("#favSongInput").value.trim();

    let artistInputs = document.querySelectorAll(".artistInput");
    let topArtists = Array.from(artistInputs).map(inp => inp.value.trim()).filter(v => v !== "");

    localStorage.setItem(usernameKEY, username);

    let myInfo = {
        userId: myUserId,
        username: username,
        userHue: hue
    };

    // mirror pinsOnMap: emit identify first, then send quiz data
    socket.emit("identify", myInfo);
    socket.emit("quiz-response-from-client", {
        musicGenres: musicGenres,
        favoriteSong: favoriteSong,
        favoriteSongArtist: favSongArtist,
        favoriteSongImage: favSongImage,
        topArtists: topArtists
    });

    document.querySelector("#submitBtn").disabled = true;
    document.querySelector("#submitBtn").textContent = "Sending...";
}

// only redirect once server confirms it received and saved the response
socket.on("send-all-responses", function(data) {
    if (data.userId === myUserId) {
        localStorage.setItem(quizDoneKEY, "true");
        window.location.href = "home.html";
    }
});

let favSongArtist = '';
let favSongImage = '';

function setupSongAutocomplete() {
    const input = document.querySelector('#favSongInput');
    const dropdown = document.createElement('div');
    dropdown.className = 'artist-suggestions';
    dropdown.style.position = 'fixed';
    dropdown.style.zIndex = '10000';
    document.body.appendChild(dropdown);

    function positionDropdown() {
        const rect = input.getBoundingClientRect();
        dropdown.style.top = rect.bottom + 'px';
        dropdown.style.left = rect.left + 'px';
        dropdown.style.width = rect.width + 'px';
    }

    window.addEventListener('scroll', () => {
        if (dropdown.children.length > 0) positionDropdown();
    }, { passive: true });

    let debounceTimer;
    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        favSongArtist = '';
        favSongImage = '';
        const q = input.value.trim();
        if (q.length < 2) { dropdown.innerHTML = ''; return; }

        debounceTimer = setTimeout(async () => {
            let tracks = [];
            try {
                const res = await fetch(`/api/search-songs?q=${encodeURIComponent(q)}`);
                tracks = await res.json();
            } catch (err) {
                console.error('Song autocomplete error:', err);
                return;
            }
            dropdown.innerHTML = '';
            positionDropdown();
            tracks.forEach(track => {
                const item = document.createElement('div');
                item.className = 'song-suggestion-item';

                const nameEl = document.createElement('div');
                nameEl.className = 'suggestion-song-name';
                nameEl.textContent = track.song;

                const artistEl = document.createElement('div');
                artistEl.className = 'suggestion-song-artist';
                artistEl.textContent = track.artist;

                item.appendChild(nameEl);
                item.appendChild(artistEl);

                item.addEventListener('mousedown', () => {
                    input.value = track.song;
                    favSongArtist = track.artist;
                    favSongImage = track.image;
                    dropdown.innerHTML = '';
                });
                dropdown.appendChild(item);
            });
        }, 300);
    });

    input.addEventListener('blur', () => {
        setTimeout(() => { dropdown.innerHTML = ''; }, 150);
    });
}

setupSongAutocomplete();

function setupArtistAutocomplete(input) {
    const dropdown = document.createElement('div');
    dropdown.className = 'artist-suggestions';
    dropdown.style.position = 'fixed';
    dropdown.style.zIndex = '10000';
    document.body.appendChild(dropdown);

    function positionDropdown() {
        const rect = input.getBoundingClientRect();
        dropdown.style.top = rect.bottom + 'px';
        dropdown.style.left = rect.left + 'px';
        dropdown.style.width = rect.width + 'px';
    }

    window.addEventListener('scroll', () => {
        if (dropdown.children.length > 0) positionDropdown();
    }, { passive: true });

    let debounceTimer;
    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const q = input.value.trim();
        if (q.length < 2) { dropdown.innerHTML = ''; return; }

        debounceTimer = setTimeout(async () => {
            const res = await fetch(`/api/search-artists?q=${encodeURIComponent(q)}`);
            const artists = await res.json();
            dropdown.innerHTML = '';
            positionDropdown();
            artists.forEach(name => {
                const item = document.createElement('div');
                item.textContent = name;
                item.addEventListener('mousedown', () => {
                    input.value = name;
                    dropdown.innerHTML = '';
                });
                dropdown.appendChild(item);
            });
        }, 300);
    });

    input.addEventListener('blur', () => {
        setTimeout(() => { dropdown.innerHTML = ''; }, 150);
    });
}

document.querySelectorAll('.artistInput').forEach(setupArtistAutocomplete);
