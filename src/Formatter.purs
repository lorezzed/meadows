-- | The canonical pretty-printer behind the UI's "format" button: re-lex the
-- | source with the real lexer and reprint the token stream in one standard
-- | spacing, so the formatter can never disagree with the syntax it formats.
-- | Token-preserving by construction — the reprinted text lexes back to the
-- | same stream (test/format.mjs pins graph-JSON equality across it) — and
-- | total: input that does not lex comes back untouched, so the button
-- | simply no-ops on broken models.
-- |
-- | The standard (figure 4 as the reference):
-- |
-- |   | =>tree growth [wood in living trees] =>logging [lumber inventory] =>lumber sales |
-- |   [wood in living trees] =>tree deaths |
-- |
-- | One statement per line (blank lines collapse — a separator token is
-- | already a collapsed run). Within a line, tokens are space-separated
-- | except where a lexeme glues to its neighbor:
-- |   - brackets hug their stock:      [wood in living trees]
-- |   - a colon hugs the name before:  inflow: 0
-- |   - faucet ops take their name:    =>logging   (a bare `=` reprints =>)
-- |   - schedule markers take their time:  @5: 5
-- |   - loop-opens and parens hug inward:  B(cooling <- hot coffee)
-- |   - inside a formula group, juxtaposed multiplication stays tight:
-- |     2x, 2(a + b), x(a + b)  (statement-level `5 [stock]` keeps its
-- |     space), which also glues time shifts and function calls:
-- |     orders(t - delivery delay), cos(2 * pi * t / 10)
-- |   - a comma hugs its left and breathes right: min(0.09, 0.21 - 0.06t)
-- |   - `^` is tight on both sides: 2x^2
-- | Arrows, formula operators, and a shift's `-` breathe on both sides:
-- | a -> b, capital / 3, orders(t - delivery delay).
-- | Numbers reprint from their value — integral without the trailing `.0`.
module Formatter (format) where

import Prelude

import Data.Either (Either(..))
import Data.Foldable (foldl)
import Data.Int as Int
import Data.List (List(..), dropWhile, reverse, (:))
import Data.Maybe (Maybe(..))
import Lexer (Operator(..), Token(..), loopLetter, opSymbol, tokenize)

-- | What kind of paren region the printer is inside: a loop annotation's
-- | body holds statement-level syntax (arrows keep their spaces), a formula
-- | group holds arithmetic (juxtaposition tightens).
data Ctx = LoopCtx | GroupCtx

type St = { out :: String, prev :: Maybe Token, stack :: List Ctx }

format :: String -> String
format input = case tokenize input of
  Left _ -> input
  Right toks -> print (trimSeps (map _.tok toks))
  where
  -- Leading/trailing statement separators would print stray blank lines.
  trimSeps = dropWhile isSep >>> reverse >>> dropWhile isSep >>> reverse
  isSep = case _ of
    TokSep -> true
    _ -> false

print :: List Token -> String
print toks = (foldl step { out: "", prev: Nothing, stack: Nil } toks).out
  where
  -- A separator both breaks the line and resets the pair/paren state (on
  -- valid input parens never span statements; on invalid input this keeps
  -- the printer sane).
  step st TokSep = { out: st.out <> "\n", prev: Nothing, stack: Nil }
  step st tok =
    { out: st.out <> sep st.prev tok st.stack <> lexeme tok
    , prev: Just tok
    , stack: push tok st.stack
    }

  push :: Token -> List Ctx -> List Ctx
  push tok stack = case tok of
    TokLoop _ -> LoopCtx : stack
    TokLParen -> GroupCtx : stack
    TokRParen -> case stack of
      _ : rest -> rest
      Nil -> Nil
    _ -> stack

  inGroup :: List Ctx -> Boolean
  inGroup = case _ of
    GroupCtx : _ -> true
    _ -> false

  -- The space (or not) between two adjacent tokens. `stack` is the paren
  -- context BEFORE the current token opens anything, so an opening `(` is
  -- judged by where it appears, not by the group it starts.
  sep :: Maybe Token -> Token -> List Ctx -> String
  sep Nothing _ _ = ""
  sep (Just prev) cur stack = if tight then "" else " "
    where
    tight = case prev, cur of
      TokLBracket, _ -> true
      TokLoop _, _ -> true
      TokLParen, _ -> true
      TokAt, _ -> true
      TokCaret, _ -> true
      _, TokCaret -> true
      TokOp FaucetR, TokIdent _ -> true
      TokOp FaucetL, TokIdent _ -> true
      _, TokRBracket -> true
      _, TokRParen -> true
      _, TokColon -> true
      _, TokComma -> true
      -- Juxtaposed multiplication, formula groups only. (A name followed by
      -- a NUMBER can never tighten: `x2` would re-lex as one identifier.)
      -- A name's '(' tightens too: time shifts x(t - 1) and x(a + b)
      -- juxtaposition alike.
      TokNumber _, TokIdent _ -> inGroup stack
      TokNumber _, TokLParen -> inGroup stack
      TokIdent _, TokLParen -> inGroup stack
      _, _ -> false

  lexeme :: Token -> String
  lexeme = case _ of
    TokIdent s -> s
    TokOp op -> opSymbol op
    TokCloud -> "|"
    TokLoop k -> loopLetter k <> "("
    TokLParen -> "("
    TokRParen -> ")"
    TokLBracket -> "["
    TokRBracket -> "]"
    TokColon -> ":"
    TokAt -> "@"
    TokComma -> ","
    TokCaret -> "^"
    TokPlus -> "+"
    TokMinus -> "-"
    TokStar -> "*"
    TokSlash -> "/"
    TokNumber n -> showNumber n
    TokSep -> "\n" -- unreachable (step handles it); kept for totality

-- | Reprint a number the way the DSL writes them: integral values without
-- | PureScript's `.0` suffix (`[tub: 50]`, never `[tub: 50.0]`).
showNumber :: Number -> String
showNumber n = case Int.fromNumber n of
  Just i -> show i
  Nothing -> show n
