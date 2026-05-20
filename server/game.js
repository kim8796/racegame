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

const SKILL_IDS = Object.freeze({
  SPEED_BOOST: "speed-boost",
  TERRAIN_BREAK: "terrain-break",
  TELEPORT_DRAFT: "teleport-draft",
  MAGNETIC_REPULSE: "magnetic-repulse"
});

export const HORSE_TYPES = Object.freeze([
  {
    id: "sprinter",
    name: "Sprinter",
    skill: {
      id: SKILL_IDS.SPEED_BOOST,
      name: "Speed Boost"
    }
  },
  {
    id: "breaker",
    name: "Breaker",
    skill: {
      id: SKILL_IDS.TERRAIN_BREAK,
      name: "Terrain Break"
    }
  },
  {
    id: "shadow",
    name: "Shadow",
    skill: {
      id: SKILL_IDS.TELEPORT_DRAFT,
      name: "Teleport Draft"
    }
  },
  {
    id: "magnet",
    name: "Magnet",
    skill: {
      id: SKILL_IDS.MAGNETIC_REPULSE,
      name: "Magnetic Repulse"
    }
  }
]);

const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const SOLO_OPPONENT_PROFILES = Object.freeze([
  { nickname: "Comet", speedPerSecond: 118, startDelayMs: 250 },
  { nickname: "Blaze", speedPerSecond: 136, startDelayMs: 450 },
  { nickname: "Rocket", speedPerSecond: 154, startDelayMs: 650 }
]);

export const GAME_CONFIG = Object.freeze({
  minPlayers: 1,
  maxPlayers: 8,
  soloOpponentCount: 3,
  trackLength: 1000,
  laps: 1,
  minLaps: 1,
  maxLaps: 12,
  tickMs: 50,
  countdownMs: 3000,
  tapDistance: 28,
  maxTapRatePerSecond: 12,
  minTapIntervalMs: 55,
  maxNicknameLength: 16,
  skillBoostMultiplier: 1.2,
  skillBoostDurationMs: 4000,
  terrainHazardRadius: 80,
  terrainSlowMultiplier: 0.8,
  teleportBehindDistance: 30,
  repulseRadius: 120,
  repulseDistance: 80
});

export class RaceGame {
  constructor(options = {}) {
    this.rooms = new Map();
    this.socketToRoom = new Map();
    this.config = normalizeConfig({ ...GAME_CONFIG, ...options.config });
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
      laps: this.config.laps,
      players: new Map(),
      terrainHazards: [],
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

  startRace(socketId, now = Date.now(), options = {}) {
    const room = this.getRoomBySocket(socketId);

    if (!room) {
      return { ok: false, error: "Join a room first." };
    }

    if (room.status !== "lobby") {
      return { ok: false, error: "Race is not in the lobby." };
    }

    if (room.players.size < this.config.minPlayers) {
      return { ok: false, error: "At least one player is required." };
    }

    const requestedLaps = getRequestedLaps(options);

    if (requestedLaps !== undefined) {
      const laps = parseLapCount(requestedLaps, this.config);

      if (laps === null) {
        return {
          ok: false,
          error: `Laps must be an integer from ${this.config.minLaps} to ${this.config.maxLaps}.`
        };
      }

      room.laps = laps;
    }

    this.ensureSoloOpponents(room, now);

    room.status = "countdown";
    room.countdownEndsAt = now + this.config.countdownMs;
    room.startedAt = null;
    room.finishedAt = null;
    room.terrainHazards = [];
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
    const raceDistance = getRaceDistance(room, this.config);
    const movementDistance = getSkillAdjustedDistance(
      room,
      player,
      this.config.tapDistance,
      now,
      this.config
    );

    player.position = Math.min(
      raceDistance,
      player.position + movementDistance
    );
    player.currentSpeed = 0;
    room.updatedAt = now;

    if (player.position >= raceDistance) {
      this.finishPlayer(room, player, now);
      this.finishIfComplete(room, now);
    }

    return { ok: true, accepted: true };
  }

  useSkill(socketId, now = Date.now()) {
    const room = this.getRoomBySocket(socketId);

    if (!room || room.status !== "racing") {
      return { ok: false, used: false, error: "Race is not running." };
    }

    const player = room.players.get(socketId);

    if (!player || player.finished) {
      return { ok: false, used: false, error: "Player is not racing." };
    }

    if (player.skillUsed) {
      return { ok: false, used: false, error: "Skill has already been used this race." };
    }

    const horseType = getHorseType(player.horseType);
    const applied = this.applySkill(room, player, horseType.skill.id, now);

    if (!applied.ok) {
      return applied;
    }

    player.skillUsed = true;
    player.skillActivatedAt = now;
    room.updatedAt = now;
    this.finishIfComplete(room, now);

    return {
      ok: true,
      used: true,
      horseType: horseType.id,
      skill: horseType.skill.id,
      effect: applied.effect
    };
  }

  leave(socketId, now = Date.now()) {
    const room = this.getRoomBySocket(socketId);

    if (!room) {
      return null;
    }

    room.players.delete(socketId);
    this.socketToRoom.delete(socketId);
    room.updatedAt = now;

    if (!hasHumanPlayers(room)) {
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

      if (changed || room.status === "countdown") {
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
    const raceDistance = getRaceDistance(room, this.config);

    return {
      roomId: room.id,
      status: room.status,
      config: {
        minPlayers: this.config.minPlayers,
        maxPlayers: this.config.maxPlayers,
        trackLength: this.config.trackLength,
        laps: room.laps,
        raceDistance,
        tapDistance: this.config.tapDistance,
        tickMs: this.config.tickMs,
        horseTypes: HORSE_TYPES.map(toHorseTypeSnapshot)
      },
      canStart: room.status === "lobby" && room.players.size >= this.config.minPlayers,
      countdown: Math.ceil(countdownRemainingMs / 1000),
      terrainHazards: (room.terrainHazards ?? []).map((hazard) => ({
        id: hazard.id,
        ownerId: hazard.ownerId,
        position: round(hazard.position, 2),
        radius: hazard.radius,
        slowMultiplier: hazard.slowMultiplier
      })),
      players: [...room.players.values()].map((player) => {
        const progress = getPlayerProgress(player.position, this.config.trackLength, room.laps);
        const horseType = getHorseType(player.horseType);

        return {
          id: player.id,
          nickname: player.nickname,
          color: player.color,
          horseType: horseType.id,
          horseTypeName: horseType.name,
          skill: {
            ...horseType.skill,
            used: player.skillUsed,
            available: room.status === "racing" && !player.finished && !player.skillUsed,
            active: isSkillActive(room, player, horseType.skill.id, now)
          },
          skillUsed: player.skillUsed,
          isBot: player.isBot,
          position: round(player.position, 2),
          lap: progress.lap,
          laps: room.laps,
          lapPosition: round(progress.lapPosition, 2),
          progress: progress.lapProgress,
          lapProgress: progress.lapProgress,
          overallProgress: progress.overallProgress,
          raceDistance,
          speed: round(player.currentSpeed, 2),
          acceptedTaps: player.acceptedTaps,
          rejectedTaps: player.rejectedTaps,
          finished: player.finished,
          rank: player.rank
        };
      }),
      results: room.results.map((result) => ({ ...result }))
    };
  }

  addPlayerToRoom(room, socketId, nickname, now) {
    const existingRoomId = this.socketToRoom.get(socketId);

    if (existingRoomId) {
      const existingRoom = this.rooms.get(existingRoomId);
      existingRoom?.players.delete(socketId);
      this.socketToRoom.delete(socketId);

      if (existingRoom && !hasHumanPlayers(existingRoom)) {
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
      isBot: false,
      position: 0,
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

    applyHorseType(player, room.players.size);
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

    if (room.status === "racing") {
      return this.tickBotOpponents(room, now);
    }

    return false;
  }

  ensureSoloOpponents(room, now) {
    const humanPlayers = [...room.players.values()].filter((player) => !player.isBot);

    if (humanPlayers.length !== 1) {
      return;
    }

    const availableSlots = Math.max(this.config.maxPlayers - room.players.size, 0);
    const opponentCount = Math.min(
      this.config.soloOpponentCount,
      availableSlots,
      SOLO_OPPONENT_PROFILES.length
    );

    for (let index = 0; index < opponentCount; index += 1) {
      const profile = SOLO_OPPONENT_PROFILES[index];
      const playerId = `bot:${room.id}:${index + 1}`;

      if (room.players.has(playerId)) {
        continue;
      }

      const bot = {
        id: playerId,
        nickname: profile.nickname,
        color: DEFAULT_COLORS[room.players.size % DEFAULT_COLORS.length],
        isBot: true,
        botSpeedPerSecond: profile.speedPerSecond,
        botStartDelayMs: profile.startDelayMs,
        position: 0,
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

      applyHorseType(bot, room.players.size);
      room.players.set(playerId, bot);
    }
  }

  tickBotOpponents(room, now) {
    if (room.startedAt === null || now <= room.lastTickAt) {
      return false;
    }

    let changed = false;

    for (const player of room.players.values()) {
      if (!player.isBot || player.finished) {
        continue;
      }

      const startAt = room.startedAt + player.botStartDelayMs;
      const activeFrom = Math.max(room.lastTickAt, startAt);

      if (now <= activeFrom) {
        player.currentSpeed = 0;
        continue;
      }

      const elapsedSeconds = (now - activeFrom) / 1000;
      const baseDistance = elapsedSeconds * player.botSpeedPerSecond;
      const distance = getSkillAdjustedDistance(
        room,
        player,
        baseDistance,
        now,
        this.config
      );
      const raceDistance = getRaceDistance(room, this.config);
      player.position = Math.min(raceDistance, player.position + distance);
      player.currentSpeed =
        player.position >= raceDistance ? 0 : distance / elapsedSeconds;
      changed = true;

      if (player.position >= raceDistance) {
        this.finishPlayer(room, player, now);
      }
    }

    room.lastTickAt = now;

    if (changed) {
      room.updatedAt = now;
      this.finishIfComplete(room, now);
    }

    return changed;
  }

  finishPlayer(room, player, now) {
    if (player.finished) {
      return;
    }

    player.finished = true;
    player.finishTimeMs = room.startedAt ? now - room.startedAt : 0;
    player.rank = room.results.length + 1;
    player.position = getRaceDistance(room, this.config);
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

  applySkill(room, player, skillId, now) {
    if (skillId === SKILL_IDS.SPEED_BOOST) {
      player.speedBoostUntil = now + this.config.skillBoostDurationMs;

      return {
        ok: true,
        effect: {
          multiplier: this.config.skillBoostMultiplier,
          endsAt: player.speedBoostUntil
        }
      };
    }

    if (skillId === SKILL_IDS.TERRAIN_BREAK) {
      const hazard = {
        id: `terrain:${player.id}:${now}`,
        ownerId: player.id,
        position: player.position,
        radius: this.config.terrainHazardRadius,
        slowMultiplier: this.config.terrainSlowMultiplier,
        createdAt: now
      };

      room.terrainHazards.push(hazard);

      return {
        ok: true,
        effect: {
          hazardId: hazard.id,
          position: round(hazard.position, 2),
          radius: hazard.radius,
          slowMultiplier: hazard.slowMultiplier
        }
      };
    }

    if (skillId === SKILL_IDS.TELEPORT_DRAFT) {
      return this.applyTeleportDraft(room, player, now);
    }

    if (skillId === SKILL_IDS.MAGNETIC_REPULSE) {
      return this.applyMagneticRepulse(room, player, now);
    }

    return { ok: false, used: false, error: "Unknown skill." };
  }

  applyTeleportDraft(room, player, now) {
    const target = [...room.players.values()]
      .filter((other) => other.id !== player.id && other.position > player.position)
      .sort((left, right) => left.position - right.position)[0];

    if (!target) {
      return { ok: false, used: false, reason: "no-target", error: "No racer is ahead." };
    }

    const nextPosition = Math.max(
      player.position,
      target.position - this.config.teleportBehindDistance
    );

    if (nextPosition <= player.position) {
      return {
        ok: false,
        used: false,
        reason: "target-too-close",
        error: "The racer ahead is already within teleport range."
      };
    }

    const raceDistance = getRaceDistance(room, this.config);
    player.position = Math.min(nextPosition, raceDistance);
    player.currentSpeed = 0;

    if (player.position >= raceDistance) {
      this.finishPlayer(room, player, now);
    }

    return {
      ok: true,
      effect: {
        targetId: target.id,
        position: round(player.position, 2)
      }
    };
  }

  applyMagneticRepulse(room, player, now) {
    const raceDistance = getRaceDistance(room, this.config);
    const movedPlayers = [];

    for (const other of room.players.values()) {
      if (other.id === player.id || other.finished) {
        continue;
      }

      const distanceFromPlayer = other.position - player.position;
      const absoluteDistance = Math.abs(distanceFromPlayer);

      if (absoluteDistance >= this.config.repulseRadius) {
        continue;
      }

      const direction = distanceFromPlayer >= 0 ? 1 : -1;
      const forceRatio = 1 - absoluteDistance / this.config.repulseRadius;
      const pushDistance = this.config.repulseDistance * forceRatio;
      other.position = Math.max(
        0,
        Math.min(raceDistance, other.position + direction * pushDistance)
      );
      other.currentSpeed = 0;

      if (other.position >= raceDistance) {
        this.finishPlayer(room, other, now);
      }

      movedPlayers.push({
        playerId: other.id,
        position: round(other.position, 2)
      });
    }

    if (movedPlayers.length === 0) {
      return {
        ok: false,
        used: false,
        reason: "no-nearby-racers",
        error: "No nearby racers to repel."
      };
    }

    return {
      ok: true,
      effect: {
        movedPlayers
      }
    };
  }
}

export function sanitizeNickname(nickname, maxLength = GAME_CONFIG.maxNicknameLength) {
  const normalized = String(nickname ?? "").trim().replace(/\s+/g, " ");
  const clipped = normalized.slice(0, maxLength);
  return clipped || "Player";
}

function resetPlayerRaceState(player, now) {
  player.position = 0;
  player.currentSpeed = 0;
  player.lastTapAt = Number.NEGATIVE_INFINITY;
  player.tapWindow = [];
  player.acceptedTaps = 0;
  player.rejectedTaps = 0;
  player.skillUsed = false;
  player.skillActivatedAt = null;
  player.speedBoostUntil = null;
  player.finished = false;
  player.finishTimeMs = null;
  player.rank = null;
  player.readyAt = now;
}

function hasHumanPlayers(room) {
  return [...room.players.values()].some((player) => !player.isBot);
}

function normalizeConfig(config) {
  const minLaps = Math.max(1, Math.trunc(Number(config.minLaps)) || GAME_CONFIG.minLaps);
  const maxLaps = Math.max(minLaps, Math.trunc(Number(config.maxLaps)) || GAME_CONFIG.maxLaps);
  const laps = parseLapCount(config.laps, { minLaps, maxLaps });
  const defaultLaps = Math.min(Math.max(GAME_CONFIG.laps, minLaps), maxLaps);

  return {
    ...config,
    minLaps,
    maxLaps,
    laps: laps ?? defaultLaps
  };
}

function getRequestedLaps(options) {
  if (!options || typeof options !== "object") {
    return undefined;
  }

  return options.laps ?? options.lapCount;
}

function parseLapCount(value, config) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const laps = Number(value);

  if (!Number.isInteger(laps) || laps < config.minLaps || laps > config.maxLaps) {
    return null;
  }

  return laps;
}

function getRaceDistance(room, config) {
  return config.trackLength * room.laps;
}

function applyHorseType(player, playerIndex) {
  const horseType = HORSE_TYPES[playerIndex % HORSE_TYPES.length];
  player.horseType = horseType.id;
  player.skillUsed = false;
  player.skillActivatedAt = null;
  player.speedBoostUntil = null;
}

function getHorseType(horseTypeId) {
  return HORSE_TYPES.find((horseType) => horseType.id === horseTypeId) ?? HORSE_TYPES[0];
}

function toHorseTypeSnapshot(horseType) {
  return {
    id: horseType.id,
    name: horseType.name,
    skill: { ...horseType.skill }
  };
}

function isSkillActive(room, player, skillId, now) {
  if (skillId === SKILL_IDS.SPEED_BOOST) {
    return Boolean(player.speedBoostUntil && player.speedBoostUntil > now);
  }

  if (skillId === SKILL_IDS.TERRAIN_BREAK) {
    return (room.terrainHazards ?? []).some((hazard) => hazard.ownerId === player.id);
  }

  return false;
}

function getSkillAdjustedDistance(room, player, baseDistance, now, config) {
  const boostedDistance = baseDistance * getSpeedBoostMultiplier(player, now, config);

  if (isSlowedByTerrain(room, player, player.position, player.position + boostedDistance)) {
    return boostedDistance * config.terrainSlowMultiplier;
  }

  return boostedDistance;
}

function getSpeedBoostMultiplier(player, now, config) {
  return player.speedBoostUntil && player.speedBoostUntil > now
    ? config.skillBoostMultiplier
    : 1;
}

function isSlowedByTerrain(room, player, fromPosition, toPosition) {
  const start = Math.min(fromPosition, toPosition);
  const end = Math.max(fromPosition, toPosition);

  return (room.terrainHazards ?? []).some((hazard) => {
    if (hazard.ownerId === player.id) {
      return false;
    }

    return end >= hazard.position - hazard.radius && start <= hazard.position + hazard.radius;
  });
}

function getPlayerProgress(position, lapLength, laps) {
  const raceDistance = lapLength * laps;
  const boundedPosition = Math.max(0, Math.min(position, raceDistance));
  const finished = boundedPosition >= raceDistance;
  const lapIndex = finished
    ? laps - 1
    : Math.min(Math.floor(boundedPosition / lapLength), laps - 1);
  const lapPosition = finished ? lapLength : boundedPosition - lapIndex * lapLength;

  return {
    lap: lapIndex + 1,
    lapPosition,
    lapProgress: round(lapPosition / lapLength, 4),
    overallProgress: round(boundedPosition / raceDistance, 4)
  };
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
