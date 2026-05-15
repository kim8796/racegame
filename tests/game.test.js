import assert from "node:assert/strict";
import test from "node:test";
import { RaceGame, sanitizeNickname } from "../server/game.js";

test("nickname sanitization trims, compacts, clips, and falls back", () => {
  assert.equal(sanitizeNickname("  Ada   Lovelace  ", 12), "Ada Lovelace");
  assert.equal(sanitizeNickname("   "), "Player");
});

test("rooms require two players to start and enforce max capacity", () => {
  const game = new RaceGame({
    generateRoomId: () => "ABCD"
  });
  const created = game.createRoom("s1", "One", 0);

  assert.equal(created.ok, true);
  assert.equal(game.startRace("s1", 100).ok, false);

  for (let index = 2; index <= 8; index += 1) {
    const joined = game.joinRoom(`s${index}`, "ABCD", `P${index}`, index);
    assert.equal(joined.ok, true);
  }

  assert.equal(game.joinRoom("s9", "ABCD", "P9", 9).ok, false);
  assert.equal(game.startRace("s1", 1000).ok, true);
});

test("space taps change server-owned speed and position", () => {
  const game = new RaceGame({
    generateRoomId: () => "RACE"
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

  assert.ok(fast.speed > slow.speed);
  assert.ok(fast.position > slow.position);
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
      baseSpeed: 10,
      tapImpulse: 10,
      boostDecayPerSecond: 0
    }
  });

  game.createRoom("winner", "Winner", 0);
  game.joinRoom("runner", "DONE", "Runner", 0);
  game.startRace("winner", 0);
  game.tick(3000);
  game.recordTap("winner", 3050);
  game.tick(4000);

  const room = game.getRoom("DONE");
  const first = room.results[0];

  assert.equal(first.playerId, "winner");
  assert.equal(first.rank, 1);
});
