# PureScript Nix Flake

A comprehensive Nix flake for PureScript development with reproducible tooling.

## Features

- **PureScript Compiler** (v0.15.15)
- **Spago** - Package manager and build tool
- **Language Server** - For IDE integration
- **Code Formatter** (purs-tidy)
- **File Watcher** (pscid)
- **Node.js** runtime
- **Custom helper scripts**

## Quick Start

### 1. Enable Flakes (if not already enabled)

Add to your `~/.config/nix/nix.conf`:
```
experimental-features = nix-command flakes
```

### 2. Enter Development Shell

```bash
# Enter the default development environment
nix develop

# Or use directly without cloning
nix develop github:yourusername/yourrepo

# Minimal environment (just compiler + spago)
nix develop .#minimal
```

### 3. Initialize a New Project

```bash
# In the nix shell
spago init

# Or using the helper script
purs-init
```

### 4. Project Structure

```
my-purescript-app/
├── flake.nix          # This file
├── flake.lock         # Lock file (auto-generated)
├── spago.dhall        # Spago configuration
├── packages.dhall     # Package set configuration
├── src/
│   └── Main.purs      # Main module
└── test/
    └── Main.purs      # Test module
```

## Available Commands

### Spago Commands
- `spago init` - Create new project
- `spago build` - Build project
- `spago test` - Run tests
- `spago repl` - Interactive REPL
- `spago bundle-app` - Bundle for production
- `spago docs` - Generate documentation

### Custom Scripts
- `purs-init` - Initialize project with defaults
- `purs-watch` - Auto-rebuild on file changes
- `purs-repl` - Quick REPL launcher
- `purs-format` - Format all .purs files
- `purs-clean` - Remove build artifacts

## Example spago.dhall Configuration

```dhall
{ name = "my-app"
, dependencies = 
  [ "console"
  , "effect"
  , "prelude"
  , "psci-support"
  , "aff"
  , "either"
  , "lists"
  , "maybe"
  , "strings"
  , "tuples"
  ]
, packages = ./packages.dhall
, sources = [ "src/**/*.purs", "test/**/*.purs" ]
}
```

## Example Main.purs

```purescript
module Main where

import Prelude

import Effect (Effect)
import Effect.Console (log)

main :: Effect Unit
main = do
  log "🎯 Hello from PureScript!"
```

## IDE Setup

### VS Code
1. Install "PureScript IDE" extension
2. The language server will be available in the nix shell

### Vim/Neovim
1. Install `purescript-vim` or similar plugin
2. Configure LSP to use `purescript-language-server` from the shell

## Building for Production

```bash
# Bundle the application
spago bundle-app --main Main --to dist/app.js

# Run the bundled app
node dist/app.js
```

## Adding Dependencies

```bash
# Add a package
spago install arrays

# Install all dependencies
spago install
```

## Running Without Cloning

You can use this flake directly:

```bash
# Enter shell
nix develop github:yourusername/yourrepo

# Run the REPL app
nix run github:yourusername/yourrepo#repl

# Initialize a new project
nix run github:yourusername/yourrepo#init
```

## Customizing

### Changing PureScript Version

Edit the flake.nix and modify:
```nix
purs = easy-ps.purs-0_15_15;  # Change version here
```

Available versions can be found at: https://github.com/justinwoo/easy-purescript-nix

### Adding More Tools

Add to `additionalTools` in flake.nix:
```nix
additionalTools = with pkgs; [
  nodejs_20
  # Add more tools here
  postgresql  # If you need a database
  redis       # Cache server
];
```

## Troubleshooting

### Spago can't find packages
Run `spago install` to fetch dependencies

### Build artifacts taking up space
Run `purs-clean` to remove output directories

### Different Node version needed
Modify `nodejs_20` to your required version in flake.nix

## Resources

- [PureScript Documentation](https://www.purescript.org/)
- [Spago Documentation](https://github.com/purescript/spago)
- [PureScript by Example](https://book.purescript.org/)
- [Pursuit (Package Registry)](https://pursuit.purescript.org/)

## License

Feel free to use this flake configuration in your projects!
