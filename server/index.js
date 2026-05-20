import express from "express";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { GAME_CONFIG, RaceGame } from "./game.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const clientScriptPath = path.join(rootDir, "client", "main.js");
const clientStylesPath = path.join(rootDir, "client", "styles.css");
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const runtimeGameConfig = getRuntimeGameConfig(process.env);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: false
  }
});
const game = new RaceGame({ config: runtimeGameConfig });

app.get("/client/styles.css", async (_request, response, next) => {
  try {
    const css = await fs.readFile(clientStylesPath, "utf8");
    response.type("text/css").send(`${css}\n${FINISH_LINE_CSS}\n${BRIGHT_INTERFACE_CSS}`);
  } catch (error) {
    next(error);
  }
});

app.get("/client/main.js", async (_request, response, next) => {
  try {
    const js = await fs.readFile(clientScriptPath, "utf8");
    response.type("application/javascript").send(`${js}\n${HELP_OVERLAY_SCRIPT}`);
  } catch (error) {
    next(error);
  }
});
app.use("/client", express.static(path.join(rootDir, "client")));
app.use(express.static(path.join(rootDir, "public")));

app.get("/healthz", (_request, response) => {
  response.json({ ok: true });
});

io.on("connection", (socket) => {
  socket.on("room:create", (payload, callback) => {
    const previousRoom = game.getRoomBySocket(socket.id);
    const result = game.createRoom(socket.id, payload?.nickname);

    if (previousRoom) {
      socket.leave(previousRoom.id);
    }

    socket.join(result.roomId);
    acknowledge(callback, result);
    io.to(result.roomId).emit("state", withSelf(result.state, socket.id));
  });

  socket.on("room:join", (payload, callback) => {
    const previousRoom = game.getRoomBySocket(socket.id);
    const result = game.joinRoom(socket.id, payload?.roomId, payload?.nickname);

    if (result.ok) {
      if (previousRoom) {
        socket.leave(previousRoom.id);
      }

      socket.join(result.roomId);
      acknowledge(callback, result);
      broadcastRoom(result.roomId);
      return;
    }

    acknowledge(callback, result);
  });

  socket.on("room:start", (payload, callback) => {
    const result = game.startRace(socket.id, Date.now(), payload);
    const room = game.getRoomBySocket(socket.id);

    acknowledge(callback, result);

    if (result.ok && room) {
      broadcastRoom(room.id);
    }
  });

  socket.on("input:tap", (...args) => {
    const callback = args.find((arg) => typeof arg === "function");
    const room = game.getRoomBySocket(socket.id);
    const result = game.recordTap(socket.id, Date.now());

    acknowledge(callback, result);

    if (room && result.ok) {
      broadcastRoom(room.id);
    }
  });

  socket.on("input:skill", (...args) => {
    const callback = args.find((arg) => typeof arg === "function");
    const room = game.getRoomBySocket(socket.id);
    const result = game.useSkill(socket.id, Date.now());

    acknowledge(callback, result);

    if (room && result.ok) {
      broadcastRoom(room.id);
    }
  });

  socket.on("disconnect", () => {
    const result = game.leave(socket.id);

    if (result && !result.deleted) {
      broadcastRoom(result.roomId);
    }
  });
});

setInterval(() => {
  for (const update of game.tick()) {
    io.to(update.roomId).emit("state", update.state);
  }
}, GAME_CONFIG.tickMs);

server.listen(port, () => {
  console.log(`racegame listening on http://localhost:${port}`);
});

function broadcastRoom(roomId) {
  const room = game.getRoom(roomId);

  if (!room) {
    return;
  }

  io.to(roomId).emit("state", game.snapshot(room));
}

function acknowledge(callback, payload) {
  if (typeof callback === "function") {
    callback(payload);
  }
}

function withSelf(state, playerId) {
  return { ...state, selfId: playerId };
}

function getRuntimeGameConfig(env) {
  const laps = Number(env.RACE_LAPS);

  return Number.isInteger(laps) ? { laps } : {};
}

const FINISH_LINE_CSS = `
.finishAsset {
  right: 150px;
  width: 20px;
  border-radius: 2px;
}
`;

const BRIGHT_INTERFACE_CSS = `
:root {
  color-scheme: light;
  --bg: #f4fbff;
  --panel: #ffffff;
  --panel-strong: #f0f8ff;
  --line: #b9c9d8;
  --text: #18212f;
  --muted: #536173;
  --accent: #db8b00;
  --danger: #e5483f;
  --grass: #80d86e;
  --rail: #fff2c8;
}

body {
  background:
    linear-gradient(180deg, #f8fcff 0%, #eaf7ff 48%, #fff9e7 100%),
    var(--bg);
  color: var(--text);
}

button {
  border-color: #c97900;
  background: #ffd166;
  color: #241604;
  box-shadow: 0 2px 0 rgba(134, 88, 0, 0.18);
}

button:hover:not(:disabled) {
  background: #ffe08f;
}

button:disabled,
#tapButton:disabled,
#skillButton:disabled {
  border-color: #c8d1dc;
  background: #eef3f8;
  color: #8794a3;
}

input {
  border-color: #afc2d5;
  background: #fbfdff;
  color: var(--text);
}

label,
#statusText,
.horseSkillName {
  color: var(--muted);
}

.topbar,
.statusPanel,
.joinPanel,
.horsePanel,
.raceStage,
.resultsPanel {
  border-color: var(--line);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 10px 24px rgba(52, 86, 117, 0.08);
}

.topbar {
  position: relative;
  padding-right: 82px;
}

.eyebrow,
.roomBadge,
.rosterRow.me,
.countdown {
  color: #b36f00;
}

.roomBadge {
  border-color: #b7c6d6;
  background: #f7fbff;
}

.horsePanel {
  background: #eff8ff;
}

.horseCard {
  border-color: rgba(84, 106, 130, 0.28);
  background: #ffffff;
}

.horseCard.selected {
  border-color: #e6a100;
  box-shadow: inset 0 0 0 1px rgba(230, 161, 0, 0.28);
}

.horseCard strong,
.nickname,
.resultsPanel li {
  color: #18212f;
}

.skillTag {
  border-color: rgba(64, 86, 111, 0.22);
  background: #eef6ff;
  color: #27415f;
}

#tapButton {
  border-color: #1d9b71;
  background: #56e0ad;
}

#skillButton {
  border-color: #5a66df;
  background: #c4ccff;
}

.raceStage {
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.22) 0 1px, transparent 1px 32px),
    linear-gradient(180deg, #99e883 0%, #6ed463 100%);
}

.ovalTrack {
  border-color: #fff4ca;
  background:
    repeating-linear-gradient(0deg, rgba(255, 255, 255, 0.25) 0 2px, transparent 2px 26px),
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.18) 0 1px, transparent 1px 36px),
    #c98245;
  box-shadow:
    inset 0 0 0 5px #a75f2b,
    inset 0 0 0 13px rgba(255, 240, 188, 0.72),
    0 12px 28px rgba(84, 119, 70, 0.24);
}

.ovalTrack::before {
  border-color: #fff4ca;
  background:
    linear-gradient(90deg, rgba(255, 255, 255, 0.18) 0 1px, transparent 1px 28px),
    linear-gradient(180deg, #a5ef8b 0%, #72d96c 100%);
  box-shadow:
    0 0 0 4px #a75f2b,
    inset 0 0 26px rgba(82, 168, 79, 0.28);
}

.trackRing {
  border-color: rgba(255, 250, 230, 0.72);
}

.finishLine {
  border-color: #4a3325;
  background:
    conic-gradient(#ffffff 25%, #4a3325 0 50%, #ffffff 0 75%, #4a3325 0) 0 0 / 14px 14px;
  box-shadow: 0 0 0 3px rgba(255, 247, 214, 0.78);
}

.raceRoster {
  border-color: rgba(91, 116, 76, 0.26);
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 8px 22px rgba(43, 92, 52, 0.16);
}

.meters {
  color: #475569;
}

.loadout {
  color: #2360a5;
}

.horseSprite {
  --coat-dark: #9b4f1e;
  --coat-main: #d97726;
  --coat-light: #f5b64c;
  --mane-dark: #6a3217;
  --mane-light: #9d5525;
  --muzzle: #ffd3a6;
  filter: drop-shadow(0 5px 4px rgba(74, 59, 35, 0.26));
}

.horseSprite.horse-sprinter {
  --coat-dark: #a8551d;
  --coat-main: #e8872f;
  --coat-light: #ffc061;
  --mane-dark: #743414;
  --mane-light: #a95c25;
}

.horseSprite.horse-breaker {
  --coat-dark: #6b8fb3;
  --coat-main: #9cc4e8;
  --coat-light: #d7ebff;
  --mane-dark: #31506d;
  --mane-light: #6388aa;
  --muzzle: #eef7ff;
}

.horseSprite.horse-shadow {
  --coat-dark: #3b82f6;
  --coat-main: #70b4ff;
  --coat-light: #c7e2ff;
  --mane-dark: #1d4ed8;
  --mane-light: #60a5fa;
  --muzzle: #e0f2fe;
}

.horseSprite.horse-magnet {
  --coat-dark: #bc3f68;
  --coat-main: #f06b96;
  --coat-light: #ffadc7;
  --mane-dark: #812348;
  --mane-light: #c94f78;
  --muzzle: #ffe0eb;
}

.body,
.neck,
.head,
.muzzle,
.ear,
.frontLeg,
.backLeg {
  border-color: #704020;
}

.saddle,
.riderBody,
.helmet {
  border-color: #ffffff;
}

.goggle {
  background: #334155;
}

.terrainHazard {
  border-color: rgba(255, 255, 255, 0.92);
  background: rgba(255, 176, 89, 0.92);
  color: #3b230e;
}

.countdown {
  background: rgba(255, 255, 255, 0.5);
}

.helpButton {
  position: absolute;
  right: 22px;
  top: 50%;
  display: grid;
  width: 42px;
  min-height: 42px;
  place-items: center;
  border-radius: 50%;
  padding: 0;
  font-size: 1.2rem;
  line-height: 1;
}

.helpButton[aria-expanded="true"] {
  background: #fff3bf;
}

.helpPanel {
  position: fixed;
  top: 84px;
  right: max(24px, calc((100vw - 1280px) / 2 + 24px));
  z-index: 50;
  width: min(380px, calc(100vw - 48px));
  border: 1px solid #b8c8d8;
  border-radius: 8px;
  background: #ffffff;
  color: #18212f;
  box-shadow: 0 20px 44px rgba(31, 50, 71, 0.22);
  padding: 16px;
}

.helpPanel[hidden] {
  display: none;
}

.helpPanelHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.helpPanel h2 {
  font-size: 1rem;
}

.helpCloseButton {
  min-height: 32px;
  border-color: #bfccd8;
  background: #eef5fb;
  color: #28394d;
  padding: 0 10px;
}

.helpList {
  display: grid;
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.helpList li {
  display: grid;
  gap: 2px;
  border-top: 1px solid #edf2f7;
  padding-top: 10px;
}

.helpList li:first-child {
  border-top: 0;
  padding-top: 0;
}

.helpList strong {
  color: #1d3557;
  font-size: 0.88rem;
}

.helpList span {
  color: #536173;
  font-size: 0.83rem;
  line-height: 1.4;
}
`;

const HELP_OVERLAY_SCRIPT = `
const HELP_ITEMS = Object.freeze([
  ["Tap to run", "Press Space or the Tap button repeatedly during a race. Server rate limits reject taps that are too fast."],
  ["Use one skill", "Press Left Shift or Skill once per race. The button title shows your horse type and skill."],
  ["Speed Boost", "Sprinter gets a short 1.2x movement burst after activation."],
  ["Terrain Break", "Breaker drops a slow zone that reduces other racers by 20% when they cross it."],
  ["Teleport Draft", "Shadow jumps close behind the nearest racer ahead."],
  ["Magnetic Repulse", "Magnet pushes nearby racers away from its current position."]
]);

installHelpOverlay();

function installHelpOverlay() {
  const topbar = document.querySelector(".topbar");

  if (!topbar || document.querySelector("#helpButton")) {
    return;
  }

  const button = document.createElement("button");
  button.id = "helpButton";
  button.className = "helpButton";
  button.type = "button";
  button.textContent = "?";
  button.title = "Game help";
  button.setAttribute("aria-label", "Open game help");
  button.setAttribute("aria-haspopup", "dialog");
  button.setAttribute("aria-controls", "helpPanel");
  button.setAttribute("aria-expanded", "false");

  const panel = document.createElement("aside");
  panel.id = "helpPanel";
  panel.className = "helpPanel";
  panel.hidden = true;
  panel.tabIndex = -1;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  panel.setAttribute("aria-labelledby", "helpTitle");

  const header = document.createElement("div");
  header.className = "helpPanelHeader";

  const title = document.createElement("h2");
  title.id = "helpTitle";
  title.textContent = "Game Help";

  const close = document.createElement("button");
  close.className = "helpCloseButton";
  close.type = "button";
  close.textContent = "Close";
  close.setAttribute("aria-label", "Close game help");

  const list = document.createElement("ul");
  list.className = "helpList";

  for (const [heading, detail] of HELP_ITEMS) {
    const item = document.createElement("li");
    const itemHeading = document.createElement("strong");
    const itemDetail = document.createElement("span");

    itemHeading.textContent = heading;
    itemDetail.textContent = detail;
    item.append(itemHeading, itemDetail);
    list.append(item);
  }

  header.append(title, close);
  panel.append(header, list);
  topbar.append(button);
  document.body.append(panel);

  button.addEventListener("click", () => {
    setHelpOpen(panel.hidden);
  });
  close.addEventListener("click", () => {
    setHelpOpen(false);
    button.focus();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) {
      setHelpOpen(false);
      button.focus();
    }
  });
  document.addEventListener("click", (event) => {
    if (panel.hidden || panel.contains(event.target) || button.contains(event.target)) {
      return;
    }

    setHelpOpen(false);
  });

  function setHelpOpen(open) {
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));

    if (open) {
      panel.focus();
    }
  }
}
`;
