const DEFAULT_COLORS = [
  "#f97316",
  "#22c55e",
  "#38bdf8",
  "#f43f5e",
  "#a855f7",
  "#eab308",
  "#14b8a6",
  "#f472b6"
];

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export const GAME_CONFIG = Object.freeze({
  minPlayers: 2,
  maxPlayers: 8,
  trackLength: 1000,
  tickMs: 50,
  countdownMs: 3000,
  baseSpeed: 22,
  tapImpulse: 18,
  maxBoostSpeed: 220,
  boostDecayPerSecond: 55,
  maxTapRatePerSecond: 12,
  minTapIntervalMs: 55,
  maxNicknameLength: 16
});

export class RaceGame {
  constructor(options = {}) {
    this.rooms = new Map();
    this.socketToRoom = new Map();
    this.config = { ...GAME_CONFIG, ...options.config };
    this.generateRoomId = options.generateRoomId ?? (() => createRoomId(this.rooms));
  }

  createRoom(socketId, nickname, now = Date.now()) {
    const roomId = this.generateRoomId();
    const room = {
      id: roomId,
      status: "lobby",
      createdAt: now,
      updatedAt: now,
      countdownEndsAt: null,
      startedAt: null,
      finishedAt: null,
      players: new Map(),
      results: [],
      lastTickAt: now
    };

    this.rooms.set(roomId, room);
    const player = this.addPlayerToRoom(room, socketId, nickname, now);

    return {
      ok: true,
      roomId,
      playerId: player.id,
      state: this.snapshot(room)
    };
  }

  joinRoom(socketId, roomId, nickname, now = Date.now()) {
    const normalizedRoomId = String(roomId ?? "").trim().toUpperCase();
    const room = this.rooms.get(normalizedRoomId);

    if (!room) {
      return { ok: false, error: "Room not found." };
    }

    if (room.status !== "lobby") {
      return { ok: false, error: "The race has already started." };
    }

    if (room.players.size >= this.config.maxPlayers) {
      return { ok: false, error: "Room is full." };
    }

    const player = this.addPlayerToRoom(room, socketId, nickname, now);

    return {
      ok: true,
      roomId: room.id,
      playerId: player.id,
      state: this.snapshot(room)
    };
  }

  startRace(socketId, now = Date.now()) {
    const room = this.getRoomBySocket(socketId);

    if (!room) {
      return { ok: false, error: "Join a room first." };
    }

    if (room.status !== "lobby") {
      return { ok: false, error: "Race is not in the lobby." };
    }

    if (room.players.size < this.config.minPlayers) {
      return { ok: false, error: "At least two players are required." };
    }

    room.status = "countdown";
    room.countdownEndsAt = now + this.config.countdownMs;
    room.startedAt = null;
    room.finishedAt = null;
    room.results = [];
    room.lastTickAt = now;
    room.updatedAt = now;

    for (const player of room.players.values()) {
      resetPlayerRaceState(player, now);
    }

    return { ok: true, state: this.snapshot(room, now) };
  }

  recordTap(socketId, now = Date.now()) {
    const room = this.getRoomBySocket(socketId);

    if (!room || room.status !== "racing") {
      return { ok: false, accepted: false, error: "Race is not running." };
    }

    const player = room.players.get(socketId);

    if (!player || player.finished) {
      return { ok: false, accepted: false, error: "Player is not racing." };
    }

    const elapsedSinceTap = now - player.lastTapAt;

    if (elapsedSinceTap < this.config.minTapIntervalMs) {
      player.rejectedTaps += 1;
      return { ok: true, accepted: false, reason: "too-fast" };
    }

    player.tapWindow = player.tapWindow.filter((tapAt) => now - tapAt < 1000);

    if (player.tapWindow.length >= this.config.maxTapRatePerSecond) {
      player.rejectedTaps += 1;
      return { ok: true, accepted: false, reason: "rate-limited" };
    }

    player.tapWindow.push(now);
    player.lastTapAt = now;
    player.acceptedTaps += 1;
    player.boostSpeed = Math.min(
      this.config.maxBoostSpeed,
      player.boostSpeed + this.config.tapImpulse
    );

    return { ok: true, accepted: true };
  }

  leave(socketId, now = Date.now()) {
    const room = this.getRoomBySocket(socketId);

    if (!room) {
      return null;
    }

    room.players.delete(socketId);
    this.socketToRoom.delete(socketId);
    room.updatedAt = now;

    if (room.players.size === 0) {
      this.rooms.delete(room.id);
      return { roomId: room.id, deleted: true };
    }

    if (room.status === "countdown" && room.players.size < this.config.minPlayers) {
      room.status = "lobby";
      room.countdownEndsAt = null;
    }

    if (room.status === "racing") {
      this.finishIfComplete(room, now);
    }

    return { roomId: room.id, deleted: false, state: this.snapshot(room, now) };
  }

  tick(now = Date.now()) {
    const snapshots = [];

    for (const room of this.rooms.values()) {
      const changed = this.tickRoom(room, now);

      if (changed || room.status === "countdown" || room.status === "racing") {
        snapshots.push({ roomId: room.id, state: this.snapshot(room, now) });
      }
    }

    return snapshots;
  }

  getRoom(roomId) {
    return this.rooms.get(String(roomId ?? "").trim().toUpperCase()) ?? null;
  }

  getRoomBySocket(socketId) {
    const roomId = this.socketToRoom.get(socketId);
    return roomId ? this.rooms.get(roomId) ?? null : null;
  }

  snapshot(room, now = Date.now()) {
    const countdownRemainingMs =
      room.status === "countdown" && room.countdownEndsAt
        ? Math.max(0, room.countdownEndsAt - now)
        : 0;

    return {
      roomId: room.id,
      status: room.status,
      config: {
        minPlayers: this.config.minPlayers,
        maxPlayers: this.config.maxPlayers,
        trackLength: this.config.trackLength,
        tickMs: this.config.tickMs
      },
      canStart: room.status === "lobby" && room.players.size >= this.config.minPlayers,
      countdown: Math.ceil(countdownRemainingMs / 1000),
      players: [...room.players.values()].map((player) => ({
        id: player.id,
        nickname: player.nickname,
        color: player.color,
        position: round(player.position, 2),
        progress: round(player.position / this.config.trackLength, 4),
        speed: round(player.currentSpeed, 2),
        acceptedTaps: player.acceptedTaps,
        rejectedTaps: player.rejectedTaps,
        finished: player.finished,
        rank: player.rank
      })),
      results: room.results.map((result) => ({ ...result }))
    };
  }

  addPlayerToRoom(room, socketId, nickname, now) {
    const existingRoomId = this.socketToRoom.get(socketId);

    if (existingRoomId) {
      const existingRoom = this.rooms.get(existingRoomId);
      existingRoom?.players.delete(socketId);
      this.socketToRoom.delete(socketId);

      if (existingRoom && existingRoom.players.size === 0) {
        this.rooms.delete(existingRoom.id);
      } else if (
        existingRoom &&
        existingRoom.status === "countdown" &&
        existingRoom.players.size < this.config.minPlayers
      ) {
        existingRoom.status = "lobby";
        existingRoom.countdownEndsAt = null;
      }
    }

    const player = {
      id: socketId,
      nickname: sanitizeNickname(nickname, this.config.maxNicknameLength),
      color: DEFAULT_COLORS[room.players.size % DEFAULT_COLORS.length],
      position: 0,
      boostSpeed: 0,
      currentSpeed: 0,
      lastTapAt: Number.NEGATIVE_INFINITY,
      tapWindow: [],
      acceptedTaps: 0,
      rejectedTaps: 0,
      finished: false,
      finishTimeMs: null,
      rank: null,
      joinedAt: now
    };

    room.players.set(socketId, player);
    this.socketToRoom.set(socketId, room.id);
    room.updatedAt = now;

    return player;
  }

  tickRoom(room, now) {
    if (room.status === "countdown") {
      if (now < room.countdownEndsAt) {
        return true;
      }

      room.status = "racing";
      room.startedAt = room.countdownEndsAt;
      room.lastTickAt = room.countdownEndsAt;
      room.updatedAt = now;
      return true;
    }

    if (room.status !== "racing") {
      return false;
    }

    const deltaMs = Math.max(0, now - room.lastTickAt);

    if (deltaMs === 0) {
      return false;
    }

    const deltaSeconds = deltaMs / 1000;
    room.lastTickAt = now;
    room.updatedAt = now;

    const finishedThisTick = [];

    for (const player of room.players.values()) {
      if (player.finished) {
        continue;
      }

      const previousPosition = player.position;
      player.boostSpeed = Math.max(
        0,
        player.boostSpeed - this.config.boostDecayPerSecond * deltaSeconds
      );
      player.currentSpeed = this.config.baseSpeed + player.boostSpeed;
      player.position += player.currentSpeed * deltaSeconds;

      if (player.position >= this.config.trackLength) {
        const traveledThisTick = player.position - previousPosition;
        const finishRatio =
          traveledThisTick > 0
            ? (this.config.trackLength - previousPosition) / traveledThisTick
            : 1;
        const finishAt = now - deltaMs + Math.max(0, Math.min(1, finishRatio)) * deltaMs;

        player.position = this.config.trackLength;
        finishedThisTick.push({ player, finishAt });
      }
    }

    finishedThisTick
      .sort((left, right) => left.finishAt - right.finishAt)
      .forEach((entry) => this.finishPlayer(room, entry.player, entry.finishAt));

    this.finishIfComplete(room, now);
    return true;
  }

  finishPlayer(room, player, now) {
    if (player.finished) {
      return;
    }

    player.finished = true;
    player.finishTimeMs = room.startedAt ? now - room.startedAt : 0;
    player.rank = room.results.length + 1;
    player.position = this.config.trackLength;
    room.results.push({
      playerId: player.id,
      nickname: player.nickname,
      rank: player.rank,
      finishTimeMs: player.finishTimeMs,
      acceptedTaps: player.acceptedTaps
    });
  }

  finishIfComplete(room, now) {
    if (room.players.size === 0) {
      return;
    }

    const allFinished = [...room.players.values()].every((player) => player.finished);

    if (allFinished) {
      room.status = "finished";
      room.finishedAt = now;
      room.updatedAt = now;
    }
  }
}

export function sanitizeNickname(nickname, maxLength = GAME_CONFIG.maxNicknameLength) {
  const normalized = String(nickname ?? "").trim().replace(/\s+/g, " ");
  const clipped = normalized.slice(0, maxLength);
  return clipped || "Player";
}

function resetPlayerRaceState(player, now) {
  player.position = 0;
  player.boostSpeed = 0;
  player.currentSpeed = 0;
  player.lastTapAt = Number.NEGATIVE_INFINITY;
  player.tapWindow = [];
  player.acceptedTaps = 0;
  player.rejectedTaps = 0;
  player.finished = false;
  player.finishTimeMs = null;
  player.rank = null;
  player.readyAt = now;
}

function createRoomId(existingRooms) {
  let roomId = "";

  do {
    roomId = Array.from({ length: 4 }, () =>
      ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)]
    ).join("");
  } while (existingRooms.has(roomId));

  return roomId;
}

function round(value, digits) {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}
