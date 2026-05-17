const socket = io();

const state = {
  selfId: null,
  roomId: null,
  latest: null,
  keyHeld: false,
  tapCounts: new Map()
};

const STADIUM_HALF_STRAIGHT = 24;
const STADIUM_TURN_X_RATIO = 0.55;

const elements = {
  nicknameInput: document.querySelector("#nicknameInput"),
  roomInput: document.querySelector("#roomInput"),
  createButton: document.querySelector("#createButton"),
  joinButton: document.querySelector("#joinButton"),
  startButton: document.querySelector("#startButton"),
  roomBadge: document.querySelector("#roomBadge"),
  statusText: document.querySelector("#statusText"),
  lanes: document.querySelector("#lanes"),
  countdown: document.querySelector("#countdown"),
  resultsPanel: document.querySelector("#resultsPanel"),
  resultsList: document.querySelector("#resultsList")
};

elements.createButton.addEventListener("click", () => {
  const nickname = elements.nicknameInput.value;

  socket.emit("room:create", { nickname }, (response) => {
    if (!response.ok) {
      showMessage(response.error);
      return;
    }

    state.selfId = response.playerId;
    state.roomId = response.roomId;
    render(response.state);
  });
});

elements.joinButton.addEventListener("click", () => {
  const nickname = elements.nicknameInput.value;
  const roomId = elements.roomInput.value;

  socket.emit("room:join", { nickname, roomId }, (response) => {
    if (!response.ok) {
      showMessage(response.error);
      return;
    }

    state.selfId = response.playerId;
    state.roomId = response.roomId;
    render(response.state);
  });
});

elements.startButton.addEventListener("click", () => {
  socket.emit("room:start", {}, (response) => {
    if (!response.ok) {
      showMessage(response.error);
    }
  });
});

document.addEventListener("keydown", (event) => {
  if (event.code !== "Space" || state.keyHeld) {
    return;
  }

  state.keyHeld = true;
  event.preventDefault();

  if (state.latest?.status === "racing") {
    socket.emit("input:tap");
  }
});

document.addEventListener("keyup", (event) => {
  if (event.code === "Space") {
    state.keyHeld = false;
    event.preventDefault();
  }
});

socket.on("state", (serverState) => {
  render(serverState);
});

socket.on("connect", () => {
  showMessage("Connected.");
});

socket.on("disconnect", () => {
  showMessage("Disconnected.");
});

function render(serverState) {
  state.latest = serverState;
  state.roomId = serverState.roomId;
  elements.roomBadge.textContent = serverState.roomId ?? "No room";
  elements.startButton.disabled = !serverState.canStart;
  elements.countdown.hidden = serverState.status !== "countdown";
  elements.countdown.textContent = String(serverState.countdown || "");

  renderStatus(serverState);
  renderLanes(serverState);
  renderResults(serverState);
}

function renderStatus(serverState) {
  const playerCount = serverState.players.length;
  const maxPlayers = serverState.config.maxPlayers;

  if (serverState.status === "lobby") {
    elements.statusText.textContent =
      playerCount >= serverState.config.minPlayers
        ? `${playerCount}/${maxPlayers} players in ${serverState.roomId}.`
        : `${playerCount}/${maxPlayers} players in ${serverState.roomId}. Waiting for one more.`;
    return;
  }

  if (serverState.status === "countdown") {
    elements.statusText.textContent = "Countdown.";
    return;
  }

  if (serverState.status === "racing") {
    const me = serverState.players.find((player) => player.id === state.selfId);
    elements.statusText.textContent = me
      ? `Progress ${Math.round(me.progress * 100)}% | Taps ${me.acceptedTaps}`
      : "Race running.";
    return;
  }

  if (serverState.status === "finished") {
    elements.statusText.textContent = "Race finished.";
  }
}

function renderLanes(serverState) {
  const playerCount = Math.max(serverState.players.length, 1);
  const track = document.createElement("div");
  const runners = document.createElement("div");
  const roster = document.createElement("div");

  track.className = "ovalTrack";
  runners.className = "runnersLayer";
  roster.className = "raceRoster";

  for (let index = 0; index < Math.max(playerCount, 4); index += 1) {
    const ring = document.createElement("span");
    ring.className = "trackRing";
    ring.style.inset = `${22 + index * 12}px ${52 + index * 18}px`;
    track.append(ring);
  }

  for (const [index, player] of serverState.players.entries()) {
    const previousTaps = state.tapCounts.get(player.id) ?? player.acceptedTaps;
    const moved = serverState.status === "racing" && player.acceptedTaps > previousTaps;
    const point = getTrackPoint(player.progress, index, playerCount);
    const runner = document.createElement("article");
    const rosterRow = document.createElement("div");

    runner.className = [
      "runner",
      player.id === state.selfId ? "me" : "",
      player.finished ? "finished" : "",
      moved ? "moving" : ""
    ].filter(Boolean).join(" ");
    runner.style.left = `${point.x}%`;
    runner.style.top = `${point.y}%`;
    runner.style.setProperty("--heading", `${point.heading}rad`);

    const bib = document.createElement("span");
    bib.className = "runnerBib";
    bib.textContent = String(index + 1);

    const horse = createHorseSprite(player);
    horse.append(bib);
    runner.append(horse);
    runners.append(runner);

    rosterRow.className = player.id === state.selfId ? "rosterRow me" : "rosterRow";

    const chip = document.createElement("span");
    chip.className = "colorChip";
    chip.style.background = player.color;

    const nickname = document.createElement("span");
    nickname.className = "nickname";
    nickname.textContent = player.nickname;

    const meters = document.createElement("span");
    meters.className = "meters";
    meters.textContent = `${Math.round(player.progress * 100)}%`;

    rosterRow.append(chip, nickname, meters);
    roster.append(rosterRow);
    state.tapCounts.set(player.id, player.acceptedTaps);
  }

  elements.lanes.replaceChildren(track, runners, roster);
}

function getTrackPoint(progress, laneIndex, playerCount) {
  const safeProgress = Math.max(0, Math.min(progress, 1));
  const laneSpacing = playerCount > 6 ? 1.45 : 2.1;
  const radiusY = 34 - laneIndex * laneSpacing;
  const radiusX = radiusY * STADIUM_TURN_X_RATIO;
  const turnLength = Math.PI * Math.sqrt((radiusX * radiusX + radiusY * radiusY) / 2);
  const quarterTurn = turnLength / 2;
  const straightLength = STADIUM_HALF_STRAIGHT * 2;
  const totalLength = turnLength * 2 + straightLength * 2;
  let distance = safeProgress * totalLength;

  if (distance <= quarterTurn) {
    return getTurnPoint(
      50 + STADIUM_HALF_STRAIGHT,
      (distance / quarterTurn) * (Math.PI / 2),
      radiusX,
      radiusY
    );
  }

  distance -= quarterTurn;

  if (distance <= straightLength) {
    const ratio = distance / straightLength;

    return {
      x: 50 + STADIUM_HALF_STRAIGHT - ratio * straightLength,
      y: 50 + radiusY,
      heading: Math.PI
    };
  }

  distance -= straightLength;

  if (distance <= turnLength) {
    return getTurnPoint(
      50 - STADIUM_HALF_STRAIGHT,
      Math.PI / 2 + (distance / turnLength) * Math.PI,
      radiusX,
      radiusY
    );
  }

  distance -= turnLength;

  if (distance <= straightLength) {
    const ratio = distance / straightLength;

    return {
      x: 50 - STADIUM_HALF_STRAIGHT + ratio * straightLength,
      y: 50 - radiusY,
      heading: 0
    };
  }

  distance -= straightLength;

  return getTurnPoint(
    50 + STADIUM_HALF_STRAIGHT,
    (Math.PI * 1.5) + (distance / quarterTurn) * (Math.PI / 2),
    radiusX,
    radiusY
  );
}

function getTurnPoint(centerX, angle, radiusX, radiusY) {
  return {
    x: centerX + Math.cos(angle) * radiusX,
    y: 50 + Math.sin(angle) * radiusY,
    heading: Math.atan2(Math.cos(angle) * radiusY, -Math.sin(angle) * radiusX)
  };
}

function createHorseSprite(player) {
  const sprite = document.createElement("div");
  sprite.className = "horseSprite";
  sprite.style.setProperty("--silk", player.color);

  for (const className of [
    "tail",
    "backLeg far",
    "frontLeg far",
    "body",
    "neck",
    "head",
    "muzzle",
    "ear back",
    "ear front",
    "mane",
    "saddle",
    "backLeg",
    "frontLeg",
    "riderLeg",
    "riderBody",
    "riderHead",
    "helmet",
    "goggle"
  ]) {
    const part = document.createElement("span");
    part.className = className;
    sprite.append(part);
  }

  return sprite;
}

function renderResults(serverState) {
  elements.resultsPanel.hidden = serverState.results.length === 0;
  elements.resultsList.replaceChildren(
    ...serverState.results.map((result) => {
      const item = document.createElement("li");
      const seconds = (result.finishTimeMs / 1000).toFixed(2);
      item.textContent = `${result.nickname} - ${seconds}s - ${result.acceptedTaps} taps`;
      return item;
    })
  );
}

function showMessage(message) {
  elements.statusText.textContent = message;
}
