{
  description = "PureScript dev environment";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = [
            pkgs.purescript
            pkgs.spago
            pkgs.nodejs_22
            pkgs.esbuild   # or purs-backend-es / parcel if you prefer bundling that way
            # pkgs.parcel
            pkgs.git
          ];

          shellHook = ''
            echo "PureScript $(purs --version), Spago $(spago version)"
            [ -f package.json ] && npm install
          '';
        };
      });
}