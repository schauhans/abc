const params = new URLSearchParams(window.location.search);
const targetUserId = params.get('userId');
const showForm = params.get('rec') === 'true';

const userHUEKEY = "user-hue";
const usernameKEY = "user-name";

const hue = localStorage.getItem(userHUEKEY);
const username = localStorage.getItem(usernameKEY);
document.body.style.backgroundColor = "#000000";

const PALETTE = [
    { bg: '#4100F5', accent: '#CDF564' },  // Klein Blue / Citric
    { bg: '#CDF564', accent: '#4100F5' },  // Citric / Klein Blue
    { bg: '#F037A5', accent: '#9BF0E1' },  // Fushia / Aquamarine
    { bg: '#9BF0E1', accent: '#F037A5' },  // Aquamarine / Fushia
    { bg: '#FF4632', accent: '#191414' },  // Tangerine / Black
];


function getOrCreateUserId() {
    let userID = localStorage.getItem("user-id");
    if (userID == undefined) {
        userID = crypto.randomUUID();
        localStorage.setItem("user-id", userID);
    }
    return userID;
}

const myUserId = getOrCreateUserId();

if (location.hostname.toLowerCase().startsWith('browsercircus') || location.hostname.toLowerCase().startsWith('www')) {
    var socket = io({ path: "/sanjana/port-4220/socket.io" });
} else {
    var socket = io();
}

socket.on("connect", function() {
    socket.emit("identify", { userId: myUserId, username: username, userHue: hue });
});

socket.on("current-responses", function(data) {
    const index = data.findIndex(r => r.userId === targetUserId);
    if (index !== -1) {
        renderProfile(data[index], index);
    } else {
        document.querySelector("#profileTitle").textContent = "User not found";
    }
});

socket.on("current-recs", function(data) {
    const filtered = data.filter(r => r.toUserId === targetUserId);
    if (filtered.length > 0) {
        document.querySelector("#noRecsMsg").style.display = "none";
        for (const rec of filtered) addRecCard(rec);
    }
});

socket.on("new-rec", function(rec) {
    if (rec.toUserId !== targetUserId) return;
    document.querySelector("#noRecsMsg").style.display = "none";
    addRecCard(rec);
    if (rec.toUserId === myUserId) showRecNotification();
});

function showRecNotification() {
    let notif = document.getElementById('recNotification');
    if (!notif) {
        notif = document.createElement('div');
        notif.id = 'recNotification';
        notif.textContent = 'Someone has given you a new rec!';
        document.body.appendChild(notif);
    }
    notif.classList.remove('show');
    void notif.offsetWidth;
    notif.classList.add('show');
    setTimeout(() => { notif.classList.remove('show'); }, 4000);
}

function renderProfile(response, index) {
    const card = document.querySelector("#profileCard");
    const color = PALETTE[index % PALETTE.length];
    card.style.setProperty('--card-bg', color.bg);
    card.style.setProperty('--card-accent', color.accent);

    const nameEl = document.createElement("div");
    nameEl.className = "card-name";
    nameEl.textContent = response.username;
    card.appendChild(nameEl);

    // Genres
    const genresRow = document.createElement("div");
    genresRow.className = "card-genres-row card-section";
    const genresLabel = document.createElement("span");
    genresLabel.className = "card-label";
    genresLabel.textContent = "Likes:";
    genresRow.appendChild(genresLabel);
    if (response.musicGenres && response.musicGenres.length > 0) {
        const tagsEl = document.createElement("div");
        tagsEl.className = "genre-tags";
        for (const genre of response.musicGenres) {
            const tag = document.createElement("span");
            tag.className = "genre-tag";
            tag.textContent = genre;
            tagsEl.appendChild(tag);
        }
        genresRow.appendChild(tagsEl);
    }
    card.appendChild(genresRow);

    // Fave Song + image placeholder
    const songSection = document.createElement("div");
    songSection.className = "card-section card-song-section";

    const songLeft = document.createElement("div");
    songLeft.className = "card-song-left";

    const songLabel = document.createElement("div");
    songLabel.className = "card-label";
    songLabel.textContent = "Fave Song:";
    songLeft.appendChild(songLabel);

    const songName = document.createElement("div");
    songName.className = "card-song-name";
    songName.textContent = response.favoriteSong || "—";
    songLeft.appendChild(songName);

    if (response.favoriteSongArtist) {
        const songArtist = document.createElement("div");
        songArtist.className = "card-song-artist";
        songArtist.textContent = response.favoriteSongArtist;
        songLeft.appendChild(songArtist);
    }

    songSection.appendChild(songLeft);

    if (response.favoriteSongImage) {
        const img = document.createElement("img");
        img.className = "card-song-img";
        img.src = response.favoriteSongImage;
        img.alt = response.favoriteSong || "";
        songSection.appendChild(img);
    } else {
        const imgPlaceholder = document.createElement("div");
        imgPlaceholder.className = "card-song-img";
        songSection.appendChild(imgPlaceholder);
    }
    card.appendChild(songSection);

    // Top Artists
    if (response.topArtists && response.topArtists.length > 0) {
        const artistsEl = document.createElement("div");
        artistsEl.className = "card-section";
        const artistsLabel = document.createElement("div");
        artistsLabel.className = "card-label";
        artistsLabel.textContent = "Top Artists:";
        artistsEl.appendChild(artistsLabel);
        const ol = document.createElement("ol");
        ol.className = "artist-list";
        for (const artist of response.topArtists) {
            const li = document.createElement("li");
            li.textContent = artist;
            ol.appendChild(li);
        }
        artistsEl.appendChild(ol);
        card.appendChild(artistsEl);
    }

    document.querySelector("#profileTitle").textContent = response.username + "'s Taste";
    document.title = response.username + "'s Profile";

    if (showForm) {
        document.querySelector("#recFormSection").style.display = "block";
    }
}

function addRecCard(rec) {
    const list = document.querySelector("#recsList");
    const card = document.createElement("div");
    card.className = "rec-card";

    const fromEl = document.createElement("div");
    fromEl.className = "rec-from";
    fromEl.textContent = "From " + (rec.fromUsername || "someone");
    card.appendChild(fromEl);

    const songEl = document.createElement("div");
    songEl.className = "rec-song";
    songEl.textContent = rec.song;
    card.appendChild(songEl);

    if (rec.artist) {
        const artistEl = document.createElement("div");
        artistEl.className = "rec-artist";
        artistEl.textContent = "By " + rec.artist;
        card.appendChild(artistEl);
    }

    if (rec.link) {
        const linkEl = document.createElement("a");
        linkEl.className = "rec-link";
        linkEl.textContent = "Listen ↗";
        linkEl.href = rec.link;
        linkEl.target = "_blank";
        linkEl.rel = "noopener noreferrer";
        card.appendChild(linkEl);
    }

    if (rec.note) {
        const noteEl = document.createElement("div");
        noteEl.className = "rec-note";
        noteEl.textContent = rec.note;
        card.appendChild(noteEl);
    }

    list.appendChild(card);
}

document.querySelector("#recForm").addEventListener("submit", function(e) {
    e.preventDefault();
    const song = document.querySelector("#songInput").value.trim();
    if (!song) return;

    socket.emit("send-rec-from-client", {
        toUserId: targetUserId,
        song: song,
        artist: document.querySelector("#artistInput").value.trim(),
        link: document.querySelector("#linkInput").value.trim(),
        note: document.querySelector("#noteInput").value.trim()
    });

    document.querySelector("#recSubmitBtn").disabled = true;
    document.querySelector("#recForm").style.display = "none";
    document.querySelector("#recSuccessMsg").style.display = "block";
});
