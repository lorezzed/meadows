-- | Command-line runner: compile a DSL string and print the graph JSON.
-- |
-- |   make run-with "a->b"
-- |   (= spago run --main CLI --exec-args "\"a->b\"")
-- |
-- | Lives outside `Main` so the browser bundle -- which imports `Main` for
-- | `go` -- never pulls in node-process.
module CLI where

import Prelude

import Data.Array (drop)
import Data.String (joinWith)
import Effect (Effect)
import Effect.Console (error, log)
import Main (go)
import Node.Process (argv)

main :: Effect Unit
main = do
  args <- drop 2 <$> argv
  let input = joinWith " " args
  -- Blank input means the invocation lost its argument (e.g. a goal-style
  -- `make run-with "a=>j"`, where make eats the `=` as a variable override),
  -- so usage beats silently printing an empty graph.
  if input == ""
    then error usage
    else log (go input)
  where
  usage = "usage: make run-with \"a->b\"  |  make run-with in=\"a=>j\"\n(compiles the DSL string, prints graph JSON; use in= when the input contains '=')"
