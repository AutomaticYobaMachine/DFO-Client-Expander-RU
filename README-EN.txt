DFO-Client-Expander-RU 1.30.0
=============================
Author: AutomaticYobaMachine
Made for the Daggerfall Online (DFO Online) community — fully bilingual (EN / RU).
Русская инструкция: README.txt.

An unofficial extension of the Daggerfall Online client.
This is not the game itself; the original project is:
https://github.com/Lattymoy/daggerfall-js-source

Extension repository:
https://github.com/AutomaticYobaMachine/DFO-Client-Expander-RU

LANGUAGES
---------
Everything the extension adds works in both English and Russian:
- With Russian translation unchecked — the game and all mod windows, cards,
  descriptions, and hints speak English.
- With Russian translation enabled — both the game and all mod interfaces speak Russian.
The installer opens in your Windows language; the English / Русский switch changes
it immediately and is remembered. On non-Russian Windows, "Russian translation"
starts unchecked by default.

HOW TO INSTALL
--------------
1. Close DFO Online completely.
2. Run DFO-Client-Expander-RU.exe. Every script, font, sound effect, localization
   pack, and guide is embedded inside the EXE — no Node.js, Go, or Python needed.
3. The installer detects your game automatically. If it does not, click
   "Choose game…" and point to DFO Online.exe in the game folder.
4. Tick the modules you want, optionally bind hotkeys, and customize fonts via
   the "Fonts" button.
5. Click "Install selected" (for an existing install, the same button updates
   the extension or applies new choices) and wait for completion.
6. Launch DFO Online as usual. A clean backup (app.asar.dfo-mod-original.bak) is
   created automatically. The game's own per-file update chunks are never modified,
   so official updates continue working normally.

MODULES & FEATURES
------------------
1. Enhanced Interfaces (core module, always active)
   - Unified dark-slate Enhanced Plus (Slate) interface style for clean layout
     stability across all overhauled screens.
   - Inventory & Equipment Panel:
     * Equipment layout switcher: "Action-RPG Style" (animated sculpted Set Relics
       for all 15 DFO equipment sets plus flip-card stats & gear summary) or
       "Vanilla Inventory".
     * "List" / "Icons" switcher: 2-column card-styled rows when opened alone,
       1 column beside a chest, wagon, bag, or body, or square icons without
       resizing the window.
     * 9 pages: Magic tab removed (enchanted items live in their base category);
       Ingredients hold only actual recipe ingredients; notes & quest letters live
       in Books (quest letters auto-lock on receipt); customizable "Junk…" page.
     * Full-card omnibox search ("Find…") across all inventory tabs.
     * Permanent auto-sort with 5 profiles (Rarity, Item Type, Material,
       Alphabetical, Stack Count) and auto-stacking in Misc, Ingredients & Junk.
     * Footer with Gold (+ letters of credit), Velkynd Shards, Deadlands Embers,
       Silver Marks & Aurum tooltips; carry weight; Local vs. Server Time guide;
       character health/diseases/survival needs; reputation & PvP villainy breakdown.
   - Zero-Scroll Item Cards & Quick-Loot:
     * Two-column item card across inventory, containers, trade, and chat links:
       Equipment Slot, Trained Weapon Skill, Material colored by metal tier
       (separate from Armor Type), structured effect lists, sigils, sets, equipped
       comparison, literary descriptions & gameplay hints, approximate sale worth
       (~40% basis) & price/kg.
     * Compact live stat card beside the crosshair quick-loot list.
   - Containers, Reward Picker & Fate Dialog:
     * Overhauled chests, storage, wagon, materials bag, and ground piles:
       full-card search, category/rarity/material filters, 5 sort modes, fast stack
       transfers (LMB = 1, Shift+LMB = full stack, Ctrl+Shift+LMB = custom qty,
       RMB = context menu).
     * Redesigned Reward Picker ("Choose 1 of N") and Fate Dialog (1 = Execute for
       trophy with card hover, 2 = Spare for mercy).
   - Spellbook v2:
     * Live animated spell visualization canvas, magicka & per-round regen source
       breakdown, 6 school filter chips with full effective skill modifier tooltips,
       6 sort modes including Custom Drag-and-Drop order (persisted in cache),
       inline rename, 69+ icon & text-sigil switcher, hover 1–0 hotbar binding,
       quickslot [Q], and protected vampire/lycanthrope powers.
   - Spellmaker Overhaul:
     * Live 3D/canvas spell visualization by school & element, dual-pane 94-effect
       catalog with engine quirk warnings & exact formula spoilers, 3-panel gold
       slider editor, 69-icon school selector, bilingual EN/RU spell name generator,
       and interactive Spell Mechanics Guide.
   - Service Windows (Bank, Trade, Enchanting, Spellshop & Broker):
     * Bank with animated live treasury vaults (gold safe, letters of credit ledger,
       silver mark stacks), quick amounts (10k–1M), one-click Cash in Letters,
       Sell Silver with rate & daily cap, and property/fleet/loan counters.
     * Trade with card rows, trade deal sound cue, quick stack staging (2×LMB /
       Shift+2×LMB / Ctrl+Shift+2×LMB), and Sell Junk synced with your Junk rules.
     * Enchanting, Spellshop, Sigil Broker & Orders Board with detailed client
       formula & mechanics breakdowns.
   - Modular Font System (8 categories):
     * Completely replaces all vanilla fonts across UI, Canvas, Workers, book
       readers (+35% book legibility), and launcher using local community fonts
       with zero external network requests.
     * Open "Fonts" in the installer to replace any category (or all 8) with your
       own .ttf/.otf/.woff2/.woff files or import/export JSON presets. Stored in
       %APPDATA%\DFO Online\dfo-mod-fonts\ and active on next launch.
   - Quality-of-Life & Fixes:
     * Instant skill readiness HUD indicator, 6-hour (360-minute) advancement fix,
       and clear custom chime on skill readiness & level-up.
     * Cross-locale [Item] chat links, bilingual `[` autocomplete, hover/click
       item card inspection, and clickable/copyable URLs.
     * Manual waypoint cap raised from 64 to 512 per category.

2. Russian Translation (toggleable)
   - Full Russian translation of the UI, launcher, chargen, tutorials, items,
     skills, dialogues, quests, and books.

3. Marks & Town Map (toggleable)
   - Overworld venue marks (taverns, shops, organizations; 1200 m range, labels
     within 300 m, up to 60 marks) with live general & personal shop buy-back
     rates. "Only visited" hides unvisited buildings.
   - Detailed interactive town map with Guild Influence, Doors & Owners, Venue
     Marks layers, and a 7-tab Town Info window.

4. Loot Nearby (toggleable, default key J)
   - Unified loot window within 10 m (automatically narrows to 3 m when another
     player is within 50 m across all 3 axes): bodies, floor piles, slopes,
     stuck arrows, searched chests (while cooling), and Sky-Ketch / Rift spoils.
   - Enforces line-of-sight and floor checks (2.25 m indoors). Items are taken
     directly from original sources via native weight-checked transfers.
   - Includes tag Loot Filter (Whitelist/Blacklist + JSON presets), optional
     Autoloot (off by default), and Take All. Bind keyboard, NumPad, or mouse
     button 3/4/5 in the installer.

5. Dungeon Intel (toggleable, default key K)
   - Rated 3-line Overworld labels and 5-tab forecast cards (Threat, Loot,
     Growth, Renown). Undiscovered "?" sites stay hidden.
   - Inside dungeons: live top-right enemy, elite, and player counters plus the
     4-tab K summary window (Summary with regen, aurum & quest jump, Enemies,
     Loot, Preparation).

6. Dungeon Navigation (toggleable)
   - Spell-driven 3D pathfinder bound strictly to "Shared Cartography" (Mysticism).
   - Self-casting inside a dungeon opens target choice ("To Exit" or "To Quest
     Target") and renders a real 3D collider route as glowing pink clouds with
     sparks and soft lights. Doors remain manual; active only while the spell lasts.

UPDATES, REMOVAL & LOGS
-----------------------
- On startup the installer checks GitHub Releases without downloading anything
  until you approve. After self-updating, applying to the game is still manual.
- "Remove extension" restores the clean original app.asar while keeping your
  settings and caches in %APPDATA%\DFO Online\.
- Diagnostic logs in %APPDATA%\DFO Online\:
  * dfo-mod-installer.log — full installer log
  * dfo-mod.log — game session hook log
  * dfo-mod-marks.txt — venue marks and buy-back report

Platform: Windows 10/11, 64-bit.
Localization licenses (DG_RU under CC BY-SA 4.0 by Mirazent) and community font
notices are included in licenses/ of the ZIP package and in the repository.
