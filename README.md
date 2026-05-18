# racegame

PC web multiplayer horse-racing MVP built with Node.js, Express, and Socket.IO.

Players create or join a room, wait until at least two players are present, then race by repeatedly pressing `Space`. Each accepted press moves the horse a fixed distance, and horses do not advance without input. The browser only sends tap input events. The server owns room state, countdown, position, finish detection, ranking, and tap-rate limiting.

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
- Server-authoritative countdown and tap movement
- Countdown before each race
- `Space` tap input only during the race
- Server-side anti-spam filtering for unusually fast tap input
- Full track view with nickname labels, player positions, local-player highlight, and shared finish results
- No skill system
- No mobile support

## Solo MVP Repair Contract

The active product goal is to make `racegame` a polished MVP that is playable by one person. Repair the implementation in small auto-executable product tasks rather than one broad manual-review task.

### Executable Task Breakdown

1. **Single-player race entry**
   - Scope: `server/game.js`, `server/index.js`, `client/main.js`, `public/index.html`
   - Implement a solo race path that can start from one browser tab without requiring a second human player or room join flow.
   - Validation: `npm test`, `npm run lint`

2. **Solo opponent or timing objective**
   - Scope: `server/game.js`, `client/main.js`, `client/styles.css`
   - Add either CPU-controlled opponents or a clear time-trial objective so a solo player has a finish condition and feedback beyond reaching the line alone.
   - Validation: `npm test`, `npm run lint`

3. **Complete solo race UX**
   - Scope: `client/main.js`, `client/styles.css`, `public/index.html`
   - Ensure the first screen, countdown, racing state, finish state, restart flow, and keyboard controls are understandable from one tab.
   - Validation: `npm run lint`, manual browser check in one desktop tab

4. **Solo MVP documentation alignment**
   - Scope: `README.md`
   - Update local run instructions, MVP scope, and acceptance notes after the solo implementation lands.
   - Validation: `git diff -- README.md`

### Done Criteria

- A new player can run the app locally, open one desktop browser tab, start a race, finish it, see a result, and restart without opening another tab.
- Existing multiplayer behavior is preserved unless a later scoped task explicitly changes it.
- Each task must remain product-only and avoid harness files, backlog files, reports, runs, targets, `.env*`, and deployment state.

## Assets

The race screen renders an oval track and animated horse/rider characters with local CSS so every player can use their assigned color on the jockey silks and saddle cloth. Legacy PNG assets remain in `public/assets/` for future replacement or fallback use.

## Deployment Candidate

Render Free Web Service is the first deployment candidate for this MVP because a single Node.js process can serve both Express static files and Socket.IO.

Render Free services may sleep after idle periods. The first request after sleep can have a cold start delay, so players should expect the lobby page or WebSocket connection to take longer after inactivity.

## Future Expansion Candidates

- Cloudflare Workers + Durable Objects for room affinity and edge-hosted state
- Google Cloud Run for containerized autoscaling
- Vercel or Cloudflare Pages if the frontend is split from the realtime server
- Optional skill system after the core tap-race loop is proven
- Licensed or original BGM. Current note-only candidate: `https://www.youtube.com/watch?v=OGWJuEmB91E`; confirm licensing before public or commercial deployment.
