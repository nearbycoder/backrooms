# The Backrooms

[Play The Backrooms](https://nearbycoder.github.io/backrooms/play/) · [Visit the Liminal Archive](https://nearbycoder.github.io/backrooms/)

An endless first-person exploration game built with Three.js and Kenney’s Retro Textures Liminal pack. Each recording starts in the familiar yellow Lobby. Beyond it, connected rooms lead into blue offices, concrete service passages, and tiled Poolrooms. Look for changes in the floor finish and listen to how your footsteps change as you cross a threshold.

On the homepage, tune between four recordings captured in the game. Each opens muted with optional ambient sound. Select **Play demo** to start a playable expedition on the page, or **Full game** for the standalone view.

The maze streams around you as you walk. Each expedition has a new seed. Retracing your steps within an expedition brings back the same rooms and landmarks. The compass, maximum range, and numbered strips of floor tape help you keep your bearings. Pause to check which areas you’ve recorded.

A second set of footsteps means something may be closing in. Shine your flashlight directly at the figure, outrun it, or turn a corner and stay out of sight. If it catches you, the recording ends and you can begin a new expedition.

## Run

Use Node.js 22.12 or newer to install the dependencies and start the local server.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite for the homepage or append `play/` to launch the game. Playing requires WebGL 2. Run `npm test` for the procedural world and controller checks. Run `npm run build` to build both pages into `dist/` and `npm run preview` to serve them locally.

## Hosting

The [Pages workflow](.github/workflows/pages.yml) tests and publishes both pages on pushes to `main`. For a fork, select **GitHub Actions** as the publishing source in **Settings → Pages**. The workflow uses the repository’s Pages base path for assets and streaming workers.

To check the project URL locally, run `npm run build -- --base /backrooms/` and `npm run preview -- --base /backrooms/`. Open `/backrooms/` or `/backrooms/play/` on the preview server.

## Controls

| Action                        | Keyboard and mouse                | Standard gamepad (Xbox / PlayStation)         |
| ----------------------------- | --------------------------------- | --------------------------------------------- |
| Move                          | W, A, S, D or up/down arrows      | Left stick                                    |
| Look around                   | Mouse, drag, or left/right arrows | Right stick                                   |
| Sprint                        | Hold Shift                        | Hold LB / L1 or click and hold the left stick |
| Toggle flashlight             | F                                 | Y / Triangle                                  |
| Mark a direction on the floor | E                                 | X / Square                                    |
| Pause or resume               | Esc                               | Menu / Options                                |

Press a button on the connected controller so the browser can detect it. Use the D-pad or left stick to navigate menus, A / Cross to select, and B / Circle to go back. Left and right adjust a focused slider. Disconnecting the active controller pauses the expedition.

Hold Shift while moving to accelerate from a 2.65 m/s walk to a 7.6 m/s sprint. A full stamina bar lasts about ten seconds. On touchscreens, drag on the left to move and on the right to look. Use the onscreen buttons to sprint, shine the flashlight, mark your path, and pause. Your most recent 24 markers stay in the maze until the recording ends.

## Settings

Open **Settings** on the title screen or pause menu. Changes apply immediately and are saved in this browser.

- **Audio** controls master volume, ambience, sound effects, and mute. Use **Test mix** to hear the balance.
- **Display** adjusts brightness, field of view, light bloom, film grain, and camera motion. The camera feed stays visible while you adjust it.
- **Input** adjusts mouse, touch, and controller look sensitivity, offers inverted controller look, and includes button layouts. **Reset tab** restores just the category you have open.

## Assets

Kenney’s **Retro Textures Liminal 1.0** pack is available under CC0. Its original license is in [public/textures/License.txt](public/textures/License.txt). Barlow Condensed and IBM Plex Mono use the SIL Open Font License. Font licenses are included in [public/fonts](public/fonts). Three.js is distributed under the [MIT license](public/licenses/three.txt).
