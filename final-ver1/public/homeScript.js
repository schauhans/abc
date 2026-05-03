if (new URLSearchParams(window.location.search).has('reset')) {
    localStorage.clear();
    window.location.href = 'index.html';
}

let userHUEKEY = "user-hue";
let usernameKEY = "user-name";

let hue = localStorage.getItem(userHUEKEY);
let username = localStorage.getItem(usernameKEY);
document.body.style.backgroundColor = "#000000";

const PALETTE = [
    { bg: '#4100F5', accent: '#CDF564' },  // Klein Blue / Citric
    { bg: '#CDF564', accent: '#4100F5' },  // Citric / Klein Blue
    { bg: '#F037A5', accent: '#9BF0E1' },  // Fushia / Aquamarine
    { bg: '#9BF0E1', accent: '#F037A5' },  // Aquamarine / Fushia
    { bg: '#FF4632', accent: '#191414' },  // Tangerine / Black
];

let cardColorIndex = 0;

if (username) {
    document.querySelector("#welcomeMsg").textContent = "Welcome, " + username + "! \n You can click on anyone's profiles to see the songs recs already given and give recs of your own to other users!";
}

function getOrCreateUserId() {
    let userID = localStorage.getItem("user-id");
    if (userID == undefined) {
        userID = crypto.randomUUID();
        localStorage.setItem("user-id", userID);
    }
    return userID;
}

const myUserId = getOrCreateUserId();

// start socket connection
if (location.hostname.toLowerCase().startsWith('browsercircus') || location.hostname.toLowerCase().startsWith('www')){
    socket = io({path: "/sanjana/port-4220/socket.io"});  
} else{
    socket = io(); 
}

let myInfo = {
    userId: myUserId,
    username: username,
    userHue: hue
};

let cardsContainer = document.querySelector("#cardsContainer");
let emptyMsg = document.querySelector("#emptyMsg");

socket.on("connect", function() {
    socket.emit("identify", myInfo);
});

// receive all existing responses on connect
socket.on("current-responses", function(data) {
    cardsContainer.innerHTML = '';
    cardsContainer.appendChild(emptyMsg);
    cardColorIndex = 0;
    for (let response of data) {
        addCard(response);
    }
});

socket.on("new-rec", function(rec) {
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

// receive each new response as it comes in (including the one we just sent)
socket.on("send-all-responses", function(data) {
    addCard(data);
    console.log("New response received from server:", data);
});

function addCard(response) {
    emptyMsg.style.display = "none";

    const color = PALETTE[cardColorIndex % PALETTE.length];
    cardColorIndex++;

    let card = document.createElement("div");
    card.className = "user-card";
    card.style.setProperty('--card-bg', color.bg);
    card.style.setProperty('--card-accent', color.accent);
    card.addEventListener("click", () => {
        window.location.href = `profile.html?userId=${response.userId}`;
    });

    // Header: name + Give a Rec! button
    let header = document.createElement("div");
    header.className = "card-header";

    let nameEl = document.createElement("div");
    nameEl.className = "card-name";
    nameEl.textContent = response.username;
    header.appendChild(nameEl);

    if (response.userId !== myUserId) {
        let giveBtn = document.createElement("button");
        giveBtn.className = "give-song-btn";
        giveBtn.textContent = "♪ Give a Rec!";
        giveBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            window.location.href = `profile.html?userId=${response.userId}&rec=true`;
        });
        header.appendChild(giveBtn);
    }
    card.appendChild(header);

    // Genres
    let genresRow = document.createElement("div");
    genresRow.className = "card-genres-row card-section";
    let genresLabel = document.createElement("span");
    genresLabel.className = "card-label";
    genresLabel.textContent = "Likes:";
    genresRow.appendChild(genresLabel);
    if (response.musicGenres && response.musicGenres.length > 0) {
        let tagsEl = document.createElement("div");
        tagsEl.className = "genre-tags";
        for (let genre of response.musicGenres) {
            let tag = document.createElement("span");
            tag.className = "genre-tag";
            tag.textContent = genre;
            tagsEl.appendChild(tag);
        }
        genresRow.appendChild(tagsEl);
    }
    card.appendChild(genresRow);

    // Fave Song + image placeholder
    let songSection = document.createElement("div");
    songSection.className = "card-section card-song-section";

    let songLeft = document.createElement("div");
    songLeft.className = "card-song-left";

    let songLabel = document.createElement("div");
    songLabel.className = "card-label";
    songLabel.textContent = "Fave Song:";
    songLeft.appendChild(songLabel);

    let songName = document.createElement("div");
    songName.className = "card-song-name";
    songName.textContent = response.favoriteSong || "—";
    songLeft.appendChild(songName);

    if (response.favoriteSongArtist) {
        let songArtist = document.createElement("div");
        songArtist.className = "card-song-artist";
        songArtist.textContent = response.favoriteSongArtist;
        songLeft.appendChild(songArtist);
    }

    songSection.appendChild(songLeft);

    if (response.favoriteSongImage) {
        let img = document.createElement("img");
        img.className = "card-song-img";
        img.src = response.favoriteSongImage;
        img.alt = response.favoriteSong || "";
        songSection.appendChild(img);
    } else {
        let imgPlaceholder = document.createElement("div");
        imgPlaceholder.className = "card-song-img";
        songSection.appendChild(imgPlaceholder);
    }
    card.appendChild(songSection);

    // Top Artists
    if (response.topArtists && response.topArtists.length > 0) {
        let artistsSection = document.createElement("div");
        artistsSection.className = "card-section";

        let artistsLabel = document.createElement("div");
        artistsLabel.className = "card-label";
        artistsLabel.textContent = "Top Artists:";
        artistsSection.appendChild(artistsLabel);

        let ol = document.createElement("ol");
        ol.className = "artist-list";
        for (let artist of response.topArtists) {
            let li = document.createElement("li");
            li.textContent = artist;
            ol.appendChild(li);
        }
        artistsSection.appendChild(ol);
        card.appendChild(artistsSection);
    }

    cardsContainer.appendChild(card);
}
