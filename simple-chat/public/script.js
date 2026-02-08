let socket = io();

let formeElm = document.querySelector("#chatForm");
console.log(formeElm);
let msgInput = document.querySelector("#newMessage");
console.log(msgInput)

// LISTEN FOR NEWLY TYPES MESSAGES, 
// SEND THEM TO THE SERVER
formeElm.addEventListener("submit", function(e){
    console.log("message submitted", msgInput.value);
    let newMsg = msgInput.value;
    //appendMessage(newMsg); // append message to own screen (do later, once server sends it back)
    msgInput.value = ""; // clear input field after submit and save
    e.preventDefault(); // prevent page reload with forms
    // LISTEN FOR NEW MESSAGES FROM SERVER
    // APPEND THEM TO THE MESSAGE BOX
    // AUTO SCROLL TO BOTTOM    
    socket.emit("messageFromClient", newMsg); // send message to server
    // APPEND MESSAGES TO BOX
});



socket.on("messageFromServer", function(incomingMsg){
    appendMessage(incomingMsg);
});



function appendMessage(txt){
    console.log(txt)
    // select list (ul) first
    let chatThreadList = document.querySelector("#threadWrapper ul");
    console.log(chatThreadList)

    // create new list item (li)
    let newListItem = document.createElement("li");
    newListItem.innerText = `${txt.sender}: ${txt.message}`;

    // append new li to the list 
    chatThreadList.append(newListItem);

    // scroll to bottom of textbox:
    chatThreadList.scrollTop = chatThreadList.scrollHeight;
}

// OPTIONAL: LISTEN FOR NEW NAME
// SEND IT TO SERVER
