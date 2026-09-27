# Kartographer

Kartographer is a virtual tabletop for in-person D&D. You run the game from the GM window, and a second window shows players only what they are allowed to see: the current scene, the shared camera, revealed fog, visible tokens, and pointer pings.

The same project runs on macOS and Windows. A MacBook plus an external display is the usual game-night setup. The GM window stays on the laptop. The player window fills the TV without opening a second macOS fullscreen Space.

## Run it

Install [Node.js](https://nodejs.org/) 22 or newer, then:

```bash
npm install
npm run dev
```

That is enough for a session on a MacBook or on Windows. `npm start` opens the last production build after `npm run build`.

### Player display

1. Import one or more images. A new scene is a map and starts covered in fog.
2. Choose the TV in **Player display**. On a MacBook this is the external display, not the built-in screen.
3. Click **Send to display**. The player window is borderless and sized to that display.
4. With only one screen attached, click **Open player view** and drag that window onto the TV when you connect it.

**Player → Send Player View to External Display** (Ctrl/Cmd+Shift+P) does the same thing. Press Escape in the player window if it ever covers the only screen. **Close player view** dismisses it from the GM window.

Handouts are plain images. Mark a scene as a handout when it should ignore the grid, fog, and tokens.

## Tools

- **Pan** (V) moves the map. The scroll wheel zooms. Space pans from any tool. **Fit** (F) frames the whole image. Each scene remembers its own camera, and the player window follows that frame.
- **Pointer** (P) drops a ping. Players see it only on a revealed cell.
- **Reveal** (R) and **Hide** (H) paint fog by grid cell. You see the map dimmed under the fog. Players see only revealed cells.
- **Show map** and **Cover map** reveal or hide every cell.
- **Token** (T) places a marker. Drag it to move it. Tokens snap to the grid while the grid is on. Hide a token from players when a monster has not appeared yet, or give it an image.
- **Grid** (G) sets the square cell size, offset, and color. Slide the grid to line it up, or drag one cell to measure its size. Changing the size or offset clears revealed fog, because the cells no longer match the map.

## Saved campaigns

Kartographer keeps one campaign on this computer:

- macOS: `~/Library/Application Support/Kartographer/campaign`
- Windows: `%APPDATA%\Kartographer\campaign`

`campaign.json` stores scenes, cameras, grid calibration, fog, and tokens. `assets/` holds copies of the images, so the campaign still opens if the original files move. **Show campaign folder** opens that location. Copy the whole `campaign` folder to another computer to move a game between a Windows machine and a MacBook.

## Installers

Development with `npm run dev` is the supported way to run a session. Optional installers are built on the operating system they target:

```bash
npm run dist:mac   # on macOS: .dmg and .zip
npm run dist:win   # on Windows: NSIS installer
```

An unsigned Mac build opens the first time with a right-click and **Open** (Gatekeeper). A paid Apple Developer certificate is not required.

## Later

Remote players are not in this version. The player window already receives a projection that omits hidden tokens and unrevealed fog, so a later self-hosted join can reuse that view.
