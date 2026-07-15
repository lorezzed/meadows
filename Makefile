.PHONY: shell code setup lock hash dev build run run-with

# ---------------------------------------------------------------------------
# One-time setup (run once, or whenever parcel/d3 deps change in package.json)
# ---------------------------------------------------------------------------

# Full one-time setup: generates the lockfile then prints the npmDepsHash.
# Copy the printed hash into flake.nix, replacing REPLACE_ME.
setup: lock hash

# Generate/refresh package-lock.json (needs network)
# NOTE: uses a plain nixpkgs nodejs shell, NOT `nix develop`, because the
# project devShell evaluates nodeDeps (which needs npmDepsHash to already
# be a real hash) — chicken-and-egg otherwise.
lock:
	nix --experimental-features 'nix-command flakes' shell nixpkgs#nodejs_22 --command npm install --package-lock-only

# Print the npmDepsHash to paste into flake.nix (replaces REPLACE_ME)
hash:
	nix --experimental-features 'nix-command flakes' -L run nixpkgs#prefetch-npm-deps -- package-lock.json

# ---------------------------------------------------------------------------
# Everyday use
# ---------------------------------------------------------------------------

shell:
	nix --experimental-features 'nix-command flakes' develop

code:
	nix --experimental-features 'nix-command flakes' develop --command $$SHELL -c 'code .'

# Run the parcel dev server against ui/index.html
dev:
	nix --experimental-features 'nix-command flakes' develop --command esbuild ui/index.js --bundle --watch --outdir=./ui --servedir=./ui
# 	nix --experimental-features 'nix-command flakes' develop --command esbuild ui/index.ts --bundle --watch --outdir=./ui --servedir=./ui
# Compile and run the PureScript entrypoint (src/Main.purs) via spago
run:
	nix --experimental-features 'nix-command flakes' develop --command spago run

# # 	make run-with "ab -> bd"
run-with:
	nix --experimental-features 'nix-command flakes' develop --command spago run --exec-args "\"$(strip $(filter-out $@,$(MAKECMDGOALS)))\""
# # 	make run-with ARGS="abc"
# 	nix --experimental-features 'nix-command flakes' develop --command spago run -- "$(ARGS)"


# Catch-all: swallow the extra word (e.g. "abc") so make doesn't try
# to build it as a target of its own.
%:
	@:

# nix-shell -p nix-info --run "nix-info -m"
