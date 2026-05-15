const socket = io();

const state = {
  selfId: null,
  roomId: null,
  latest: null,
  keyHeld: false
};

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
      ? `Speed ${Math.round(me.speed)} | Taps ${me.acceptedTaps}`
      : "Race running.";
    return;
  }

  if (serverState.status === "finished") {
    elements.statusText.textContent = "Race finished.";
  }
}

function renderLanes(serverState) {
  const maxTravel = 100;

  elements.lanes.replaceChildren(
    ...serverState.players.map((player) => {
      const lane = document.createElement("article");
      lane.className = player.id === state.selfId ? "lane me" : "lane";

      const meta = document.createElement("div");
      meta.className = "laneMeta";

      const chip = document.createElement("span");
      chip.className = "colorChip";
      chip.style.background = player.color;

      const nickname = document.createElement("span");
      nickname.className = "nickname";
      nickname.textContent = player.nickname;

      const meters = document.createElement("span");
      meters.className = "meters";
      meters.textContent = `${Math.round(player.progress * 100)}%`;

      const horse = document.createElement("div");
      horse.className = player.finished ? "horse finished" : "horse";
      horse.style.left = `calc(${Math.min(player.progress, 1) * maxTravel}% - ${Math.min(player.progress, 1) * 96}px)`;

      meta.append(chip, nickname, meters);
      lane.append(meta, horse);
      return lane;
    })
  );
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
