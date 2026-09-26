const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

const healthEl = document.getElementById("health");
const hungerEl = document.getElementById("hunger");
const timeEl = document.getElementById("time");
const woodEl = document.getElementById("wood");
const stoneEl = document.getElementById("stone");
const grassEl = document.getElementById("grass");
const foodEl = document.getElementById("food");
const wallEl = document.getElementById("wallCount");
const toolButtons = document.querySelectorAll(".tool");
const craftButtons = document.querySelectorAll(".craft");

const TILE = 32;
const COLS = 30;
const ROWS = 18;

const keys = {};

const state = {
  time: 6 * 60,
  selectedTool: "harvest",
  inventory: {
    wood: 0,
    stone: 0,
    grass: 0,
    food: 0,
    wall: 0,
  },
  player: {
    x: 6 * TILE,
    y: 6 * TILE,
    w: TILE,
    h: TILE,
    speed: 2.3,
    health: 100,
    hunger: 100,
  },
  mouse: { x: 0, y: 0 },
  world: [],
  enemies: [],
  enemySpawnTimer: 0,
};

const tileColors = {
  grass: "#6ecb63",
  tree: "#2d7d2c",
  stone: "#8a8a8a",
  water: "#2b7de8",
  wall: "#a86728",
  empty: "#dceec3",
};

function initWorld() {
  state.world = [];
  for (let y = 0; y < ROWS; y++) {
    const row = [];
    for (let x = 0; x < COLS; x++) {
      const r = Math.random();
      let tile = "grass";

      if (r < 0.08) tile = "water";
      else if (r < 0.15) tile = "tree";
      else if (r < 0.22) tile = "stone";

      row.push(tile);
    }
    state.world.push(row);
  }
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getCellFromPixel(px, py) {
  return {
    x: Math.floor(px / TILE),
    y: Math.floor(py / TILE),
  };
}

function canMoveTo(x, y, w, h) {
  const corners = [
    { x: x + 3, y: y + 3 },
    { x: x + w - 3, y: y + 3 },
    { x: x + 3, y: y + h - 3 },
    { x: x + w - 3, y: y + h - 3 },
  ];

  for (const corner of corners) {
    const cx = Math.floor(corner.x / TILE);
    const cy = Math.floor(corner.y / TILE);
    if (cx < 0 || cy < 0 || cx >= COLS || cy >= ROWS) return false;

    const tile = state.world[cy][cx];
    if (tile === "water" || tile === "wall") return false;
  }

  return true;
}

function formatTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function setSelectedTool(tool) {
  state.selectedTool = tool;
  toolButtons.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.tool === tool);
  });
}

function updateHud() {
  healthEl.textContent = Math.floor(state.player.health);
  hungerEl.textContent = Math.floor(state.player.hunger);
  timeEl.textContent = formatTime(state.time);
  woodEl.textContent = state.inventory.wood;
  stoneEl.textContent = state.inventory.stone;
  grassEl.textContent = state.inventory.grass;
  foodEl.textContent = state.inventory.food;
  wallEl.textContent = state.inventory.wall;
}

function gatherResource(cellX, cellY) {
  const tile = state.world[cellY]?.[cellX];
  if (!tile || tile === "empty") return;

  if (tile === "tree") {
    state.inventory.wood += 1;
    state.world[cellY][cellX] = "empty";
    return;
  }

  if (tile === "stone") {
    state.inventory.stone += 1;
    state.world[cellY][cellX] = "empty";
    return;
  }

  if (tile === "grass") {
    state.inventory.grass += 1;
    state.world[cellY][cellX] = "empty";
    return;
  }
}

function autoGatherNearby() {
  const px = Math.floor(state.player.x / TILE);
  const py = Math.floor(state.player.y / TILE);

  for (let y = py - 1; y <= py + 1; y++) {
    for (let x = px - 1; x <= px + 1; x++) {
      if (x < 0 || y < 0 || x >= COLS || y >= ROWS) continue;
      const tile = state.world[y][x];
      if (tile === "tree" || tile === "stone" || tile === "grass") {
        gatherResource(x, y);
      }
    }
  }
}

function buildWall(cellX, cellY) {
  if (state.inventory.wood < 1) return;
  const tile = state.world[cellY]?.[cellX];
  if (!tile || tile === "wall") return;
  if (tile === "water") return;

  state.world[cellY][cellX] = "wall";
  state.inventory.wood -= 1;
  state.inventory.wall += 1;
}

function removeWall(cellX, cellY) {
  const tile = state.world[cellY]?.[cellX];
  if (tile === "wall") {
    state.world[cellY][cellX] = "empty";
    state.inventory.wall = Math.max(0, state.inventory.wall - 1);
  }
}

function craftItem(type) {
  if (type === "food") {
    if (state.inventory.grass >= 2) {
      state.inventory.grass -= 2;
      state.inventory.food += 1;
    }
    return;
  }

  if (type === "wall") {
    if (state.inventory.wood >= 3) {
      state.inventory.wood -= 3;
      state.inventory.wall += 1;
    }
    return;
  }

  if (type === "stoneWall") {
    if (state.inventory.stone >= 2 && state.inventory.wood >= 1) {
      state.inventory.stone -= 2;
      state.inventory.wood -= 1;
      state.inventory.wall += 1;
    }
  }
}

function eatFood() {
  if (state.inventory.food > 0) {
    state.inventory.food -= 1;
    state.player.hunger = Math.min(100, state.player.hunger + 35);
    state.player.health = Math.min(100, state.player.health + 12);
  }
}

function updatePlayer() {
  let dx = 0;
  let dy = 0;

  if (keys.w) dy -= 1;
  if (keys.s) dy += 1;
  if (keys.a) dx -= 1;
  if (keys.d) dx += 1;

  if (dx !== 0 || dy !== 0) {
    const oldX = state.player.x;
    const oldY = state.player.y;

    state.player.x = clamp(state.player.x + dx * state.player.speed, 0, canvas.width - state.player.w);
    if (!canMoveTo(state.player.x, state.player.y, state.player.w, state.player.h)) {
      state.player.x = oldX;
    }

    state.player.y = clamp(state.player.y + dy * state.player.speed, 0, canvas.height - state.player.h);
    if (!canMoveTo(state.player.x, state.player.y, state.player.w, state.player.h)) {
      state.player.y = oldY;
    }
  }

  state.player.hunger -= 0.02;
  if (state.player.hunger <= 0) {
    state.player.health -= 0.18;
  }

  const hour = Math.floor(state.time / 60);
  if (hour >= 19 || hour < 6) {
    state.player.health -= 0.03;
  }

  if (state.player.health <= 0) {
    state.player.health = 100;
    state.player.hunger = 100;
    state.player.x = 6 * TILE;
    state.player.y = 6 * TILE;
  }
}

function updateTime() {
  state.time += 1;
  if (state.time >= 24 * 60) state.time = 0;
}

function spawnEnemy() {
  const side = Math.random() * 4;
  let x = 0;
  let y = 0;

  if (side < 1) {
    x = Math.random() * (canvas.width - 20);
    y = -20;
  } else if (side < 2) {
    x = canvas.width + 20;
    y = Math.random() * (canvas.height - 20);
  } else if (side < 3) {
    x = Math.random() * (canvas.width - 20);
    y = canvas.height + 20;
  } else {
    x = -20;
    y = Math.random() * (canvas.height - 20);
  }

  state.enemies.push({
    x,
    y,
    w: TILE * 0.75,
    h: TILE * 0.75,
    speed: 0.8 + Math.random() * 0.7,
  });
}

function updateEnemies() {
  const hour = Math.floor(state.time / 60);
  const isNight = hour >= 19 || hour < 6;

  if (isNight) {
    state.enemySpawnTimer -= 1;
    if (state.enemySpawnTimer <= 0) {
      spawnEnemy();
      state.enemySpawnTimer = 110 + Math.random() * 50;
    }
  }

  for (const enemy of state.enemies) {
    const dx = state.player.x + state.player.w / 2 - (enemy.x + enemy.w / 2);
    const dy = state.player.y + state.player.h / 2 - (enemy.y + enemy.h / 2);
    const len = Math.hypot(dx, dy) || 1;

    enemy.x += (dx / len) * enemy.speed;
    enemy.y += (dy / len) * enemy.speed;

    const dist = Math.hypot(
      state.player.x + state.player.w / 2 - (enemy.x + enemy.w / 2),
      state.player.y + state.player.h / 2 - (enemy.y + enemy.h / 2)
    );

    if (dist < 28) {
      state.player.health -= 0.2;
    }
  }

  state.enemies = state.enemies.filter((enemy) => {
    return enemy.x > -40 && enemy.x < canvas.width + 40 && enemy.y > -40 && enemy.y < canvas.height + 40;
  });
}

function drawWorld() {
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const tile = state.world[y][x];
      const px = x * TILE;
      const py = y * TILE;

      ctx.fillStyle = tileColors[tile] || tileColors.grass;
      ctx.fillRect(px, py, TILE, TILE);
      ctx.strokeStyle = "rgba(0,0,0,0.08)";
      ctx.strokeRect(px, py, TILE, TILE);
    }
  }
}

function drawPlayer() {
  ctx.fillStyle = "#f8d84d";
  ctx.fillRect(state.player.x, state.player.y, state.player.w, state.player.h);

  ctx.fillStyle = "#000";
  ctx.fillRect(state.player.x + 8, state.player.y + 8, 4, 4);
  ctx.fillRect(state.player.x + 20, state.player.y + 8, 4, 4);
  ctx.fillRect(state.player.x + 10, state.player.y + 20, 12, 4);
}

function drawEnemies() {
  ctx.fillStyle = "#ef4444";
  for (const enemy of state.enemies) {
    ctx.fillRect(enemy.x, enemy.y, enemy.w, enemy.h);
  }
}

function drawMouseHighlight() {
  const cellX = Math.floor(state.mouse.x / TILE);
  const cellY = Math.floor(state.mouse.y / TILE);
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 2;
  ctx.strokeRect(cellX * TILE, cellY * TILE, TILE, TILE);
}

function handleClick() {
  const cellX = Math.floor(state.mouse.x / TILE);
  const cellY = Math.floor(state.mouse.y / TILE);

  if (state.selectedTool === "harvest") {
    gatherResource(cellX, cellY);
  } else if (state.selectedTool === "build") {
    buildWall(cellX, cellY);
  } else if (state.selectedTool === "remove") {
    removeWall(cellX, cellY);
  }
}

function render() {
  const hour = Math.floor(state.time / 60);
  const isNight = hour >= 19 || hour < 6;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (isNight) {
    ctx.fillStyle = "rgba(8, 12, 22, 0.45)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  drawWorld();
  drawEnemies();
  drawPlayer();
  drawMouseHighlight();
}

function loop() {
  updatePlayer();
  updateTime();
  updateEnemies();
  updateHud();
  render();
  requestAnimationFrame(loop);
}

document.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  keys[key] = true;

  if (key === "e") autoGatherNearby();
  if (key === "f") eatFood();

  if (key === "1") setSelectedTool("harvest");
  if (key === "2") setSelectedTool("build");
  if (key === "3") setSelectedTool("remove");
});

document.addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
});

canvas.addEventListener("mousemove", (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;

  state.mouse.x = (e.clientX - rect.left) * scaleX;
  state.mouse.y = (e.clientY - rect.top) * scaleY;
});

canvas.addEventListener("click", handleClick);

toolButtons.forEach((btn) => {
  btn.addEventListener("click", () => setSelectedTool(btn.dataset.tool));
});

craftButtons.forEach((btn) => {
  btn.addEventListener("click", () => craftItem(btn.dataset.craft));
});

initWorld();
state.enemySpawnTimer = 80;
updateHud();
requestAnimationFrame(loop);
