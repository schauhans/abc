let socket;
if(location.hostname.toLowerCase().startsWith('browsercircus') || location.hostname.toLowerCase().startsWith('www')){
  socket = io({path: "/YOUR-NAME/YOUR-PORT/socket.io"});  // e.g. '/leon/port-4100/socket.io' or '/socket.io'
}else{
  socket = io(); 
}

// let readyButton = document.querySelector("#ready");
let mainWrapper = document.querySelector(".main-wrapper")
let w = window.innerWidth;
let h = window.innerHeight;
let frogs = []

// socket communication

// inform server of my role
socket.emit("my-role", {role: "conductor"});


// handle EXISTING "all frogs"
socket.on("frogs-already-online", function(data){
  console.log("these frogs are already online", data);
  data.forEach(function(frog){
    addFrog(frog.id, frog.frogIdx);
  });
});


// handle new frog
socket.on("new-frog", function(frog){
    console.log("new frog online", frog);
    addFrog(frog.id, frog.frogIdx);
});

// handle deleting frogs
socket.on("frog-disconnected", function(socketID){
    console.log("a frog disconnected", socketID);
    document.querySelector("#A"+socketID).remove();
});

//addFrog("sdfobjweq", 0); // function test

function addFrog(socketID, frogIdx){
    let imgWrapper = document.createElement("div");
    imgWrapper.className = "img-wrap"
    imgWrapper.id = "A"+socketID; // THIS IS IMPORTANT. EVERY FROG's HTML ID is the same as their socket Id
    imgWrapper.style.opacity = 0.3;
    imgElm = document.createElement("img");
    imgElm.src = "../imgs/frog"+frogIdx+".png";
    imgWrapper.append(imgElm)
    mainWrapper.append(imgWrapper);


    // button socket communication:
    imgElm.addEventListener("click", function(){
        // handle opacity of frog button
        if(document.querySelector("#A"+socketID).style.opacity == 0.3){
            document.querySelector("#A"+socketID).style.opacity = 1;
        }else{
            document.querySelector("#A"+socketID).style.opacity = 0.3;
        }

        console.log("clicked frog with socket id", socketID);
        // tell server we pressed the frog

        socket.emit("trigger-frog", socketID);
    })
}
