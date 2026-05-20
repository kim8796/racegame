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
- Horse-type skill system tracked by the scoped repair contract below
- No mobile support

## Solo MVP Repair Contract

This product goal is to make `racegame` a polished MVP that is playable by one person. Repair the implementation in small auto-executable product tasks rather than one broad manual-review task.

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

## Finish Line and Multi-Lap Repair Contract

The active product goal is to fix the odd finish-line rendering so the marker sits inside the track lanes, and to let players configure more than one lap. Repair the implementation in small auto-executable product tasks with explicit validation.

### Executable Task Breakdown

1. **Lane-bounded finish marker**
   - Scope: `client/main.js`, `client/styles.css`, `tests/game.test.js`
   - Replace any malformed or out-of-lane finish visual with a rectangular finish marker positioned from the same oval-track geometry used for player lanes.
   - Validation: `npm test`, `npm run lint`, manual desktop browser check that the marker stays inside the lane band.

2. **Server-authoritative lap count**
   - Scope: `server/game.js`, `server/index.js`, `tests/game.test.js`
   - Add a validated lap count to race start/configuration and calculate finish distance as `trackLength * laps` so racers cannot finish after only one lap when multiple laps are selected.
   - Validation: `npm test`, `npm run lint`

3. **Lap selection and race feedback**
   - Scope: `public/index.html`, `client/main.js`, `client/styles.css`
   - Provide a lobby-only lap selector, send the selected value when starting, disable it during active races, and show current lap/progress while racing.
   - Validation: `npm test`, `npm run lint`, manual desktop browser check for one-lap and multi-lap races.

4. **Documentation alignment**
   - Scope: `README.md`
   - Update MVP notes and local usage after the finish-line and multi-lap implementation lands.
   - Validation: `git diff -- README.md`

### Done Criteria

- The finish marker is a clean lane-bounded visual inside the oval track, not a distorted circle or an asset floating outside the lanes.
- Players can select a valid lap count before the race starts, and the selection cannot change mid-race.
- Multi-lap races require the full configured distance and report lap/progress state to the client.
- Existing solo and multiplayer race flows remain intact.
- Each task must remain product-only and avoid harness files, backlog files, reports, runs, targets, `.env*`, and deployment state.

## Horse Types and Skills Repair Contract

The active product goal is to increase strategy by offering four horse types, each with one match-limited special skill triggered by `Left Shift`. Repair the implementation in small auto-executable product tasks with explicit validation.

### Executable Task Breakdown

1. **Server-owned horse type and skill contract**
   - Scope: `server/game.js`, `server/index.js`, `tests/game.test.js`
   - Define exactly four selectable or assigned horse types and expose each player's horse type, skill id, skill label, and per-race availability in the server snapshot.
   - Accept `input:skill` only while racing, reject duplicate use in the same race, and reset skill availability when a new race starts.
   - Validation: `npm test`, `npm run lint`

2. **Skill effect rules**
   - Scope: `server/game.js`, `tests/game.test.js`
   - Implement the four server-authoritative effects: 1.2x speed boost, terrain break that slows other horses by 20% on that terrain, teleport behind the nearest horse ahead, and magnetic repulse that pushes nearby horses away.
   - Clamp all position changes to the race distance, preserve finish/rank ordering, and cover edge cases where no valid target or nearby horse exists.
   - Validation: `npm test`, `npm run lint`

3. **Left Shift controls and race feedback**
   - Scope: `public/index.html`, `client/main.js`, `client/styles.css`
   - Bind `Left Shift` to skill activation, provide an equivalent on-screen skill control, and render horse type, skill name, availability, used state, and short activation feedback.
   - Ensure skill UI does not allow use before countdown completion, after finish, or more than once per match.
   - Validation: `npm run lint`, manual desktop browser check for keyboard and button activation

4. **Documentation alignment**
   - Scope: `README.md`
   - Update local controls, MVP scope, and gameplay notes after the four horse types and one-use skills are verified.
   - Validation: `git diff -- README.md`

### Done Criteria

- A race has exactly four horse types available, and every player has one visible horse type with a distinct skill.
- `Left Shift` activates the local player's skill during the race, and each player can use that skill at most once per race.
- The speed boost, terrain slow, teleport draft, and magnetic repulse effects are enforced by server state rather than client-only visuals.
- Existing solo, multiplayer, lap, finish, restart, and tap-rate behavior remains intact.
- Each task must remain product-only and avoid harness files, backlog files, reports, runs, targets, `.env*`, and deployment state.

## Bright Visuals and Help Menu Repair Contract

The active product goal is to brighten the race map, horse/rider characters, and game interface, and to keep a top-right `?` help affordance that explains controls and horse skills. Repair the implementation in small auto-executable product tasks with explicit validation.

### Executable Task Breakdown

1. **Light visual theme and readable race map**
   - Scope: `client/styles.css`, `tests/game.test.js`
   - Convert the page, panels, race stage, lane field, rails, and primary controls to a bright light palette with clear lane boundaries.
   - Add CSS-level assertions for light color scheme and minimum brightness on the body, race map, inner field, and controls.
   - Validation: `npm test`, `npm run lint`, manual desktop browser check that the map reads as bright without losing lane/finish visibility.

2. **Bright horse and rider sprites**
   - Scope: `client/styles.css`, `client/main.js`, `tests/game.test.js`
   - Update the local CSS horse/rider colors for all four horse types so coats, tack, jockey silks, labels, selected state, active skill state, and finished state stay visible on the brighter map.
   - Validation: `npm test`, `npm run lint`

3. **Top-right help menu with skill instructions**
   - Scope: `public/index.html`, `client/styles.css`, `client/main.js`, `tests/game.test.js`
   - Add or preserve a topbar action area with a right-aligned circular `?` control, an accessible help panel, and concise instructions for `Space`, `Left Shift`, the Skill button, and each horse skill effect.
   - Validation: `npm test`, `npm run lint`, manual desktop browser check that the help menu opens from the top-right and does not cover core race controls incoherently.

4. **Documentation alignment**
   - Scope: `README.md`
   - Update local controls, gameplay notes, and MVP scope after the bright theme and help menu implementation lands.
   - Validation: `git diff -- README.md`

### Done Criteria

- The game uses a light visual theme, and the interface, race map, and lane field no longer read as dark.
- Every horse/rider variant remains bright, distinct, and readable against the track.
- The topbar has a right-side circular `?` help control with instructions for tapping, skill activation, and the four skill effects.
- Existing solo, multiplayer, lap, finish, restart, skill, and tap-rate behavior remains intact.
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
