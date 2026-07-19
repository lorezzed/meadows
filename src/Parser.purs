module Parser
  ( Tree(..)
  , Id
  , parse
  ) where
import Prelude
import Control.Lazy (defer)
import Control.Monad.State (State, evalState, state)
import Data.Either (Either(..))
import Data.Generic.Rep (class Generic)
import Data.List (List(..), (:))
import Data.Maybe (Maybe(..))
import Data.Tuple (Tuple(..), fst)
import Lexer (Operator(..), PosToken, Token(..), describeToken, formatParseError)
import Parsing (ParseState(..), ParserT, fail, failWithPosition, getParserT, initialPos, runParserT', stateParserT)
import Parsing.Combinators (choice, optionMaybe, optional, sepEndBy, (<?>))
import Parsing.Token (eof) as Token
type Id = Int
data Tree
  = NodeExpr Id String
  | CloudExpr Id
  | StockExpr Id String
  | FaucetRExpr Id String Tree (Maybe Tree)
  | FaucetLExpr Id String Tree (Maybe Tree)
  | ArrowRExpr Id Tree Tree
  | ArrowLExpr Id Tree Tree
  | ParenExpr Id Tree
derive instance eqTree :: Eq Tree
derive instance genericTree :: Generic Tree _
instance showTree :: Show Tree where
  show (NodeExpr i s) = "Node#" <> show i <> "(" <> s <> ")"
  show (StockExpr i s) = "Stock#" <> show i <> "(" <> show s <> ")"
  show (CloudExpr i) = "Cloud#" <> show i
  show (FaucetRExpr i s l r) = "FaucetR#" <> show i <> "[" <> show s <> "](" <> show l <> " -> " <> show r <> " )"
  show (FaucetLExpr i s l r) = "FaucetL#" <> show i <> "[" <> show s <> "](" <> show l <> " <- " <> show r <> " )"
  show (ArrowRExpr i l r) = "ArrowR#" <> show i <> "(" <> show l <> " -> " <> show r <> ")"
  show (ArrowLExpr i l r) = "ArrowL#" <> show i <> "(" <> show l <> " <- " <> show r <> ")"
  show (ParenExpr i expr) = "Paren#" <> show i <> "(" <> show expr <> ")"
-- | The token parser: positioned tokens over a `State Id` base monad.
-- | ParserT's MonadState instance routes `state` to the base monad, so
-- | `fresh` mints AST ids directly inside parsing code.
type P a = ParserT (List PosToken) (State Id) a
fresh :: P Id
fresh = state \n -> Tuple n (n + 1)
parse :: List PosToken -> Either String (List Tree)
parse toks =
  let
    -- Seed the parser position at the first token so a failure before any
    -- consumption points at it rather than at line 1, column 1.
    startPos = case toks of
      { pos } : _ -> pos
      Nil -> initialPos
  in
    case fst (evalState (runParserT' (ParseState toks startPos false) program) 0) of
      Left err -> Left (formatParseError err)
      Right trees -> Right trees
-- | Consume one token when the projection yields a payload.
-- |
-- | This exists instead of Parsing.Token's `when`/`match`, which leave the
-- | parser position on the token they just *consumed* -- every later
-- | `fail`-based message (including `<?>` labels) would then point one token
-- | to the left. This primitive keeps the invariant "position = start of the
-- | next unconsumed token": it fails *without consuming*, positioned at the
-- | offending token itself, and on success advances the position to the next
-- | token -- so `<?>` and `Token.eof` report exact locations for free, and
-- | alternatives never need `try`.
satisfyMap :: forall b. (Token -> Maybe b) -> P b
satisfyMap f = do
  ParseState input _ _ <- getParserT
  case input of
    Nil -> fail "unexpected end of input"
    head : tail -> case f head.tok of
      Nothing -> failWithPosition ("unexpected " <> describeToken head.tok) head.pos
      Just b -> stateParserT \_ -> Tuple b (ParseState tail (nextPos head tail) true)
  where
  nextPos _ (nxt : _) = nxt.pos
  nextPos consumed Nil = consumed.pos
tk :: Token -> P Unit
tk t = satisfyMap \tok -> if tok == t then Just unit else Nothing
opTok :: Operator -> P Unit
opTok o = tk (TokOp o)
identTok :: P String
identTok = satisfyMap case _ of
  TokIdent s -> Just s
  _ -> Nothing
-- | program := sep? (expression sepEndBy sep) eof
-- | The lexer collapses every newline run into a single TokSep, so one
-- | optional leading separator plus sepEndBy covers blank leading, interior,
-- | and trailing lines without ever producing an empty statement.
program :: P (List Tree)
program = do
  optional (tk TokSep)
  trees <- sepEndBy expression (tk TokSep)
  Token.eof <?> "an operator ('->', '<-', '=>', '<='), a new line, or the end of the input"
  pure trees
-- | expression := term tail?
-- | The `defer` (here and on `term`) breaks the expression -> term ->
-- | parenTerm -> expression reference cycle: purs rejects top-level value
-- | cycles unless every in-cycle reference sits under a lambda.
expression :: P Tree
expression = defer \_ -> do
  left <- term
  exprTail left
-- | One-token dispatch on the operator after a term. Every alternative
-- | commits by consuming its operator first, so no ids are minted
-- | speculatively and `<|>` never has to undo consumption; the bare-term
-- | fallback must stay last.
exprTail :: Tree -> P Tree
exprTail left = choice
  [ opTok ArrowR *> arrowTail ArrowRExpr "->" left
  , opTok ArrowL *> arrowTail ArrowLExpr "<-" left
  , opTok FaucetR *> faucetTail FaucetRExpr "=>" left
  , opTok FaucetL *> faucetTail FaucetLExpr "<=" left
  , pure left
  ]
-- | arrow tail := expression  (operator already consumed). The id mints
-- | after the operator and before the right operand -- minting order is
-- | pinned byte-exactly by test/golden.mjs, so don't reorder.
arrowTail :: (Id -> Tree -> Tree -> Tree) -> String -> Tree -> P Tree
arrowTail mk opName left = do
  i <- fresh
  right <- expression <?> ("an expression after '" <> opName <> "'")
  pure (mk i left right)
-- | faucet tail := NAME expression? tail  (operator already consumed). The
-- | target is optional -- a flow may end at its faucet (`a=>j`). optionMaybe
-- | does not backtrack partial consumption, so a malformed *started* target
-- | surfaces its own positioned error instead of vanishing into Nothing.
-- | Re-entering exprTail lets an operator after a dangling faucet apply to
-- | the faucet itself (`a=>b->c` == `(a=>b)->c`); a present target has
-- | already consumed any trailing operators, so exprTail then falls through
-- | its bare-term alternative -- one path serves both shapes.
faucetTail :: (Id -> String -> Tree -> Maybe Tree -> Tree) -> String -> Tree -> P Tree
faucetTail mk opName left = do
  name <- identTok <?> ("a faucet name after '" <> opName <> "'")
  i <- fresh
  mtarget <- optionMaybe expression
  exprTail (mk i name left mtarget)
-- | term := '[' NAME ']' | '|' | '(' expression ')' | NAME
-- | The alternatives dispatch on disjoint first tokens and satisfyMap never
-- | consumes on failure, so the grammar needs no `try` anywhere.
term :: P Tree
term = defer \_ -> choice
  [ stockTerm
  , cloudTerm
  , parenTerm
  , identTerm
  ] <?> "a name, a '[stock]', a '|' cloud, or '('"
stockTerm :: P Tree
stockTerm = do
  tk TokLBracket
  name <- identTok <?> "a stock name after '['"
  tk TokRBracket <?> "a closing ']'"
  i <- fresh
  pure (StockExpr i name)
-- | `|` is always a bare anonymous cloud; it never takes a following
-- | identifier as its label (`|a` is a parse error -- write `|->a`).
cloudTerm :: P Tree
cloudTerm = do
  tk TokCloud
  i <- fresh
  pure (CloudExpr i)
identTerm :: P Tree
identTerm = do
  name <- identTok
  i <- fresh
  pure (NodeExpr i name)
-- | ParenExpr mints BEFORE its inner expression (id-stability point).
parenTerm :: P Tree
parenTerm = do
  tk TokLParen
  i <- fresh
  inner <- expression
  tk TokRParen <?> "a closing ')'"
  pure (ParenExpr i inner)
