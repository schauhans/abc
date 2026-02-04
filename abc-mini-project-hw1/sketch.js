let ripples = []; //global var to keep track of ripples still in motion
lastSpawn = 0; //time when last ripple was spawned (start at 0ms)

function setup(){
    let canvas = createCanvas(windowWidth, windowHeight);
    canvas.parent("root");
    background(173, 216, 230); 
    noFill();
}

function addRipples(){
    for(let i = 0; i < touches.length; i++){
        let x = touches[i].x;
        let y = touches[i].y;
        ripples.push({
            x, y, size: 10, alpha: 200
        });
    } 
}

function draw(){

    background(173, 216, 230); //prevent buildup

    for(let r of ripples){
        stroke(255, r.alpha);
        circle(r.x, r.y, r.size);
        r.size += 3;
        r.alpha -= 5;
    }

    ripples.filter(r => r.alpha > 0); //remove ripples that are fully faded out

}

function touchStarted(){
    addRipples();
    return false; //prevent drag (accoding to Chatgpt)
}

function touchMoved(){
    const now = millis(); //updates every couple ms
    if (now - lastSpawn > 50) {
      addRipples();
      lastSpawn = now; //update last spawn time
    }
    return false;
}