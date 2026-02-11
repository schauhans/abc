console.log("script loaded");

//let socket = io(); //only works w localhost

if (location.hostname.toLowerCase().startsWith('browsercircus') || location.hostname.toLowerCase().startsWith('www')){
    socket = io({path: "/sanjana/port-4220/socket.io"});  
} else{
    socket = io(); 
}

//use eventLIstener for submit of message form
let formElm = document.querySelector("#messageForm");
let msgInput = document.querySelector("#messageInput");
let nameInput = document.querySelector("#nameInput");
let chatThreadList = document.querySelector("#threadWrapper ul");


formElm.addEventListener("submit", function(e){

    let newMsg = msgInput.value;
    let userName = nameInput.value || "unknown";
    msgInput.value = ""; //clears value
    let msgForServer = {
        name: userName,
        message: newMsg
    }
    e.preventDefault();
    socket.emit("messageFromClient", msgForServer);
    //don't append here, append after message is sent back from server
}) ;

socket.on("messageFromServer", function(incomingMsg){
    appendMessage(incomingMsg);
});

//then use socket.on("messageFromServer", function(incomingMsg){
//to listen for messages from server and append them to the message box

function appendMessage(msg){
    let newListItem = document.createElement("li");
    if(msg.type === "meme"){
        newListItem.innerHTML = `
            <span class="sender">${msg.name}</span>:
            <img class="meme" src="${msg.src}" alt="${msg.alt || "meme"}" />
        `;
    }
    else{
        newListItem.innerHTML = `
            <span class="sender">
                ${msg.name}
            </span>: 
            <span>${msg.message}</span>
        `;
    }
    chatThreadList.append(newListItem);
    chatThreadList.scrollTop = chatThreadList.scrollHeight;
    
}