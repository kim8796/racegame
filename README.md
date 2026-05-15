# racegame

PC web multiplayer horse-racing MVP built with Node.js, Express, and Socket.IO.

Players create or join a room, wait until at least two players are present, then race by repeatedly pressing `Space`. The browser only sends tap input events. The server owns room state, countdown, speed, position, finish detection, ranking, and tap-rate limiting.

## Requirements

- Node.js 20 or newer
- npm

## Local Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000` in two or more desktop browser tabs. Create a room in one tab, join the room code from another tab, then start the race when at least two players are present.

## Scripts

```bash
npm run lint
npm test
npm run build
npm start
```

`npm run lint` always performs syntax checks and also runs ESLint when dependencies are installed. `npm run build` performs the same syntax checks for this static-client MVP. There is no separate frontend bundling step.

## MVP Scope

- 2 to 8 players per room
- One Node.js server serves the static frontend and Socket.IO real-time game traffic
- Server-authoritative simulation at a fixed tick rate
- Countdown before each race
- `Space` tap input only during the race
- Server-side anti-spam filtering for unusually fast tap input
- Full track view with nickname labels, player positions, local-player highlight, and shared finish results
- No skill system
- No mobile support

## Assets

Pixel-art horse/rider, track, and finish-line assets are included in `public/assets/` and rendered in the race screen. The source sprite sheet was generated with the built-in image generation tool using a chroma-key background, then cropped into project-local PNG assets.

## Deployment Candidate

Render Free Web Service is the first deployment candidate for this MVP because a single Node.js process can serve both Express static files and Socket.IO.

Render Free services may sleep after idle periods. The first request after sleep can have a cold start delay, so players should expect the lobby page or WebSocket connection to take longer after inactivity.

## Future Expansion Candidates

- Cloudflare Workers + Durable Objects for room affinity and edge-hosted state
- Google Cloud Run for containerized autoscaling
- Vercel or Cloudflare Pages if the frontend is split from the realtime server
- Optional skill system after the core tap-race loop is proven
- Licensed or original BGM. Current note-only candidate: `https://www.youtube.com/watch?v=OGWJuEmB91E`; confirm licensing before public or commercial deployment.
