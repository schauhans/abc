const express = require('express');
//const http = require('http');
const https = require("https");
//const { Server } = require('socket.io');
const fs = require("fs");
const app = express();
/*const server = http.createServer(app);
const io = new Server(server);*/

const PORT = 4220;

app.use(express.static('public'));

const options = {
    key: fs.readFileSync("keys-for-local-https/localhost-key.pem"),
    cert: fs.readFileSync("keys-for-local-https/localhost.pem"),
};

httpsServer = https.createServer(options, app);

const { Server } = require("socket.io"); //socket.io setup
const io = new Server(httpsServer); 

const memes = {
    "cookie": "assets/cookieMeme.png",
    "ok mijo":"assets/okMijoMeme.png",
    "son": "assets/sonMeme.png",
    "im so scared rn": "assets/imSoScaredRnMeme.png",
    "chat am i muted": "assets/chatAmIMutedMeme.png",
    "twin": "assets/twinMeme.png",
    "u know ball": "assets/uKnowBallMeme.png",
    "pause": "assets/pauseMeme.png",
};

io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('disconnect', () => {
        console.log('A user disconnected');
    });

    //simple message
    socket.on('messageFromClient', (msg) => {
        console.log('Message received: ' + msg.message); //to make sure server received the message
        let msgStored = msg.message;
        io.emit('messageFromServer', {type:"text", ...msg});// Broadcast the message to all clients (appending message to all clients' screens)

        msgStored = msgStored.toLowerCase(); //clear message stored in server after broadcasting
        for (let meme in memes) { //this is to check if the meme is the message, and thens sends img if so
            if(msgStored.includes(meme)) {
                io.emit('messageFromServer', {
                    name: "meme",
                    type: "meme",
                    src: memes[meme],
                    alt: `meme for ${meme}`,
                });
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});