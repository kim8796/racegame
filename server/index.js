import express from "express";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Server } from "socket.io";
import { GAME_CONFIG, RaceGame } from "./game.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: false
  }
});
const game = new RaceGame();

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

  socket.on("room:start", (_payload, callback) => {
    const result = game.startRace(socket.id);
    const room = game.getRoomBySocket(socket.id);

    acknowledge(callback, result);

    if (result.ok && room) {
      broadcastRoom(room.id);
    }
  });

  socket.on("input:tap", (...args) => {
    const callback = args.find((arg) => typeof arg === "function");
    const result = game.recordTap(socket.id, Date.now());

    acknowledge(callback, result);
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
