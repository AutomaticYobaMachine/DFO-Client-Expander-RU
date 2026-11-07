DFO-Client-Expander-RU 1.25.1
=============================
Author: AutomaticYobaMachine
Made especially for the Russian-speaking DFO Online community.
Русская инструкция: README.txt.

An unofficial extension of the Daggerfall Online client: item cards, nearby
loot with a loot filter, dungeon cards with a live summary and a route line,
venue marks and a detailed town map, community fonts and an optional Russian
translation. It is not the game itself; the original is
https://github.com/Lattymoy/daggerfall-js-source

LANGUAGES
Everything the extension adds speaks English or Russian. Without the Russian
translation its own windows and labels are English; with the translation on,
they are Russian. The installer opens in the language of your Windows; the
English/Русский switch in its top right corner changes it at once and is
remembered. On a non-Russian Windows the "Russian translation" box starts
unchecked.

HOW TO INSTALL
1. Close DFO Online completely.
2. Start DFO-Client-Expander-RU.exe. Everything is inside the EXE; you need
   no Node.js, Go or separate mod/data/patcher folders.
3. The installer finds the game by itself. If it does not, press
   "Choose game…" and point to DFO Online.exe in the game folder.
4. Tick the features you want and press "Install selected". For an installed
   extension the same button updates it or applies your choice.
5. Wait for "Done" and start the game as usual. A backup of the client is made
   automatically; nothing in the game changes until you press the button.

FEATURES
- Item cards: one two-column card in the enhanced inventory, containers and
  trade: material apart from the armor type, properties and effects as lists,
  the game's own sigil, set and comparison blocks, the item's description and
  its worth at the bottom. It always fits on the screen.
- Russian translation: the interface, items, quests and books in Russian.
- Marks and town map: venues on the Overworld and a detailed town map.
  "Only visited" hides the buildings you have not been to yet.
- Loot nearby: drops and items on the floor within 15 m in one window, with
  filters, presets, sorting, autoloot and "Take all". J by default; assign
  your own key (a keyboard key or mouse button 3/4/5) in the installer.
- Dungeon intel: dungeon cards on the Overworld; inside a dungeon, live
  counters top right and a summary on K with quests, aurum, respawn and a
  route line to the exit, the aurum, an elite or a quest target.
- Community fonts: our fonts across the game's interface; sizes and colors
  stay as the game has them.

UPDATES
At start the installer only checks whether a newer release exists. Nothing is
downloaded or replaced before you answer "Yes"; after the program updates
itself, press the install button to apply it to the game.

REMOVAL AND LOGS
"Remove extension" restores the original client; your settings and caches
stay. The "Log" tab shows the installation's progress and errors; "Full log"
opens %APPDATA%\DFO Online\dfo-mod-installer.log. The game's own log and the
marks report appear there after the first start of the game with the
extension.

Built for Windows 10/11, 64-bit. Sources of the extension:
https://github.com/AutomaticYobaMachine/DFO-Client-Expander-RU
The game updates often; a new game release may need a new version of the
extension.

The translation's authorship and licenses are kept: the derived DG_RU pack by
Mirazent is distributed under CC BY-SA 4.0; the fonts' notices are in
licenses/ of the ZIP.
