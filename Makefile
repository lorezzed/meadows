.PHONY: init done shell code setup lock hash dev build run run-with test

# ---------------------------------------------------------------------------
# One-time setup (run once, or whenever esbuild/d3 deps change in package.json)
# ---------------------------------------------------------------------------

init:
	nix --experimental-features flake init

done:
	nix-shell -p nix-info --run "nix-info -m"

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

# Compile src/ -> output/ so the UI picks up backend changes.
# ui/app.ts imports the compiled backend from output/Main, which is produced
# by `spago build`. Run this after editing any src/*.purs before `make dev`.
build:
	nix --experimental-features 'nix-command flakes' develop --command spago build

# Compiler tests: the PureScript unit suite (test/Main.purs — token streams &
# positions, exact Tree shapes, evaluator identity/links/groups) plus the golden
# battery (byte-exact graph JSON + positioned error messages) plus the headless
# simulator checks (ui/simulate.ts run directly via node's type stripping).
# After an INTENDED output change: node test/golden.mjs --capture
test: build
	nix --experimental-features 'nix-command flakes' develop --command spago test
	node test/golden.mjs
	node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON test/simulate.mjs

# Run the esbuild dev server against ui/index.html
dev:
	nix --experimental-features 'nix-command flakes' develop --command esbuild ui/index.js --bundle --watch --outdir=./ui --servedir=./ui --loader:.svg=dataurl
# 	nix --experimental-features 'nix-command flakes' develop --command esbuild ui/index.ts --bundle --watch --outdir=./ui --servedir=./ui
# Compile and run the CLI entrypoint (src/CLI.purs); with no input it prints usage
run:
	nix --experimental-features 'nix-command flakes' develop --command spago run --main CLI

# Compile a DSL string and print the graph JSON:
# 	make run-with "a->b"
# 	make run-with in="[a]=>fill[b]"
# The in= form is REQUIRED when the input contains '=' (faucets): make parses
# a bare goal like "a=>j" as a variable override and the input arrives empty.
run-with:
	nix --experimental-features 'nix-command flakes' develop --command spago run --main CLI --exec-args "\"$(strip $(if $(in),$(in),$(filter-out $@,$(MAKECMDGOALS))))\""


# Catch-all: swallow the extra word (e.g. "abc") so make doesn't try
# to build it as a target of its own.
%:
	@:

# nix-shell -p nix-info --run "nix-info -m"
