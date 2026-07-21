module Lexer
  ( LoopKind(..)
  , Operator(..)
  , PosToken
  , Token(..)
  , describeToken
  , formatParseError
  , loopLetter
  , opSymbol
  , tokenize
  )
  where

import Prelude

import Control.Alt ((<|>))
import Data.Array as Array
import Data.Either (Either(..))
import Data.List (List, (:))
import Data.Maybe (Maybe(..))
import Data.Number as Number
import Data.String.CodeUnits as SCU
import Data.String (joinWith)
import Parsing (Parser, ParseError, Position(..), fail, parseErrorMessage, parseErrorPosition, position, runParser)
import Parsing.Combinators (many, option, try, (<?>))
import Parsing.String (char, string, eof)
import Parsing.String.Basic (oneOf, letter, alphaNum)

import Data.Show.Generic (genericShow)
import Data.Generic.Rep (class Generic)

data Operator
  = ArrowR   -- ->
  | ArrowL   -- <-
  | FaucetR   -- =>
  | FaucetL   -- <=

derive instance eqOperator :: Eq Operator
derive instance genericOperator :: Generic Operator _
instance showOperator :: Show Operator where
  show = genericShow

-- | The two feedback-loop annotation kinds: `R(...)` marks a reinforcing
-- | loop, `B(...)` a balancing one.
data LoopKind = Reinforcing | Balancing

derive instance eqLoopKind :: Eq LoopKind
derive instance genericLoopKind :: Generic LoopKind _
instance showLoopKind :: Show LoopKind where
  show = genericShow

loopLetter :: LoopKind -> String
loopLetter Reinforcing = "R"
loopLetter Balancing = "B"

data Token
  = TokIdent String
  | TokOp Operator
  | TokCloud
  | TokLoop LoopKind
  | TokLParen
  | TokRParen
  | TokLBracket
  | TokRBracket
  | TokColon
  | TokNumber Number
  | TokSep

derive instance eqToken :: Eq Token
derive instance genericToken :: Generic Token _
instance showToken :: Show Token where
  show = genericShow

-- | A token together with the source position where it starts.
type PosToken = { pos :: Position, tok :: Token }

-- | Render a ParseError as "line L, column C: msg". Shared by the lexer and
-- | parser seams so both kinds of failure read the same in the UI.
formatParseError :: ParseError -> String
formatParseError err = case parseErrorPosition err of
  Position { line, column } ->
    "line " <> show line <> ", column " <> show column <> ": " <> parseErrorMessage err

-- Horizontal whitespace only: newlines are significant (they become TokSep).
hspaces :: Parser String Unit
hspaces = void $ many $ oneOf [' ', '\t']

word :: Parser String String
word = do
  first <- letter
  rest <- many (alphaNum <|> char '_')
  pure $ SCU.singleton first <> (SCU.fromCharArray (Array.fromFoldable rest))

-- An identifier is one or more words joined by horizontal whitespace, so a
-- multi-word label like `wood in living trees` lexes as a single token. The
-- `try` means a space that isn't followed by a word (e.g. `sales |`) is not
-- swallowed: it backtracks, leaving the space for the tokenizer to skip.
identifier :: Parser String String
identifier = do
  first <- word
  rest <- many (try spacedWord)
  pure $ joinWith " " (Array.fromFoldable (first : rest))
  where
  spacedWord = do
    _ <- oneOf [' ', '\t']
    _ <- many (oneOf [' ', '\t'])
    word

digitChar :: Parser String Char
digitChar = oneOf [ '0', '1', '2', '3', '4', '5', '6', '7', '8', '9' ]

digits :: Parser String String
digits = do
  first <- digitChar
  rest <- many digitChar
  pure $ SCU.singleton first <> SCU.fromCharArray (Array.fromFoldable rest)

-- | A number literal: one or more digits with an optional `.digits` fraction
-- | (no sign, no exponent). The `try` mirrors the identifier's `spacedWord`:
-- | a trailing bare dot (`5.`) backtracks, leaving the `.` to fail
-- | tokenization at its own position. Digits are ASCII-only, so
-- | `Number.fromString` cannot fail on the assembled lexeme.
numberLit :: Parser String Number
numberLit = do
  whole <- digits
  frac <- option "" (try (append "." <$> (char '.' *> digits)))
  case Number.fromString (whole <> frac) of
    Just n -> pure n
    Nothing -> fail "invalid number literal"

arrowLeftOp :: Parser String Operator
arrowLeftOp = ArrowL <$ string "<-"
arrowRightOp :: Parser String Operator
arrowRightOp = ArrowR <$ string "->"
faucetRightOp :: Parser String Operator
faucetRightOp = FaucetR <$ (try (string "=>") <|> string "=")
faucetLeftOp :: Parser String Operator
faucetLeftOp = FaucetL <$ string "<="

operator :: Parser String Operator
operator =
  try faucetRightOp
  <|> try faucetLeftOp
  <|> try arrowRightOp
  <|> try arrowLeftOp
leftParen :: Parser String Char
leftParen = char '('
rightParen :: Parser String Char
rightParen = char ')'
leftBracket :: Parser String Char
leftBracket = char '['
rightBracket :: Parser String Char
rightBracket = char ']'

cloud :: Parser String Char
cloud = char '|'

-- | A loop annotation opens with the exact two-char lexeme `R(` or `B(`
-- | (uppercase, no space) -- a loop-open, the way `[` is a stock-open. The
-- | `try` backtracks a partial match, so a bare `R`, `R->b`, or `Rx(` still
-- | lex as identifiers. Must be tried before `identifier` in `token`.
loopOpen :: Parser String LoopKind
loopOpen = (Reinforcing <$ try (string "R(")) <|> (Balancing <$ try (string "B("))

token :: Parser String Token
token
  =   (TokOp <$> operator)
  <|> (TokLoop <$> loopOpen)
  <|> (TokLParen <$ leftParen)
  <|> (TokRParen <$ rightParen)
  <|> (TokLBracket <$ leftBracket)
  <|> (TokRBracket <$ rightBracket)
  <|> (TokCloud <$ cloud)
  <|> (TokColon <$ char ':')
  <|> (TokNumber <$> numberLit)
  <|> (TokIdent <$> identifier)

-- A run of newlines (plus any surrounding blank space) becomes one TokSep,
-- which the parser treats as a statement boundary. Horizontal whitespace
-- separates tokens on a line and is otherwise insignificant.
separator :: Parser String Token
separator = do
  _ <- oneOf ['\n', '\r']
  _ <- many $ oneOf [' ', '\t', '\n', '\r']
  pure TokSep

-- | A token stamped with the source position where it starts (any preceding
-- | horizontal whitespace was consumed by the previous item, so `position`
-- | really is the token's own start; a separator's position is the newline,
-- | i.e. the end of the previous line -- where "missing operand" errors
-- | should point).
item :: Parser String PosToken
item = do
  pos <- position
  t <- separator <|> token
  hspaces
  pure { pos, tok: t }

tokens :: Parser String (List PosToken)
tokens = do
  hspaces
  toks <- many item
  eof <?> "end of input (cannot read this character)"
  pure toks

tokenize :: String -> Either String (List PosToken)
tokenize input =
  case runParser input tokens of
    Left err -> Left (formatParseError err)
    Right toks -> Right toks

-- | Human rendering for "unexpected <token>" messages; keeps the
-- | token -> lexeme mapping (the surface syntax) solely in the lexer.
describeToken :: Token -> String
describeToken (TokIdent s) = "name '" <> s <> "'"
describeToken (TokOp op) = "'" <> opSymbol op <> "'"
describeToken TokCloud = "'|'"
describeToken (TokLoop k) = "'" <> loopLetter k <> "('"
describeToken TokLParen = "'('"
describeToken TokRParen = "')'"
describeToken TokLBracket = "'['"
describeToken TokRBracket = "']'"
describeToken TokColon = "':'"
describeToken (TokNumber n) = "number " <> show n
describeToken TokSep = "end of line"

opSymbol :: Operator -> String
opSymbol ArrowR = "->"
opSymbol ArrowL = "<-"
opSymbol FaucetR = "=>"
opSymbol FaucetL = "<="
