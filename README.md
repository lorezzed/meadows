# PureScript Nix Flake

Simple Nix flake for PureScript development using easy-purescript-nix.

## Usage

```bash
# Enter development shell
nix develop

# Initialize a new PureScript project
spago init

# Build project
spago build

# Run REPL
spago repl

# Run tests
spago test
```

## What's Included

- `purs` - PureScript compiler
- `spago` - Package manager and build tool
- `purescript-language-server` - IDE support
- `purs-tidy` - Code formatter
- `nodejs` - JavaScript runtime

## Example Project Setup

```bash
# Create project directory
mkdir my-purescript-app
cd my-purescript-app

# Copy the flake.nix
# Enter shell and initialize
nix develop
spago init

# Install dependencies (example)
spago install aff console effect

# Build and run
spago build
spago run
```

That's it! For more PureScript tools, check out [easy-purescript-nix](https://github.com/justinwoo/easy-purescript-nix).
