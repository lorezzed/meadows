.PHONY: init done shell code setup lock hash dev dist build run run-with test

# ---------------------------------------------------------------------------
# One-time setup (run once, or whenever esbuild/d3 deps change in package.json)
# ---------------------------------------------------------------------------

# Install Nix — the one prerequisite the flake cannot pin, since every other
# target here runs inside `nix develop`. The official installer from
# https://nixos.org/download/ (multi-user; it leaves flakes off, which is why
# every target below passes --experimental-features explicitly).
init:
	curl --proto '=https' --tlsv1.2 -L https://nixos.org/nix/install | sh -s -- --daemon

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

# Build the self-contained static site into ./dist (for GitHub Pages). esbuild
# bundles ui/index.js — inlining app.ts, d3, the compiled backend, and the
# shape SVGs as data URLs — into ./dist, a throwaway dir. It must NOT write to
# ./ui: a one-shot bundle there would clobber the checked-in one-line
# ui/index.js entrypoint (see the `make dev` note). The HTML shell is copied
# alongside; it loads ./index.js relatively, so the site works from any base
# path (e.g. the project-pages /meadows/ subpath). Depends on `build` so
# output/Main is fresh.
dist: build
	rm -rf dist
	mkdir -p dist
	nix --experimental-features 'nix-command flakes' develop --command esbuild ui/index.js --bundle --minify --outfile=dist/index.js --loader:.svg=dataurl
	cp ui/index.html dist/index.html

# Compiler tests: the PureScript unit suite (test/Main.purs — token streams &
# positions, exact Tree shapes, evaluator identity/links/groups) plus the golden
# battery (byte-exact graph JSON + positioned error messages) plus the headless
# frontend checks (ui/simulate.ts and ui/highlight.ts run directly via node's
# type stripping) plus the formatter contract (test/format.mjs: reference
# style, graph preservation, idempotence) plus the layout contract
# (test/layout.mjs: band flatness, stock slots, cloud edges, and post-settle
# clearance, driving ui/layout.ts's real computeLayout + force simulation)
# plus the playback contract (test/playback.mjs: the animate toggle's trace,
# shared scales, loop activity, pulse routes, and water-line breaks in
# ui/playback.ts).
# After an INTENDED output change: node test/golden.mjs --capture
test: build
	nix --experimental-features 'nix-command flakes' develop --command spago test
	node test/golden.mjs
	node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON test/simulate.mjs
	node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON test/highlight.mjs
	node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON test/format.mjs
	node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON test/layout.mjs
	node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON test/playback.mjs

# Run the esbuild dev server against ui/index.html. Uses `--watch=forever` (not
# plain `--watch`) so the watcher survives a closed stdin — backgrounded or
# otherwise non-interactive runs don't stop on the first rebuild; an interactive
# run still exits when its terminal/parent process is killed.
dev:
	nix --experimental-features 'nix-command flakes' develop --command esbuild ui/index.js --bundle --watch=forever --outdir=./ui --servedir=./ui --loader:.svg=dataurl
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
