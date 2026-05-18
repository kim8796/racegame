import assert from "node:assert/strict";
import test from "node:test";
import { RaceGame, sanitizeNickname } from "../server/game.js";

test("nickname sanitization trims, compacts, clips, and falls back", () => {
  assert.equal(sanitizeNickname("  Ada   Lovelace  ", 12), "Ada Lovelace");
  assert.equal(sanitizeNickname("   "), "Player");
});

test("rooms can start with one player and enforce max capacity", () => {
  const game = new RaceGame({
    generateRoomId: () => "SOLO"
  });
  const created = game.createRoom("s1", "One", 0);

  assert.equal(created.ok, true);
  assert.equal(created.state.config.minPlayers, 1);
  assert.equal(created.state.canStart, true);
  assert.equal(game.startRace("s1", 100).ok, true);

  const fullGame = new RaceGame({
    generateRoomId: () => "FULL"
  });
  fullGame.createRoom("s1", "One", 0);

  for (let index = 2; index <= 8; index += 1) {
    const joined = fullGame.joinRoom(`s${index}`, "FULL", `P${index}`, index);
    assert.equal(joined.ok, true);
  }

  assert.equal(fullGame.joinRoom("s9", "FULL", "P9", 9).ok, false);
});

test("solo races add bot opponents and can finish with one human", () => {
  const game = new RaceGame({
    generateRoomId: () => "SOLO",
    config: {
      trackLength: 90,
      tapDistance: 30
    }
  });

  const created = game.createRoom("human", "Solo", 0);

  assert.equal(created.state.players.length, 1);
  assert.equal(created.state.players[0].isBot, false);

  const started = game.startRace("human", 100);

  assert.equal(started.ok, true);
  assert.equal(started.state.status, "countdown");
  assert.equal(started.state.players.length, 4);
  assert.equal(started.state.players.filter((player) => player.isBot).length, 3);

  game.tick(3100);

  for (const tapTime of [3160, 3220, 3280]) {
    const result = game.recordTap("human", tapTime);
    assert.equal(result.accepted, true);
  }

  const racingSnapshot = game.snapshot(game.getRoom("SOLO"), 3280);
  const human = racingSnapshot.players.find((player) => player.id === "human");

  assert.equal(racingSnapshot.status, "racing");
  assert.equal(human.finished, true);
  assert.equal(human.rank, 1);
  assert.equal(racingSnapshot.results[0].playerId, "human");

  game.tick(12000);

  const finishedSnapshot = game.snapshot(game.getRoom("SOLO"), 12000);

  assert.equal(finishedSnapshot.status, "finished");
  assert.equal(finishedSnapshot.results.length, 4);
  assert.deepEqual(
    finishedSnapshot.results.map((result) => result.rank),
    [1, 2, 3, 4]
  );
});

test("multiplayer races do not create solo bot opponents", () => {
  const game = new RaceGame({
    generateRoomId: () => "DUO"
  });

  game.createRoom("p1", "One", 0);
  game.joinRoom("p2", "DUO", "Two", 1);

  const started = game.startRace("p1", 100);

  assert.equal(started.ok, true);
  assert.equal(started.state.players.length, 2);
  assert.equal(started.state.players.some((player) => player.isBot), false);

  game.tick(3100);

  const racingSnapshot = game.snapshot(game.getRoom("DUO"), 3100);

  assert.equal(racingSnapshot.status, "racing");
  assert.equal(racingSnapshot.players.length, 2);
  assert.equal(racingSnapshot.players.some((player) => player.isBot), false);
});

test("racers stay still until accepted space taps", () => {
  const game = new RaceGame({
    generateRoomId: () => "IDLE"
  });

  game.createRoom("p1", "One", 0);
  game.joinRoom("p2", "IDLE", "Two", 1);
  game.startRace("p1", 100);
  game.tick(3100);
  game.tick(8000);

  const snapshot = game.snapshot(game.getRoom("IDLE"), 8000);

  assert.equal(snapshot.status, "racing");
  assert.equal(snapshot.players.find((player) => player.id === "p1").position, 0);
  assert.equal(snapshot.players.find((player) => player.id === "p2").position, 0);
});

test("space taps advance server-owned position by fixed distance", () => {
  const game = new RaceGame({
    generateRoomId: () => "RACE",
    config: {
      tapDistance: 40
    }
  });

  game.createRoom("fast", "Fast", 0);
  game.joinRoom("slow", "RACE", "Slow", 1);
  game.startRace("fast", 100);
  game.tick(3100);

  for (let index = 0; index < 8; index += 1) {
    const tapTime = 3150 + index * 90;
    const result = game.recordTap("fast", tapTime);
    assert.equal(result.accepted, true);
    game.tick(tapTime);
  }

  game.tick(4300);
  const room = game.getRoom("RACE");
  const snapshot = game.snapshot(room, 4300);
  const fast = snapshot.players.find((player) => player.id === "fast");
  const slow = snapshot.players.find((player) => player.id === "slow");

  assert.equal(fast.acceptedTaps, 8);
  assert.equal(fast.position, 320);
  assert.equal(slow.position, 0);
});

test("unusually fast tap input is rejected by the server", () => {
  const game = new RaceGame({
    generateRoomId: () => "RATE"
  });

  game.createRoom("p1", "One", 0);
  game.joinRoom("p2", "RATE", "Two", 0);
  game.startRace("p1", 0);
  game.tick(3000);

  assert.equal(game.recordTap("p1", 3010).accepted, true);
  assert.equal(game.recordTap("p1", 3020).accepted, false);

  for (let index = 0; index < 30; index += 1) {
    game.recordTap("p1", 3030 + index * 10);
  }

  const player = game.snapshot(game.getRoom("RATE"), 3400).players.find((entry) => entry.id === "p1");
  assert.ok(player.rejectedTaps > 0);
  assert.ok(player.acceptedTaps < 30);
});

test("race finish order is decided on the server", () => {
  const game = new RaceGame({
    generateRoomId: () => "DONE",
    config: {
      trackLength: 15,
      tapDistance: 15
    }
  });

  game.createRoom("winner", "Winner", 0);
  game.startRace("winner", 0);
  game.tick(3000);
  game.recordTap("winner", 3050);
  game.tick(4000);

  const room = game.getRoom("DONE");
  const first = room.results[0];

  assert.equal(first.playerId, "winner");
  assert.equal(first.rank, 1);
});

test("selected multi-lap races require the full configured distance", () => {
  const game = new RaceGame({
    generateRoomId: () => "LAPS",
    config: {
      soloOpponentCount: 0,
      trackLength: 100,
      tapDistance: 100
    }
  });

  const created = game.createRoom("runner", "Runner", 0);

  assert.equal(created.state.config.laps, 1);
  assert.equal(created.state.config.raceDistance, 100);

  const started = game.startRace("runner", 0, { laps: 3 });

  assert.equal(started.ok, true);
  assert.equal(started.state.config.laps, 3);
  assert.equal(started.state.config.raceDistance, 300);

  game.tick(3000);
  assert.equal(game.recordTap("runner", 3060).accepted, true);

  const oneLapSnapshot = game.snapshot(game.getRoom("LAPS"), 3060);
  const afterOneLap = oneLapSnapshot.players.find((player) => player.id === "runner");

  assert.equal(oneLapSnapshot.status, "racing");
  assert.equal(afterOneLap.finished, false);
  assert.equal(afterOneLap.position, 100);
  assert.equal(afterOneLap.lap, 2);
  assert.equal(afterOneLap.laps, 3);
  assert.equal(afterOneLap.overallProgress, 0.3333);

  assert.equal(game.recordTap("runner", 3120).accepted, true);

  const twoLapSnapshot = game.snapshot(game.getRoom("LAPS"), 3120);
  const afterTwoLaps = twoLapSnapshot.players.find((player) => player.id === "runner");

  assert.equal(twoLapSnapshot.status, "racing");
  assert.equal(afterTwoLaps.finished, false);
  assert.equal(afterTwoLaps.position, 200);
  assert.equal(afterTwoLaps.lap, 3);
  assert.equal(afterTwoLaps.overallProgress, 0.6667);

  assert.equal(game.recordTap("runner", 3180).accepted, true);

  const finishedSnapshot = game.snapshot(game.getRoom("LAPS"), 3180);
  const finishedRunner = finishedSnapshot.players.find((player) => player.id === "runner");

  assert.equal(finishedSnapshot.status, "finished");
  assert.equal(finishedRunner.finished, true);
  assert.equal(finishedRunner.position, 300);
  assert.equal(finishedRunner.rank, 1);
});

test("invalid lap selections are rejected before the race starts", () => {
  const game = new RaceGame({
    generateRoomId: () => "BOUNDS",
    config: {
      minLaps: 1,
      maxLaps: 4
    }
  });

  game.createRoom("runner", "Runner", 0);

  for (const laps of [0, 5, 1.5, "two"]) {
    const result = game.startRace("runner", 0, { laps });
    const room = game.getRoom("BOUNDS");

    assert.equal(result.ok, false);
    assert.match(result.error, /Laps must be an integer/);
    assert.equal(room.status, "lobby");
    assert.equal(room.laps, 1);
  }
});

test("client renders a lane-bounded rectangular finish line", async () => {
  const harness = setupClientRenderHarness();

  try {
    await import(`${new URL("../client/main.js", import.meta.url).href}?finish-line-test`);

    const game = new RaceGame({
      generateRoomId: () => "LANE",
      config: {
        soloOpponentCount: 0
      }
    });

    game.createRoom("p1", "One", 0);
    game.joinRoom("p2", "LANE", "Two", 0);
    game.joinRoom("p3", "LANE", "Three", 0);
    game.joinRoom("p4", "LANE", "Four", 0);

    harness.socketHandlers.get("state")(game.snapshot(game.getRoom("LANE"), 0));

    const lanes = harness.elements.get("#lanes");
    const track = lanes.children[0];
    const finishLine = track.children.find((child) => child.className === "finishLine");
    const finishLeft = parsePercent(track.style.getPropertyValue("--finish-left"));
    const finishWidth = parsePercent(track.style.getPropertyValue("--finish-width"));

    assert.ok(finishLine);
    assert.equal(finishLine.tagName, "SPAN");
    assert.ok(finishLeft >= 0);
    assert.ok(finishWidth > 0);
    assert.ok(finishWidth < 15);
    assert.ok(finishLeft + finishWidth <= 100);
  } finally {
    harness.restore();
  }
});

function setupClientRenderHarness() {
  const elements = new Map(
    [
      "#nicknameInput",
      "#roomInput",
      "#lapsInput",
      "#soloButton",
      "#createButton",
      "#joinButton",
      "#startButton",
      "#tapButton",
      "#roomBadge",
      "#statusText",
      "#lanes",
      "#countdown",
      "#resultsPanel",
      "#resultsList"
    ].map((selector) => [selector, createFakeElement()])
  );
  const socketHandlers = new Map();
  const previousDocument = globalThis.document;
  const previousIo = globalThis.io;

  elements.get("#lapsInput").min = "1";
  elements.get("#lapsInput").max = "12";
  elements.get("#lapsInput").value = "1";

  globalThis.document = {
    addEventListener() {},
    createElement: (tagName) => createFakeElement(tagName),
    querySelector: (selector) => elements.get(selector) ?? null
  };
  globalThis.io = () => ({
    emit(_event, _payload, callback) {
      if (typeof callback === "function") {
        callback({ ok: true });
      }
    },
    on(event, handler) {
      socketHandlers.set(event, handler);
    }
  });

  return {
    elements,
    socketHandlers,
    restore() {
      restoreGlobal("document", previousDocument);
      restoreGlobal("io", previousIo);
    }
  };
}

function createFakeElement(tagName = "div") {
  return {
    tagName: tagName.toUpperCase(),
    children: [],
    className: "",
    disabled: false,
    hidden: false,
    listeners: new Map(),
    max: "",
    min: "",
    style: createFakeStyle(),
    textContent: "",
    value: "",
    addEventListener(event, handler) {
      this.listeners.set(event, handler);
    },
    append(...children) {
      this.children.push(...children);
    },
    replaceChildren(...children) {
      this.children = children;
    }
  };
}

function createFakeStyle() {
  const properties = new Map();

  return {
    getPropertyValue(name) {
      return properties.get(name) ?? "";
    },
    setProperty(name, value) {
      properties.set(name, value);
    }
  };
}

function parsePercent(value) {
  assert.match(value, /^-?\d+(?:\.\d+)?%$/);
  return Number.parseFloat(value);
}

function restoreGlobal(name, value) {
  if (value === undefined) {
    Reflect.deleteProperty(globalThis, name);
    return;
  }

  globalThis[name] = value;
}
