const express = require('express');

const https = require("https");
// to read certificates from the filesystem (fs)
const fs = require("fs");

const app = express(); // the server "app", the server behaviour
const portHTTPS = 3010; // port for https

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

// socket.id -> { userId, username }
let sockets = {};      

let locations = [];
// get locations stored in the json file
let dataText = fs.readFileSync("locationData.json");
locations = JSON.parse(dataText);

io.on('connection', (socket) => {

    // we manage the connection inside here
    console.log('a user connected', socket.id);

    socket.on("identify", function(data){

        // connect username and user id to socket ids
        sockets[socket.id] = data;
        console.log(sockets)

        // send all locations to user
        socket.emit("current-locations", locations);

        
    })

    socket.on("location-from-client", function(data){
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


  
    })

    socket.on("disconnect", function(){
        console.log("someone disconnected", socket.id)

        // delete user from our records
        delete sockets[socket.id];
        console.log(sockets);
        
        console.log("online socket", sockets)
        
    })

})






// Creating servers and make them listen at their ports:

HTTPSserver.listen(portHTTPS, function (req, res) {
    console.log("HTTPS Server started at port", portHTTPS);
});





