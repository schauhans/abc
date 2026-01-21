function setup() {
  let canvas = createCanvas(windowWidth, windowHeight);
  canvas.parent("p5-canvas-container");
  background(255, 209, 220);
}

function draw() {
  //background(90, 200, 190);
  
  fill(0);
  circle(width/2, height/2, 50);

}

// P5 touch events: https://p5js.org/reference/#Touch

function touchStarted() {

  console.log(touches);
  //let x = touches[0].x;
  //let y = touches[0].y;
  //circle(x, y, 100);

  for(let i = 0; i < touches.length; i++){
    let x = touches[i].x;
    let y = touches[i].y;
    circle(x, y, 50);
  }
}

function touchMoved() {
}

function touchEnded() {
}

function windowResized(){
  resizeCanvas(windowWidth, windowHeight);
}

