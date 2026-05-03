const express = require('express');

const https = require("https");
const fs = require("fs");

const app = express();
const portHTTPS = 4220;

app.use(express.static('public'));

const options = {
    key: fs.readFileSync("localhost-key.pem"),
    cert: fs.readFileSync("localhost.pem"),
};

const SPOTIFY_CLIENT_ID = '13c35ccf6c854032a1ae87cf7857a0d0';
const SPOTIFY_CLIENT_SECRET = '37371ede41564a71a38371783eb1af38';

//the following is spotify API stuff to help with autocomplete in the artist section
let spotifyToken = null;
let tokenExpiry = 0;

async function getSpotifyToken() {
    if (spotifyToken && Date.now() < tokenExpiry) return spotifyToken;
    const creds = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
    const res = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${creds}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: 'grant_type=client_credentials'
    });
    const data = await res.json();
    spotifyToken = data.access_token;
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    return spotifyToken;
}

app.get('/api/search-songs', async (req, res) => {
    const query = req.query.q;
    if (!query || query.length < 2) return res.json([]);
    try {
        const token = await getSpotifyToken();
        const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=5`;
        const spotifyRes = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await spotifyRes.json();
        const tracks = data.tracks.items.map(t => ({
            song: t.name,
            artist: t.artists[0].name,
            image: t.album.images[1]?.url || t.album.images[0]?.url || ''
        }));
        res.json(tracks);
    } catch (err) {
        console.error('Spotify song search error:', err);
        res.json([]);
    }
});

app.get('/api/search-artists', async (req, res) => {
    const query = req.query.q;
    if (!query || query.length < 2) return res.json([]);
    try {
        const token = await getSpotifyToken();
        const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=artist&limit=5`;
        const spotifyRes = await fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        const data = await spotifyRes.json();
        const artists = data.artists.items.map(a => a.name);
        res.json(artists);
    } catch (err) {
        console.error('Spotify search error:', err);
        res.json([]);
    }
});

let HTTPSserver = https.createServer(options, app);

const { Server } = require('socket.io');
const io = new Server(HTTPSserver);

// socket.id -> { userId, username, userHue }
let sockets = {};

//use similar to pinsOnMap
let musicResponses = [];
let dataText = fs.readFileSync("musicData.json");
musicResponses = JSON.parse(dataText);

let recsData = [];
recsData = JSON.parse(fs.readFileSync("recsData.json"));


io.on('connection', (socket) => {

    console.log('a user connected', socket.id);

    socket.on("identify", function(data) {
        sockets[socket.id] = data;
        console.log(sockets);
        socket.emit("current-responses", musicResponses);
        socket.emit("current-recs", recsData);
    });

    socket.on("send-rec-from-client", function(data) {
        if (!sockets[socket.id]) return;
        const { toUserId, song, artist, link, note } = data;
        const { userId: fromUserId, username: fromUsername } = sockets[socket.id];
        const rec = { toUserId, fromUserId, fromUsername, song, artist, link, note, timestamp: Date.now() };
        recsData.push(rec);
        fs.writeFileSync("recsData.json", JSON.stringify(recsData, null, 2), 'utf-8');
        io.emit("new-rec", rec);
    });

    socket.on("quiz-response-from-client", function(data) {
        if (!sockets[socket.id]) return;
        console.log("quiz response from client", data);
        const { musicGenres, favoriteSong, favoriteSongArtist, favoriteSongImage, topArtists } = data;
        const { userId, username, userHue } = sockets[socket.id];

        let responseData = {
            musicGenres,
            favoriteSong,
            favoriteSongArtist,
            favoriteSongImage,
            topArtists,
            userId,
            username,
            userHue
        };

        musicResponses.push(responseData);
        console.log("All responses:", musicResponses);
        let dataAsText = JSON.stringify(musicResponses, null, 2);
        fs.writeFileSync("musicData.json", dataAsText, 'utf-8');
        // send new response to everybody
        io.emit("send-all-responses", responseData);
    });

        /*socket.on("location-from-client", function(data){
            console.log("location from client", data);
            const { lat, lng } = data;
            // get userID and name hue
            const { userId, username, userHue } = sockets[socket.id];
            //console.log("User info:", userId, username, userHue)
            // store location along with userdata to json file and location array
    
            let locationData = {
                lat: lat,
                lng: lng,
                userId: userId,
                username: username,
                userHue: userHue
            }
    
            locations.push(locationData);
            console.log("All locations:", locations);
            let dataAsTest = JSON.stringify(locations, null, 2);
            fs.writeFileSync("locationData.json", dataAsTest, 'utf-8')
            // send new location to everybody
            io.emit("send-all-locations", locationData);
    
    
      
        })*/

    socket.on("disconnect", function() {
        console.log("someone disconnected", socket.id);

        // delete user from our records
        delete sockets[socket.id];
        console.log(sockets);

        console.log("online sockets", sockets);
    });

});


HTTPSserver.listen(portHTTPS, function() {
    console.log("HTTPS Server started at port", portHTTPS);
});
