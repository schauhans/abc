const express = require('express');

const https = require("https");
// to read certificates from the filesystem (fs)
const fs = require("fs");
const app = express(); // the server "app", the server behaviour
const portHTTPS = 3010; // YOUR port

// returning to the client anything that is
// inside the public folder
app.use(express.static('public'));


// Creating object of key and certificate
// for SSL
const options = {
    key: fs.readFileSync("localhost-key.pem"),
    cert: fs.readFileSync("localhost.pem"),
};

let HTTPSserver = https.createServer(options, app)


const { Server } = require('socket.io'); // include library
const io = new Server(HTTPSserver); // start socket io 

let positions = {}; // map of socket.id -> { lat, lng }

io.on('connection', (socket) => {

    console.log('a user connected', socket.id);

    // send the new user everyone else's last known position
    socket.emit('existingPositions', positions);

    socket.on('myPosition', function(data){
        // store latest position
        positions[socket.id] = { lat: data.lat, lng: data.lng };
        // broadcast to everyone except the sender
        socket.broadcast.emit('otherPosition', { lat: data.lat, lng: data.lng, id: socket.id });
    })

    // DISCONNECT
    socket.on("disconnect", function(){
        console.log("someone disconnected", socket.id)
        delete positions[socket.id];
    })

})



// additional express server endpoints could be made here:



// Creating https server by passing
// options and app object
HTTPSserver.listen(portHTTPS, function (req, res) {
    console.log("HTTPS Server started at port", portHTTPS);
});





