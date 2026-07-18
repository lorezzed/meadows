module Lexer
  ( Operator(..)
  , Token(..)
  , accept
  , cloud
  , lookAhead
  , tokenize
  )
  where

import Prelude

import Control.Alt ((<|>))
import Data.Array as Array
import Data.Either (Either(..))
import Data.List (List(..), (:))
import Data.List as List
import Data.String.CodeUnits as SCU
import Data.String (joinWith)
import Parsing (Parser, ParseError, runParser, fail)
import Parsing.Combinators (many, try)
import Parsing.String (char, string, satisfy, eof)
-- import Parsing.Token (letter, alphaNum)
import Parsing.String.Basic (oneOf, noneOf, letter, alphaNum)

import Data.Show.Generic (genericShow)
import Data.Show (class Show)
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
-- instance showOperator :: Show Operator where
--   show ArrowR = "->"
--   show ArrowL = "<-"
--   show StockR = "]"
--   show StockL = "["
--   show FaucetR = "=>"
--   show FaucetL = "<="

data Token 
  = TokIdent String
  | TokOp Operator
  | TokCloud String
  | TokLFaucet
  | TokRFaucet
  | TokLParen
  | TokRParen
  | TokLBracket
  | TokRBracket
  | TokSep
  | TokEnd
  
derive instance eqToken :: Eq Token
derive instance genericToken :: Generic Token _
instance showToken :: Show Token where
  show = genericShow

-- Helper functions for list processing
lookAhead :: List Token -> Token
lookAhead Nil = TokEnd
lookAhead (t : _) = t

accept :: List Token -> List Token
accept Nil = Nil
accept (_ : ts) = ts

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
stockRightOp :: Parser String Operator
stockRightOp = StockR <$ string "]"
stockLeftOp :: Parser String Operator
stockLeftOp = StockL <$ string "["
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
  <|> (TokLFaucet <$ faucetLeftOp)
  <|> (TokRFaucet <$ faucetRightOp)
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

item :: Parser String Token
item = do
  t <- separator <|> token
  hspaces
  pure t

-- Main tokenizer
tokens :: Parser String (List Token)
tokens = do
  hspaces
  toks <- many item
  eof
  pure toks

tokenize :: String -> Either String (List Token)
tokenize input = 
  case runParser input tokens of
    Left err -> Left $ show err
    Right toks -> Right toks
