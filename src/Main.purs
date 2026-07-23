module Main (go, module Formatter) where

import Prelude

import Data.Either (Either(..))
import Formatter (format)
import Lexer (tokenize)
import Parser (parse)
import Evaluator (evaluate)
import Simple.JSON as JSON

-- | The compiler pipeline and the UI seam: DSL source in, graph JSON out --
-- | or, on failure, a JSON-encoded error string. ui/app.ts calls this from
-- | the compiled output/Main/index.js; the CLI wraps it for the terminal.
-- | The module also re-exports Formatter's `format` (plain string in/out,
-- | not JSON) for the UI's format button.
go :: String -> String
go s = case tokenize s of
    Left err      -> JSON.writeJSON $ "Tokenization error: " <> err
    Right tokens  -> case parse tokens of
      Left err      -> JSON.writeJSON $ "Parsing error: " <> err
      Right ast     -> case evaluate ast of
        Left err    -> JSON.writeJSON $ "Model error: " <> err
        Right graph -> JSON.writeJSON graph
