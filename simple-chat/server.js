const express = require('express');
// const http = require("http"); // we try to make HTTPS work 

const https = require("https");
// to read certificates from the filesystem (fs)
const fs = require("fs");

const app = express(); // the server "app", the server behaviour

const portHTTPS = 3000; // port for https

app.use(express.static('public'));

const options = {
    key: fs.readFileSync("keys-for-local-https/localhost-key.pem"),
    cert: fs.readFileSync("keys-for-local-https/localhost.pem"),
};

httpsServer = https.createServer(options, app);

const { Server } = require("socket.io"); //socket.io setup
const io = new Server(httpsServer); 

io.on("connection", (socket) => {
    console.log("a user connected");
});

httpsServer.listen(portHTTPS, function (req, res) {
    console.log("HTTPS Server started at port", portHTTPS);
});