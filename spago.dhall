{-
Welcome to a Spago project!
You can edit this file as you like.

Need help? See the following resources:
- Spago documentation: https://github.com/purescript/spago
- Dhall language tour: https://docs.dhall-lang.org/tutorials/Language-Tour.html

When creating a new Spago project, you can use
`spago init --no-comments` or `spago init -C`
to generate this file without the comments in this block.
-}
{ name = "my-project"
, dependencies = 
  [ "arrays"
  -- , "chars"
  , "console"
  , "control"
  , "debug"
  , "effect"
  , "either"
  -- , "exceptions"
  -- , "foldable-traversable"
  -- , "identity"
  -- , "json"
  , "simple-json"
  , "lists"
  -- , "maps"
  , "maybe"
  -- , "newtype"
  -- , "node-process"
  -- , "node-readline"
  , "ordered-collections"
  , "parsing"
  , "prelude"
  -- , "sets"
  , "strings"
  , "transformers"
  , "tuples"
  -- , "undefined"
  -- , "unicode"
  ]
, packages = ./packages.dhall
, sources = [ "src/**/*.purs", "test/**/*.purs" ]
}
