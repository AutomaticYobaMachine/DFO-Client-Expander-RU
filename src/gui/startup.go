package main

type startupOptions struct {
	game, resume, lang   string
	noUpdate, legacyAuto bool
}

func parseStartup(args []string) startupOptions {
	var out startupOptions
	for i := 0; i < len(args); i++ {
		switch args[i] {
		case "--game", "--dfo-resume-update":
			if i+1 < len(args) {
				if args[i] == "--game" {
					out.game = args[i+1]
				} else {
					out.resume = args[i+1]
				}
				i++
			}
		case "--lang":
			if i+1 < len(args) {
				out.lang = args[i+1]
				i++
			}
		case "--no-self-update":
			out.noUpdate = true
		case "--auto-install", "--auto-uninstall":
			// Old shortcuts must open the UI without modifying the game.
			out.legacyAuto = true
		}
	}
	return out
}
