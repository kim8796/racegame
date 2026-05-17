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
