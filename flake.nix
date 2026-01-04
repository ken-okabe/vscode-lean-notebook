{
  description = "Unified Lean4 Project";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-25.11";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = import nixpkgs { inherit system; config.allowUnfree = true; };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            # Base
            gcc
            glibc

            # Tools
            nodejs_24
            # F# / Implementation Policy Requirement
            dotnetCorePackages.sdk_10_0-bin
            esbuild    # for bundling JS

            # Lean4
            lean4
            elan  # Lean version manager
          ];

          shellHook = ''
             echo "🚀 Lean4 Unified Environment"
             echo "   - Core Physics Project (F# & Lean)"
             echo "   - Wasm Interactive Notebook"
             echo ""
             echo "Commands:"
             echo "   lake build               : Build Lean Project"
             echo "   dotnet run               : Run F# Project"
             echo "   npx serve wasm-notebook/www : Start Notebook Server"
             exec zsh
          '';
        };
      }
    );
}
