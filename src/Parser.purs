module Parser 
  ( Tree(..)
  , parse
  ) where

import Prelude

import Data.Either (Either(..))
import Data.List (List(..))
import Data.Maybe (Maybe(..))
import Debug
import Lexer (Token(..), Operator(..), tokenize, lookAhead, accept)

import Data.Show.Generic (genericShow)
import Data.Show (class Show)
import Data.Generic.Rep (class Generic)

data Tree
  = NodeExpr String
  | CloudExpr String
  | StockExpr String -- NodeExpr String
  | FaucetExpr String Tree Tree
  | ArrowRExpr Tree Tree
  | ArrowLExpr Tree Tree
  | ParenExpr Tree

derive instance eqTree :: Eq Tree

derive instance genericTree :: Generic Tree _

-- instance showTree :: Show Tree where
--   show a = genericShow a
instance showTree :: Show Tree where
  show (NodeExpr s) = "Node(" <> s <> ")"
  show (StockExpr s) = "Stock(" <> show s <> ")"
  show (CloudExpr s) = "Cloud(" <> show s <> ")"
  show (FaucetExpr s l r) = "Faucet[" <> show s <> "](" <> show l <> " -> " <> show r <> " )"
  show (ArrowRExpr l r) = "ArrowR(" <> show l <> " -> " <> show r <> ")"
  show (ArrowLExpr l r) = "ArrowL(" <> show l <> " <- " <> show r <> ")"
  show (ParenExpr expr) = "Paren(" <> show expr <> ")"

parse :: List Token -> Either String Tree
parse tokens =
  case expression tokens of
    { tree, rest: Nil } -> Right tree
    { tree, rest } -> Left $ "Leftover tokens: " <> show rest

expression :: List Token -> { tree :: Tree, rest :: List Token }
expression tokens =
  let { tree: termTree, rest: rest' } = term tokens
  in case lookAhead rest' of
    TokOp ArrowR ->
      let { tree: exprTree, rest: rest'' } = expression (accept rest')
      in { tree: ArrowRExpr termTree exprTree, rest: rest'' }
    TokOp ArrowL ->
      let { tree: exprTree, rest: rest'' } = expression (accept rest')
      in { tree: ArrowLExpr termTree exprTree, rest: rest'' }
    TokOp FaucetR ->
      case lookAhead (accept rest') of
        TokIdent name ->
          let { tree: exprTree, rest: rest'' } = expression (accept (accept rest'))
          in { tree: FaucetExpr name termTree exprTree, rest: rest'' }
        _ ->
          { tree: NodeExpr "ERROR", rest: tokens }
    TokOp FaucetL ->
      case lookAhead (accept rest') of
        TokIdent name ->
          let { tree: exprTree, rest: rest'' } = expression (accept (accept rest'))
          in { tree: FaucetExpr name termTree exprTree, rest: rest'' }
        _ ->
          { tree: NodeExpr "ERROR", rest: tokens }
    _ -> { tree: termTree, rest: rest' }

term :: List Token -> { tree :: Tree, rest :: List Token }
term tokens =
  case lookAhead tokens of
    TokLBracket ->
      case lookAhead (accept tokens) of
        TokIdent str ->
          case lookAhead (accept (accept tokens)) of
            TokRBracket ->
              { tree: StockExpr str, rest: accept (accept (accept tokens)) }
            _ ->
              { tree: NodeExpr "ERROR", rest: tokens }
        _ ->
          { tree: NodeExpr "ERROR", rest: tokens }
    _ -> factor tokens
factor :: List Token -> { tree :: Tree, rest :: List Token }
factor tokens =
  case lookAhead tokens of
    TokIdent str -> 
      { tree: NodeExpr str, rest: accept tokens }
    TokCloud str ->
      case lookAhead (accept tokens) of
        TokIdent name ->
          { tree: CloudExpr name, rest: accept (accept tokens) }
        _ ->
          { tree: CloudExpr str, rest: accept tokens }
    TokLParen ->
      let { tree: exprTree, rest: rest' } = expression (accept tokens)
      in case lookAhead rest' of
        TokRParen -> 
          { tree: ParenExpr exprTree, rest: accept rest' }
        _ -> 
          { tree: NodeExpr "ERROR", rest: tokens }
    _ -> 
      { tree: NodeExpr "ERROR", rest: tokens }
