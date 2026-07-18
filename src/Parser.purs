module Parser
  ( Tree(..)
  , Id
  , parse
  ) where
import Prelude
import Control.Monad.State (State, evalState, state)
import Data.Either (Either(..))
import Data.List (List(..))
import Data.Tuple (Tuple(..))
import Lexer (Token(..), Operator(..), tokenize, lookAhead, accept)
import Data.Show.Generic (genericShow)
import Data.Show (class Show)
import Data.Generic.Rep (class Generic)
type Id = Int
data Tree
  = NodeExpr Id String
  | CloudExpr Id String
  | StockExpr Id String
  | FaucetExpr Id String Tree Tree
  | ArrowRExpr Id Tree Tree
  | ArrowLExpr Id Tree Tree
  | ParenExpr Id Tree
derive instance eqTree :: Eq Tree
derive instance genericTree :: Generic Tree _
instance showTree :: Show Tree where
  show (NodeExpr i s) = "Node#" <> show i <> "(" <> s <> ")"
  show (StockExpr i s) = "Stock#" <> show i <> "(" <> show s <> ")"
  show (CloudExpr i s) = "Cloud#" <> show i <> "(" <> show s <> ")"
  show (FaucetExpr i s l r) = "Faucet#" <> show i <> "[" <> show s <> "](" <> show l <> " -> " <> show r <> " )"
  show (ArrowRExpr i l r) = "ArrowR#" <> show i <> "(" <> show l <> " -> " <> show r <> ")"
  show (ArrowLExpr i l r) = "ArrowL#" <> show i <> "(" <> show l <> " <- " <> show r <> ")"
  show (ParenExpr i expr) = "Paren#" <> show i <> "(" <> show expr <> ")"
-- | Anonymous counter: hand back the next unused id, bump the state.
fresh :: State Id Id
fresh = state \n -> Tuple n (n + 1)
parse :: List Token -> Either String Tree
parse tokens =
  case evalState (expression tokens) 0 of
    { tree, rest: Nil } -> Right tree
    { tree, rest } -> Left $ "Leftover tokens: " <> show rest
expression :: List Token -> State Id { tree :: Tree, rest :: List Token }
expression tokens = do
  { tree: termTree, rest: rest' } <- term tokens
  case lookAhead rest' of
    TokOp ArrowR -> do
      i <- fresh
      { tree: exprTree, rest: rest'' } <- expression (accept rest')
      pure { tree: ArrowRExpr i termTree exprTree, rest: rest'' }
    TokOp ArrowL -> do
      i <- fresh
      { tree: exprTree, rest: rest'' } <- expression (accept rest')
      pure { tree: ArrowLExpr i termTree exprTree, rest: rest'' }
    TokOp FaucetR ->
      case lookAhead (accept rest') of
        TokIdent name -> do
          i <- fresh
          { tree: exprTree, rest: rest'' } <- expression (accept (accept rest'))
          pure { tree: FaucetExpr i name termTree exprTree, rest: rest'' }
        _ -> errorAt tokens
    TokOp FaucetL ->
      case lookAhead (accept rest') of
        TokIdent name -> do
          i <- fresh
          { tree: exprTree, rest: rest'' } <- expression (accept (accept rest'))
          pure { tree: FaucetExpr i name termTree exprTree, rest: rest'' }
        _ -> errorAt tokens
    _ -> pure { tree: termTree, rest: rest' }
term :: List Token -> State Id { tree :: Tree, rest :: List Token }
term tokens =
  case lookAhead tokens of
    TokLBracket ->
      case lookAhead (accept tokens) of
        TokIdent str ->
          case lookAhead (accept (accept tokens)) of
            TokRBracket -> do
              i <- fresh
              pure { tree: StockExpr i str, rest: accept (accept (accept tokens)) }
            _ -> errorAt tokens
        _ -> errorAt tokens
    _ -> factor tokens
factor :: List Token -> State Id { tree :: Tree, rest :: List Token }
factor tokens =
  case lookAhead tokens of
    TokIdent str -> do
      i <- fresh
      pure { tree: NodeExpr i str, rest: accept tokens }
    TokCloud str ->
      case lookAhead (accept tokens) of
        TokIdent name -> do
          i <- fresh
          pure { tree: CloudExpr i name, rest: accept (accept tokens) }
        _ -> do
          i <- fresh
          pure { tree: CloudExpr i str, rest: accept tokens }
    TokLParen -> do
      i <- fresh
      { tree: exprTree, rest: rest' } <- expression (accept tokens)
      case lookAhead rest' of
        TokRParen -> pure { tree: ParenExpr i exprTree, rest: accept rest' }
        _ -> errorAt tokens
    _ -> errorAt tokens
-- | Every failure path previously returned NodeExpr "ERROR" with the id
-- | field bolted on, that constructor now needs an id too — so failures
-- | still consume a counter tick. Keeps behaviour identical to before.
errorAt :: List Token -> State Id { tree :: Tree, rest :: List Token }
errorAt tokens = do
  i <- fresh
  pure { tree: NodeExpr i "ERROR", rest: tokens }