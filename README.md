# Bloom 🌱

**A little play. A lot of growth.** A polished, parent-friendly math arcade game built with vanilla JavaScript, Canvas 2D, and Vite.

## Play online

**Live demo:** https://varun-dev-web.github.io/lm-arena-projects-general/

The game is hosted on GitHub Pages. Pushes to the active Arena branch or `main` run the tests, build the app, and deploy `dist/` through the workflow in `.github/workflows/deploy-pages.yml`.

## Run locally

```sh
npm install
npm run dev
```

Open the local URL printed by Vite. The development server binds to `0.0.0.0` and accepts Arena's `e2b.app` preview hosts.

```sh
npm test          # Math, difficulty, and persistence tests
npm run build    # Production build in dist/
npm run preview  # Serve the production build
```

## The game

Guide a happy little sprout under the correct falling answer. Each round lasts **60 seconds**, with **three hearts**. Correct catches earn 100 points times the current combo multiplier; every three consecutive catches increases the multiplier, up to ×5. A wrong catch or a missed correct answer costs a heart and resets the streak. Each successful catch grows a flower in the garden.

The first problem is immediately readable and catchable. Difficulty gradually introduces subtraction, multiplication, and division while increasing the fall speed. Wrong answers are plausible, unique, nonnegative integers. A missed round briefly highlights the correct answer.

### Controls

| Action | Keyboard | Touch / pointer |
| --- | --- | --- |
| Move | Left / Right or A / D | Drag on the garden, tap a destination, or hold the arrow buttons |
| Start | Enter / Space | Let's play |
| Pause / resume | Space, P, or Escape | Pause / Keep growing |
| Restart | R after a round or while paused | One more grow / Start fresh |
| Sound | M | Sound toggle |

The game automatically pauses when its tab is hidden or its window loses focus. Opening the instructions pauses an active round and closing them resumes it. Restart is immediate, with no countdown or reload.

## Parent-friendly details

- Short, self-contained rounds; no infinite progression or pressure to keep playing.
- Mental arithmetic with visible, encouraging correction after mistakes.
- No advertising, analytics, accounts, remote APIs, or runtime CDN dependencies.
- Fonts are bundled locally. The five best scores and sound preference stay in local storage.
- If browser storage is blocked or full, gameplay continues with session-only records.
- Keyboard-accessible menus, native modal dialogs, live math/result announcements, and reduced-motion support.

## Implementation

- `src/game.js`: requestAnimationFrame loop, bounded simulation substeps, collision detection, responsive playfield, cached scenery, pot/answer rendering, capped particles, flowers, and screen shake.
- `src/main.js`: accessible UI, keyboard/pointer input, state transitions, dialogs, and score table.
- `src/math.js`: deterministic-testable problem generation and difficulty/scoring rules.
- `src/audio.js`: short synthesized Web Audio effects, unlocked by user interaction.
- `src/storage.js`: validated, versioned local high scores with graceful storage fallback.
- `src/style.css`: responsive garden theme, locally bundled DM Sans and Fredoka, touch controls, and reduced-motion styles.

Canvas resolution is capped at 2× device pixel ratio. Static scenery is cached; particles and garden flowers are bounded. Animation uses elapsed time rather than frame counts. Actual frame rate depends on the device and browser; reduced-motion mode disables shake and minimizes decorative motion.

The original repository poster is left unchanged.
