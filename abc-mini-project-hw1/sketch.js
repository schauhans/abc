let ripples = []; //global var to keep track of ripples still in motion

function setup(){
    let canvas = createCanvas(windowWidth, windowHeight);
    canvas.parent("root");
    background(173, 216, 230); //pink background
}

function draw(){
    for(let r of ripples){
        stroke(0, r.alpha);
        circle(r.x, r.y, r.size);
        r.size += 3;
        r.alpha -= 5;
    }

    ripples.filter(r => r.alpha > 0); //remove ripples that are fully faded out
}

function touchStarted(){
    for(let i = 0; i < touches.length; i++){
        let x = touches[i].x;
        let y = touches[i].y;
        ripples.push({
            x, y, size: 10, alpha: 200
        });
    } 
}