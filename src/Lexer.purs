module Lexer
  ( Operator(..)
  , PosToken
  , Token(..)
  , cloud
  , formatParseError
  , tokenize
  )
  where

import Prelude

import Control.Alt ((<|>))
import Data.Array as Array
import Data.Either (Either(..))
import Data.List (List, (:))
import Data.String.CodeUnits as SCU
import Data.String (joinWith)
import Parsing (Parser, ParseError, Position(..), parseErrorMessage, parseErrorPosition, position, runParser)
import Parsing.Combinators (many, try, (<?>))
import Parsing.String (char, string, eof)
import Parsing.String.Basic (oneOf, letter, alphaNum)

import Data.Show.Generic (genericShow)
import Data.Generic.Rep (class Generic)

data Operator
  = ArrowR   -- ->
  | ArrowL   -- <-
  | StockR   -- ]
  | StockL   -- [
  | FaucetR   -- =>
  | FaucetL   -- <=
  -- | Cloud   -- |

derive instance eqOperator :: Eq Operator
derive instance genericOperator :: Generic Operator _
instance showOperator :: Show Operator where
  show = genericShow

data Token
  = TokIdent String
  | TokOp Operator
  | TokCloud String
  | TokLParen
  | TokRParen
  | TokLBracket
  | TokRBracket
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

-- Parsers for individual tokens
-- Horizontal whitespace only: newlines are significant (they become TokSep).
hspaces :: Parser String Unit
hspaces = void $ many $ oneOf [' ', '\t']

-- A single word: a letter followed by alphanumerics / underscores.
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

cloud :: Parser String String
cloud = string "|"

-- Token parser
token :: Parser String Token
token
  =   (TokOp <$> operator)
  <|> (TokLParen <$ leftParen)
  <|> (TokRParen <$ rightParen)
  <|> (TokLBracket <$ leftBracket)
  <|> (TokRBracket <$ rightBracket)
  <|> (TokCloud <$> cloud)
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

-- Main tokenizer
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
