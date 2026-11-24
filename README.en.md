# DFO-Client-Expander-RU — v1.30.0

> [Русская версия](README.md) · **English**

**Author: AutomaticYobaMachine.** Created for the **Daggerfall Online (DFO Online)** community — fully bilingual in **English** and **Russian**.

An unofficial client extension for **Daggerfall Online**: comprehensive UI overhauls, an Action-RPG inventory with sculpted set relics, zero-scroll item cards with descriptions, Spellbook v2 and a redesigned Spellmaker with live 3D/canvas visualization, animated bank treasury vaults, streamlined containers and trade, a modular 8-category font system, optional full Russian localization, Overworld venue marks & interactive town map, smart nearby loot with loot filter & autoloot, dungeon forecast cards & live HUD, and spell-driven 3D dungeon navigation.

This repository hosts only the client extension source code and release — not the game itself.  
**Original Daggerfall Online project:** <https://github.com/Lattymoy/daggerfall-js-source>

---

## Download (v1.30.0)

**[Download Standalone Windows 10/11 x64 Installer (EXE)](https://github.com/AutomaticYobaMachine/DFO-Client-Expander-RU/releases/download/v1.30.0/DFO-Client-Expander-RU-1.30.0.exe)**

- [ZIP package (installer EXE, EN/RU guides, and licenses)](https://github.com/AutomaticYobaMachine/DFO-Client-Expander-RU/releases/download/v1.30.0/DFO-Client-Expander-RU-1.30.0.zip)
- [v1.30.0 Release Page](https://github.com/AutomaticYobaMachine/DFO-Client-Expander-RU/releases/tag/v1.30.0)
- A local copy of the release binaries and SHA-256 checksums is also included in [`releases/1.30.0/`](releases/1.30.0/).

`DFO-Client-Expander-RU-1.30.0.exe` is completely self-contained: every script, font, audio cue, localization pack, and guide is embedded inside the single executable. Players do **not** need Node.js, Go, Python, or manual building.

---

## Quick Installation

1. Close **DFO Online** completely.
2. Launch `DFO-Client-Expander-RU-1.30.0.exe`.
   - The installer opens in your Windows language automatically (on non-Russian Windows, **Russian translation** starts unchecked and every mod window runs in clean English).
3. The installer detects your game folder automatically. If needed, click **“Choose game…”** and point to `DFO Online.exe`.
4. Tick the modules you want, optionally bind your hotkeys, and customize fonts in the **“Fonts”** dialog.
5. Click **“Install selected”**, wait for completion, and start the game as usual.

### How It Integrates Safely

- Creates an automatic clean backup (`app.asar.dfo-mod-original.bak`) before making any changes.
- Wraps Electron's `dagger://` protocol handler inside `app.asar` and injects transforms on the fly as assets are served.
- Official per-file game updates (`%APPDATA%\DFO Online\Game\...`), `ARENA2` files, and player saves are **never modified** — the game keeps updating normally.
- **Fail-closed safety:** if a future game update changes an expected signature, that hook disables itself cleanly and logs the detail to `dfo-mod.log`, while the client continues running normally.
- **“Remove extension”** restores the clean original `app.asar` (including original fonts) while preserving your saved settings and caches.

---

## Standalone Installer

A standalone Go executable for Windows 10/11 x64 featuring a custom RPG WebView2 interface (with automatic fallback to a native Win32 window when WebView2 is unavailable):

- Animated pixel-art dungeon scene, custom DFO gauntlet cursor with glow trail, and toggleable launcher theme audio.
- Instant **English / Русский** language switch remembered across runs.
- 6 feature cards: 1 always-on core UI package and 5 independently toggleable modules.
- Built-in hotkey capture for **Loot nearby** and **Dungeon intel** — supports standard keys, NumPad keys (even with Num Lock off), and mouse buttons **3 / 4 / 5**.
- Built-in **Font Manager** across all 8 typography categories with live previews and shareable JSON preset import/export.
- **Safe Self-Updater**: checks GitHub Releases on launch without downloading anything until you confirm; verifies file size, SHA-256 digest, product metadata, and health-check probe before swapping the EXE. Applying changes to the game client is always triggered manually by button click.
- **Session Log** dialog with log export and quick links to `dfo-mod-installer.log`, `dfo-mod.log`, and `dfo-mod-marks.txt`.

---

## Features

### 1. Enhanced Interfaces *(core module, always enabled)*

The core UI package unifies the game's screens under the calibrated dark-slate **Enhanced Plus (Slate)** style so all overhauled interfaces stay sharp and conflict-free (cursor, hover tooltips, gamepad bindings, Texture Overhaul, and Sound Overhaul remain configurable).

#### Inventory & Equipment Panel
- **Dual Equipment Layouts** (switchable in the window header):
  - **Action-RPG Style** — expanded equipment column featuring detailed animated **Set Relic sculptures** for all 15 DFO equipment sets (evolving visually across set tiers), plus a flip-card stats & full gear summary.
  - **Vanilla Inventory** — classic equipment layout with calibrated framing.
- **List / Icons View**:
  - **List mode** displays card-styled item rows in **2 columns** when opened alone, and **1 column** when paired beside a chest, wagon, bag, or body.
  - **Icons mode** restores the classic square icon grid without changing the window footprint.
- **9 Streamlined Pages**:
  - The redundant *Magic* tab is removed — enchanted items live in their base item category.
  - *Ingredients* contains strictly items consumed by actual game recipes (alchemy, cooking, smithing, carpentry, leatherworking, tailoring, jewelcrafting, masonry).
  - Notes and quest letters live in *Books*, and quest letters are **auto-locked on receipt**.
  - Dedicated customizable **“Junk…”** page configured via loot-filter tags (quest items are never sent to Junk).
- **Full-Card Omnibox Search** (`Find…`): searches across every inventory tab by complete item-card content (name, material, stats, affixes, sockets, set bonuses, statuses).
- **Permanent Auto-Sort (5 Profiles)**: *By Rarity*, *By Item Type*, *By Material*, *Alphabetical*, and *By Stack Count*. Locked and quest items always appear first.
- **Surrogate Stacking**: identical items in Misc, Ingredients, and Junk group neatly into a single cell.
- **Rich Status Footer**:
  - Live balances for **Gold** (broken down into pocket coins & letters of credit), **Velkynd Shards**, **Deadlands Embers**, **Silver Marks**, and **Aurum**, each with an informative hover guide.
  - Carry weight readout, quick **Materials Bag**, **Stow Gold**, and **Drop Gold** buttons.
  - **In-Game Date & Time** with a hover breakdown explaining Local Player Time vs. Server World Time.
  - **Character State** tooltip (health, diseases, poisons, vampirism/lycanthropy, survival needs & boons).
  - **Reputation & PvP Villainy** tooltip (regional standing, social groups, guilds, factions, legal status/bounties, and red-skull villainy meter).

#### Zero-Scroll Item Cards & Quick-Loot
- **Unified two-column item card** across inventory, containers, trade, and chat links — dynamically balances blocks to fit on screen with zero inner scrollbar.
- Displays **Equipment Slot** and **Trained Weapon Skill** (read from live game tables), **Material** colored by metal tier (separate from Armor Type / RRI construction), organized effect groups (*Passive Properties*, *Bonuses*, *When Strikes*, *When Used*, *When Held*, *Legendary Power*), native sigil, set, and equipped comparison blocks.
- **Approximate Sale Valuation** (~40% of adjusted sale basis rounded to 10, plus price per kg), shown even for unidentified pieces without leaking hidden attributes; exact value for gold and letters of credit.
- **Literary Item Descriptions & Gameplay Hints** at the bottom of the card (in English or Russian matching your setup), derived strictly from visible item properties.
- **Quick-Loot Plaque**: compact live stat card beside the crosshair loot list plus card-styled container/body rows (armor type & metal, weight, coin-badged price).

#### Containers, Rewards & Fate Windows
- Unified overhaul for **chests, storage, wagon, materials bag, and ground piles**: card-styled rows, full-card search, category/rarity/material filters, 5 sort modes, pocket gold & carry weight meters, vault pour, and Take All.
- **Fast Stack Transfers**: `LMB` takes/stows 1 item, `Shift + LMB` moves the full stack, `Ctrl + Shift + LMB` opens a custom quantity prompt, `RMB` opens the context menu (1 / stack / custom / inspect card).
- Overhauled **Reward Picker** (*Choose 1 of N* with full card hover) and **Fate Dialog** (`1` Execute for Trophy / `2` Spare for Mercy, with trophy card hover).

#### Spellbook v2
- **Live animated spell visualization** inside every expanded spell card (reflecting magic school, element, and multi-school synthesis; click to pulse or pause).
- **Magicka & Regeneration Bar** with a full per-round source breakdown tooltip (Firmament constellations, equipped Attune powers, `<50% MP` boost, NoRegen career disadvantage warning).
- **6 Magic School Filter Chips** with effective skill breakdown tooltips listing every active modifier (base, equipment affixes, enchantments, sigil sets, legendary powers, Firmament, Arcane/Martial Mastery, vampirism/lycanthropy, softcap, mentoring).
- Search by name, effect, school, or element; **6 sort modes** including **Custom Drag-and-Drop Order** (saved in mod cache).
- Inline spell renaming, 69+ icon picker & text-sigil mode toggle, hover `1–0` hotbar binding, quickslot `[Q]`, PvP spells button, and delete confirmation (protecting undeletable vampire/lycanthrope powers).

#### Spellmaker Overhaul
- Calibrated 1/3 + 2/3 workspace featuring **live modular 3D/canvas visualization** by school and element.
- **Dual-pane 94-effect catalog picker** with mechanics cards, **engine quirk warning plaques** (magic-only resistance bypasses, Master Skills >100 scaling, optimal chance tuning), and expandable **exact engine formula spoilers**.
- 3-panel gold-slider **Effect Parameter Editor** (Duration, Chance, Magnitude).
- **69-icon school-grouped selector** with automatic first-effect icon pick.
- Built-in **bilingual (EN/RU) modular spell name generator** and interactive Spell Mechanics Guide.

#### Redesigned Service Windows (Bank, Trade, Enchanting & Broker)
- **Bank**: animated live treasury scenes (gold & jewel safe, letters of credit ledger, and silver mark stacks scaling dynamically with your real balance), quick preset buttons (`10k`, `50k`, `100k`, `250k`, `500k`, `1M`, custom), one-click **Cash in Letters**, **Sell Silver** with exchange rate & daily cap progress, plus Property, Fleet, and Loan Due readouts.
- **Trade**: card-styled rows, custom **trade deal audio cue (`trade_deal.wav`)**, quick stack staging (`2×LMB` = 1, `Shift + 2×LMB` = full stack, `Ctrl + Shift + 2×LMB` = custom amount), and **Sell Junk** synced with your custom Junk rules.
- **Enchanting (Item Maker), Spellshop, Sigil Broker & Orders Board**: crisp readability, complete localization, and live detail panes calculating exact client formulas for enchantments, point budgets, wear rates, and side effects.

#### Modular 8-Category Community Font System
- Completely replaces all vanilla bitmap, SDF, and web fonts across DOM, Canvas, OffscreenCanvas Workers, classic & enhanced book readers (+35% book legibility), and the launcher — with zero external font network requests:
  1. **Core Interface** — `DFO Gabin`
  2. **Headings & Titles** — `DFO Greengoth`
  3. **Descriptions, Chat, Dialogues & Journal** — `DFO Flow`
  4. **Numbers & Counters** — `DFO Flexi`
  5. **Books & Scrolls** — `DFO Hangyaku`
  6. **Legendary Powers** — `DFO Wolga`
  7. **Sigils & Runes** — `DFO Ckazka`
  8. **Set Names** — `DFO Ritalin`
- Open the **“Fonts”** dialog in the installer to replace any single category (or all 8 at once) with your own `.ttf`, `.otf`, `.woff2`, or `.woff` files, reset to base, or export/import shareable JSON presets. Custom fonts live in `%APPDATA%\DFO Online\dfo-mod-fonts\` and apply on next game launch without repacking `app.asar`.

#### Quality-of-Life Enhancements & Client Fixes
- **Instant Skill Readiness Indicator & Chime**: displays the bottom-left yellow skill-ready HUD icon the exact moment a skill hits 100%, fixes the 6-hour (360-minute) boundary off-by-one and premature timer reset bugs, and plays a crisp notification chime (`skill_up.wav`) on readiness and level-up.
- **Enhanced Chat Links & URLs**: cross-locale `[Item]` link matching (EN/RU), bilingual `[` item autocomplete, hover & click-to-inspect item cards without click-through into the 3D scene, and clickable/copyable URLs.
- **Expanded Manual Waypoints**: raises the per-category manual waypoint limit from 64 to **512**.
- **Overworld Label Calibration**: dungeon, resource, and enemy labels auto-show within 1 km and appear on hover beyond that distance to keep the map clean.

---

### 2. Russian Translation *(optional toggle)*

- Complete Russian localization of the UI, launcher, character creation, tutorials, skills, dialogues, quests & questlines (including live QRC refresh on loaded saves), classic books, and DFO Online custom books.
- Grammatically inflected Russian naming for procedurally generated Magic, Rare, Legendary, and crafted items.
- Keeps original Overworld city and building names where needed for map search.
- Uncheck this module to use the entire extension in **English**.

---

### 3. Marks & Town Map *(optional toggle)*

- **Overworld Venue Marks** for **Taverns**, **Shops**, and **Organizations** (guilds & temples) with dedicated Overworld filter toggles (marks up to 1200 m, labels within 300 m, capped at 60 nearest).
- **“Only visited”** toggle hides buildings your character has not entered yet.
- Displays live **shop buy-back percentages** computed via the game's own pricing rules — both the general town rate and your personal rate factoring in Mercantile, Personality, and guild discounts.
- **Detailed Interactive Town Map**:
  - Toggleable map layers: **Guild Influence**, **Doors & Owners**, and **Venue Marks**.
  - Inspectable cards for houses, guild halls, and venues.
  - 7-tab **Town Info** panel: *Overview*, *Guilds*, *Residents* (including players online), *Real Estate* (occupied/free homes, rooms for rent, owner sales), *Venues* (shops & buy-back table), *Economy* (prosperity, port exchange, best shops to sell), and *Seat* (ruling guild, edict, tithe, weekly battles).

---

### 4. Loot Nearby, Loot Filter & Autoloot *(optional toggle, default `J`)*

- Opens a single unified loot window aggregating enemy drops and floor items within **10 m** — automatically narrowing to **3 m** whenever another player is within **50 m** across all 3 axes.
- Covers bodies, floor piles, slopes & cliff drops, stuck arrows, Sky-Ketch & Rift floor spoils, and already-searched chests (while their search cooldown is active).
- Enforces line-of-sight and floor separation checks (2.25 m indoors; walls, closed doors, and other storeys are excluded).
- **Pure live view — never a container or duper:** items remain in their original piles and bodies until picked up via the game's native weight-checked transfer logic. Unopened containers, furniture, stashes, and player corpses are untouched.
- **Loot Filter**: two-column tag catalog (categories, rarities, materials, affixes, properties, item types), mutually exclusive **Whitelist** / **Blacklist** modes, and JSON preset save/load (`%APPDATA%\DFO Online\dfo-mod-loot-presets\`).
- **Autoloot** *(off by default)*: automatically collects matching tags or specific items on loot-key press before opening the window.
- **Take All** collects everything matching the active view filter.

---

### 5. Dungeon Intel & Live HUD *(optional toggle, default `K`)*

- **Overworld Dungeon Forecast Cards**: discovered dungeons get a 3-line summary label showing type, rank, size (`S/M/L`), permanent vs. spawned status (with despawn countdown when known), and personal ratings: **Threat (`☠`)**, **Loot (`◆`)**, **Growth (`↑`)**, and **Renown (`★`)**. Undiscovered `?` sites stay hidden.
- Clicking opens a 5-tab forecast card (**Rating**, **Inhabitants**, **Loot**, **Power & Growth**, **Details**) with a formula Mini-Guide and native **Travel** button — calculated purely from game tables and your character's stats without touching RNG or dungeon generation.
- **In-Dungeon Live HUD**: non-intrusive click-through panel top-right displaying live **Alive Enemies**, **Individual Elites**, and **Players in Room** (refreshed twice per second).
- **4-Tab Dungeon Summary Window (`K` or custom key)**:
  - **Summary** — live counters, nearest enemy/source respawn timer, weekly Aurum chest status, and active quests in this dungeon (click any quest to jump directly to it in the Quest Journal).
  - **Enemies** — live enemy roster with levels, combined HP, individual elite traits, and dungeon boost indicators.
  - **Loot** — rarity probabilities factoring in your Luck plus preferred legendaries.
  - **Preparation** — weapon material suitability check against expected foes and elite readiness notes.

---

### 6. Dungeon Navigation *(optional toggle, bound to “Shared Cartography”)*

- Lore-friendly 3D dungeon pathfinder bound strictly to the **“Shared Cartography”** spell (School of Mysticism).
- Casting Shared Cartography on yourself inside a dungeon opens a target picker: **“To Exit”** or **“To Quest Target”** (quest carrier, corpse, or quest item).
- Computes a true player-capsule 3D path from the loaded dungeon collider across stairs, slopes, climbs, elevator shafts, and directional portals (doors and levers stay manual; zero auto-movement).
- Renders the route directly in 3D space via a custom WebGL2 shader (`CloudPass`) as **glowing pink Mysticism clouds with sparks and soft dynamic lights**.
- Active only while the spell effect lasts; recast anytime to switch target or choose **“Clear route”**.

---

## Configuration & Data Files

All user settings and diagnostics are stored inside `%APPDATA%\DFO Online\`:

| Path | Purpose |
| --- | --- |
| `dfo-mod.json` | Module toggles and core extension configuration |
| `dfo-mod-cache.json` | Unified cache: hotkeys, town map data, dungeon notes, loot/inventory settings, custom spellbook order |
| `dfo-mod-fonts/` | Custom user font files and `preset.json` |
| `dfo-mod-loot-presets/` | Saved Loot Filter JSON presets |
| `dfo-mod-installer.log` | Full installer & self-updater log |
| `dfo-mod.log` | Game session hook diagnostics |
| `dfo-mod-marks.txt` | Venue marks and shop buy-back report |

---

## Repository Structure

| Path | Contents |
| --- | --- |
| `src/gui/` | Standalone Go Windows installer (WebView2 RPG UI + Win32 fallback, Font Manager, safe self-updater) |
| `src/patcher.cjs`, `src/asar.cjs`, `src/ru-build.cjs` | Electron ASAR patcher and localization payload builder |
| `src/mod/` | `dagger://` runtime hook, bundle transforms, page scripts, `en`/`ru` locale tables, community fonts & SFX |
| `data/` | Localization dictionaries, manual fixes (`ru-fixes`), built pack (`ru-pack`), quest & book translations |
| `tools/` | Build pipeline (`build.sh`), Windows PE resource generator, RU pack builder, and upstream compatibility tools |
| `test/` | Automated Node.js and Go test suites |
| `releases/1.30.0/` | Prebuilt v1.30.0 release (`EXE`, `ZIP`, and SHA-256 checksums) |
| `docs/releases/1.30.0.md` | Release notes for v1.30.0 (RU/EN) |

---

## Building from Source & Testing

Requires a POSIX shell (Git Bash on Windows, or Linux/WSL), **Go 1.24+**, and **Python 3**. No third-party Python or npm packages are needed. **Node.js** is used for running JS tests and compatibility checks.

```sh
# Build standalone Windows x64 EXE, ZIP package, and SHA-256 checksums
sh tools/build.sh

# Run Go installer unit tests
(cd src/gui && go test ./...)

# Run Node.js test suite
node --test test/*.test.cjs

# Rebuild Russian localization pack (after editing data/ru-src or data/ru-fixes)
python3 -I tools/build-ru-pack.py
```

Verify hook compatibility against a specific upstream game release:

```sh
node tools/fetch-build.mjs <game_version> /tmp/dfo-game
node tools/check-build.cjs /tmp/dfo-game
```

---

## Credits & Licenses

- Extension author: **AutomaticYobaMachine** (support the author: [Boosty](https://boosty.to/auto_yoba)).
- Derived Russian localization pack **DG_RU** by **Mirazent** is distributed under **CC BY-SA 4.0** ([`data/ru-pack/LICENSE`](data/ru-pack/LICENSE)).
- English table sources & attributions: [`data/ru-src/en/README.md`](data/ru-src/en/README.md).
- Community font licenses & notices: [`src/mod/fonts/FONT-NOTICES.txt`](src/mod/fonts/FONT-NOTICES.txt).
