// constants
const ball = document.getElementById("ball");
const board = document.getElementById("board");

const corners = ["TL", "TR", "BL", "BR"];
let activeCorner = "TR";

let ballX = 0, ballY = 0;
let vx = 0, vy = 0;

let score = 0;
let alpha = 0, beta = 0, gamma = 0;

const GAME_MS = 30000;

const BALL_RADIUS = 22; // if ball is 44x44
const ACCEL = 0.25;
const FRICTION = 0.98;

const cornerGlow = document.getElementById("cornerGlow");
const CORNER_TARGET_RADIUS = 20;
const CORNER_PAD = 6; 

let gameStarted = false;  // prevents multiple timers
let timerId = null;


function handleOrientation(e) {
  if (e.alpha == null || e.beta == null || e.gamma == null) return;

  alpha = e.alpha;
  beta = e.beta;
  gamma = e.gamma;

  const a = document.querySelector("#alpha");
  const b = document.querySelector("#beta");
  const g = document.querySelector("#gamma");

  if (a) a.innerText = "alpha: " + Math.round(alpha);
  if (b) b.innerText = "beta: " + Math.round(beta);
  if (g) g.innerText = "gamma: " + Math.round(gamma);
}

// --- game start (called from requestOrientation.js) ---
function startGame() {
  if (gameStarted) return; // only for one start
  gameStarted = true;

  board.style.display = "block";
  pickCorner();
  centerBall();

  const startTime = Date.now();

  timerId = setInterval(() => {
    update();

    if (Date.now() - startTime >= GAME_MS) {
      clearInterval(timerId);
      window.removeEventListener("deviceorientation", handleOrientation);
      endGame();
    }
  }, 16);
}

/*function pickCorner() {
  const prev = document.getElementById(activeCorner);
  if (prev) prev.classList.remove("active");

  activeCorner = corners[Math.floor(Math.random() * corners.length)];

  const next = document.getElementById(activeCorner);
  if (next) next.classList.add("active");
}*/

function pickCorner() {
     activeCorner = corners[Math.floor(Math.random() * corners.length)];
     positionCornerGlow();
}

function centerBall() {
     const rect = board.getBoundingClientRect();
     ballX = rect.width / 2;
     ballY = rect.height / 2;
     vx = 0;
     vy = 0;
     renderBall();
}

function renderBall() {
     ball.style.left = `${ballX - BALL_RADIUS}px`;
     ball.style.top  = `${ballY - BALL_RADIUS}px`;
}

/*function ballInActiveCorner() {
     const cornerEl = document.getElementById(activeCorner);
     if (!cornerEl) return false;

     const b = board.getBoundingClientRect();
     const c = cornerEl.getBoundingClientRect();

     const x1 = c.left - b.left;
     const y1 = c.top - b.top;
     const x2 = x1 + c.width;
     const y2 = y1 + c.height;

     return (ballX > x1 && ballX < x2 && ballY > y1 && ballY < y2);
}*/

function ballInActiveCorner() {
     const p = getCornerPoint();
   
     const dx = ballX - p.x;
     const dy = ballY - p.y;
   
     // distance from ball center to corner point
     const dist = Math.sqrt(dx * dx + dy * dy);
   
     // count as hit if ball center is within radius + ball radius
     return dist <= (CORNER_TARGET_RADIUS + BALL_RADIUS);
}
   

function update() {
     // Use latest tilt values updated by handleOrientation
     vx += (gamma / 45) * ACCEL;
     vy += (beta / 45) * ACCEL;

     vx *= FRICTION;
     vy *= FRICTION;

     ballX += vx * 3;
     ballY += vy * 3;

     // walls
     const w = board.clientWidth;
     const h = board.clientHeight;

     if (ballX < BALL_RADIUS) ballX = BALL_RADIUS;
     if (ballX > w - BALL_RADIUS) ballX = w - BALL_RADIUS;
     if (ballY < BALL_RADIUS) ballY = BALL_RADIUS;
     if (ballY > h - BALL_RADIUS) ballY = h - BALL_RADIUS;

     renderBall();

  // score check
     if (ballInActiveCorner()) {
          score++;
          centerBall();
          pickCorner();
     }
}

function endGame() {
     document.body.innerHTML = `
     <div style="text-align:center; color:black; font-family:system-ui;">
          <h1 style="margin:0 0 10px;">Done!</h1>
          <p style="font-size:22px; margin:0;">Score: ${score}</p>
     </div>
     `;
}

function getCornerPoint() {
     const w = board.clientWidth;
     const h = board.clientHeight;
   
     // actual corner point (board coordinates)
     if (activeCorner === "TL") return { x: 0, y: 0 };
     if (activeCorner === "TR") return { x: w, y: 0 };
     if (activeCorner === "BL") return { x: 0, y: h };
     return { x: w, y: h }; // "BR"
}
   
function positionCornerGlow() {
     const w = board.clientWidth;
     const h = board.clientHeight;
   
     // place the glow slightly inset so it's visible
     const size = 34; // must match CSS #cornerGlow size
     const half = size / 2;
   
     let x = 0, y = 0;
     if (activeCorner === "TL") { x = CORNER_PAD + half; y = CORNER_PAD + half; }
     if (activeCorner === "TR") { x = w - CORNER_PAD - half; y = CORNER_PAD + half; }
     if (activeCorner === "BL") { x = CORNER_PAD + half; y = h - CORNER_PAD - half; }
     if (activeCorner === "BR") { x = w - CORNER_PAD - half; y = h - CORNER_PAD - half; }
   
     cornerGlow.style.left = `${x - half}px`;
     cornerGlow.style.top  = `${y - half}px`;
}




