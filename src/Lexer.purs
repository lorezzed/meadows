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
import Parsing (Parser, ParseError, runParser, fail)
import Parsing.Combinators (many, try, optional, sepEndBy)
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
whitespace :: Parser String Unit
whitespace = void $ many $ oneOf [' ', '\t', '\n', '\r']
identifier :: Parser String String
identifier = do
  first <- letter
  rest <- many (alphaNum <|> char '_')
  pure $ SCU.singleton first <> (SCU.fromCharArray (Array.fromFoldable rest))
arrowLeftOp :: Parser String Operator
arrowLeftOp = ArrowL <$ string "<-"
arrowRightOp :: Parser String Operator
arrowRightOp = ArrowR <$ string "->"
stockRightOp :: Parser String Operator
stockRightOp = StockR <$ string "]"
stockLeftOp :: Parser String Operator
stockLeftOp = StockL <$ string "["
faucetRightOp :: Parser String Operator
faucetRightOp = FaucetR <$ string "=>"
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

-- Main tokenizer
tokens :: Parser String (List Token)
tokens = do
  whitespace
  toks <- sepEndBy token whitespace
  eof
  pure toks

tokenize :: String -> Either String (List Token)
tokenize input = 
  case runParser input tokens of
    Left err -> Left $ show err
    Right toks -> Right toks
