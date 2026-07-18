module Main where

import Prelude

import Effect (Effect)
import Effect.Console (log)
import Data.Array (drop)
import Data.Either (Either(..))
import Data.Show (show)
import Data.String (joinWith)
-- import Node.Process (argv)
import Debug
import Lexer (tokenize)
import Parser (parse)
import Evaluator (evaluate)
import Simple.JSON as JSON

-- foreign import main :: String -> String
-- main :: String -> String
-- main s = run s
main s = "foo"

go :: String -> String
go s = case tokenize s of
    Left err      -> JSON.writeJSON $ "Tokenization error: " <> err
    Right tokens  -> case parse tokens of
      Left err      -> JSON.writeJSON $ "Parsing error: " <> err
      Right ast     -> JSON.writeJSON (evaluate ast)
      -- Right ast     -> show (evaluate ast)


-- main' :: Effect String
-- main' = do
--   args <- argv
--   let s = joinWith " " (drop 2 args)
--   pure $ run s

-- main :: Effect Unit
-- main = do
--   log "🍝"
--   let input = "a -> b -> c -> d"
--   -- log $ show $ parse <$> tokenize input
--   pure $ run input
  