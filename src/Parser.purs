module Parser
  ( Annot(..)
  , Formula(..)
  , FormOp(..)
  , opString
  , Tree(..)
  , Id
  , Step
  , Sched
  , parse
  ) where
import Prelude
import Control.Lazy (defer)
import Control.Monad.State (State, evalState, state)
import Data.Array as Array
import Data.Either (Either(..))
import Data.Generic.Rep (class Generic)
import Data.List (List(..), (:))
import Data.Maybe (Maybe(..))
import Data.Tuple (Tuple(..), fst)
import Lexer (LoopKind, Operator(..), PosToken, Token(..), describeToken, formatParseError, loopLetter)
import Parsing (ParseState(..), ParserT, fail, failWithPosition, getParserT, initialPos, runParserT', stateParserT)
import Parsing.Combinators (choice, many, optionMaybe, optional, sepEndBy, (<?>))
import Parsing.Token (eof) as Token
type Id = Int
-- | One segment of a schedule: from time `at` onward the value is `value`
-- | (until a later step takes over).
type Step = { at :: Number, value :: Number }
-- | A full annotation: the initial value plus any steps. Steps hold
-- | piecewise-constant (`inflow: 0 @5: 5` = closed until t=5, then 5 -- a
-- | tap being turned); a curve is written as a denser staircase of steps.
type Sched = { initial :: Number, steps :: Array Step }
-- | Formula operators, usual precedence (`^` binds tightest, then `*`/`/`,
-- | then `+`/`-`).
data FormOp = FAdd | FSub | FMul | FDiv | FPow
derive instance eqFormOp :: Eq FormOp
opString :: FormOp -> String
opString FAdd = "+"
opString FSub = "-"
opString FMul = "*"
opString FDiv = "/"
opString FPow = "^"
-- | A value formula (`investment: (output * fraction of output invested)`):
-- | arithmetic over numbers and named nodes. Each reference mints a parser
-- | id like any other name mention, so the evaluator resolves it through
-- | the registry -- identity, not spelling. The one non-arithmetic form is
-- | the pipeline time shift `x(t - T)` -- the value x had exactly T ago,
-- | written as function notation over the reserved time variable `t`. A
-- | shift opens with the exact token pair `(t`, so `x(a + b)` stays
-- | juxtaposed multiplication. A time shift mints nothing of its own: it
-- | creates no graph node, and the simulator keys its state by the owning
-- | node and position instead.
data Formula
  = FNum Number
  | FRef Id String
  | FBin FormOp Formula Formula
  | FCall Formula Formula
derive instance eqFormula :: Eq Formula
instance showFormula :: Show Formula where
  show (FNum n) = show n
  show (FRef i s) = s <> "#" <> show i
  show (FBin op l r) = "(" <> show l <> " " <> opString op <> " " <> show r <> ")"
  show (FCall input time) = show input <> "(t - " <> show time <> ")"
-- | A node's annotation: a schedule (a constant or `@` steps) or a
-- | parenthesized formula.
data Annot = SchedAnnot Sched | FormulaAnnot Formula
derive instance eqAnnot :: Eq Annot
instance showAnnot :: Show Annot where
  show (SchedAnnot sch) = "Sched" <> showSched (Just sch)
  show (FormulaAnnot f) = "Formula: " <> show f
data Tree
  = NodeExpr Id String (Maybe Annot)
  | CloudExpr Id
  | StockExpr Id String (Maybe Number)
  | FaucetRExpr Id String (Maybe Annot) Tree (Maybe Tree)
  | FaucetLExpr Id String (Maybe Annot) Tree (Maybe Tree)
  | ArrowRExpr Id Tree Tree
  | ArrowLExpr Id Tree Tree
  | ParenExpr Id Tree
  | LoopExpr Id LoopKind Tree
derive instance eqTree :: Eq Tree
derive instance genericTree :: Generic Tree _
instance showTree :: Show Tree where
  show (NodeExpr i s v) = "Node#" <> show i <> "(" <> s <> showAnnotM v <> ")"
  show (StockExpr i s v) = "Stock#" <> show i <> "(" <> show s <> showValue v <> ")"
  show (CloudExpr i) = "Cloud#" <> show i
  show (FaucetRExpr i s v l r) = "FaucetR#" <> show i <> "[" <> show s <> showAnnotM v <> "](" <> show l <> " -> " <> show r <> " )"
  show (FaucetLExpr i s v l r) = "FaucetL#" <> show i <> "[" <> show s <> showAnnotM v <> "](" <> show l <> " <- " <> show r <> " )"
  show (ArrowRExpr i l r) = "ArrowR#" <> show i <> "(" <> show l <> " -> " <> show r <> ")"
  show (ArrowLExpr i l r) = "ArrowL#" <> show i <> "(" <> show l <> " <- " <> show r <> ")"
  show (ParenExpr i expr) = "Paren#" <> show i <> "(" <> show expr <> ")"
  show (LoopExpr i k expr) = "Loop#" <> show i <> "(" <> loopLetter k <> " " <> show expr <> ")"

showValue :: Maybe Number -> String
showValue Nothing = ""
showValue (Just n) = ": " <> show n

showAnnotM :: Maybe Annot -> String
showAnnotM Nothing = ""
showAnnotM (Just (SchedAnnot sch)) = showSched (Just sch)
showAnnotM (Just (FormulaAnnot f)) = ": " <> show f

showSched :: Maybe Sched -> String
showSched Nothing = ""
showSched (Just s) = ": " <> show s.initial
  <> Array.foldMap (\st -> " @" <> show st.at <> ": " <> show st.value) s.steps
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
loopTok :: P LoopKind
loopTok = satisfyMap case _ of
  TokLoop k -> Just k
  _ -> Nothing
numberTok :: P Number
numberTok = satisfyMap case _ of
  TokNumber n -> Just n
  _ -> Nothing
-- | An optional `: N` value annotation (a stock's initial level, a dot's
-- | auxiliary constant).
-- | optionMaybe does not backtrack partial consumption, so once the
-- | ':' is consumed a missing or non-number value is a positioned error,
-- | never a silent Nothing; with no ':' present nothing is consumed at all
-- | (id-minting order for value-less input is untouched).
valueTail :: P (Maybe Number)
valueTail = optionMaybe (tk TokColon *> (numberTok <?> "a number after ':'"))

-- | An optional annotation after a name: `: N` (with optional `@` steps)
-- | is a schedule, `: ( ... )` a formula. Same non-backtracking discipline
-- | as valueTail: each consumed ':', '(', or '@' commits, so a malformed
-- | segment is a positioned error.
annotTail :: P (Maybe Annot)
annotTail = optionMaybe do
  tk TokColon
  choice
    [ FormulaAnnot <$> formulaGroup
    , SchedAnnot <$> schedBody
    ] <?> "a number or a '(' formula after ':'"

-- | A schedule (the ':' already consumed): an initial value plus any number
-- | of piecewise-constant `@` steps.
schedBody :: P Sched
schedBody = do
  initial <- numberTok
  steps <- many stepSeg
  pure { initial, steps: Array.fromFoldable steps }
  where
  stepSeg = tk TokAt *> stepBody
  stepBody = do
    at <- numberTok <?> "a time after '@'"
    tk TokColon <?> "a ':' after the '@' time"
    value <- numberTok <?> "a value after ':'"
    pure { at, value }

-- | formula group := '(' formula ')'   (the annotation form `: (expr)`).
-- | The parens delimit where the formula ends, keeping the surrounding
-- | statement grammar (arrows, faucets, multi-word names) unambiguous.
formulaGroup :: P Formula
formulaGroup = do
  tk TokLParen
  f <- formula
  tk TokRParen <?> "a closing ')' after the formula"
  pure f

-- | formula := multiplicative (('+' | '-' | juxtaposed negative number)
-- | multiplicative)*. A juxtaposed negative literal folds as addition of
-- | the negative -- `x -5` lexes the `-5` as one signed number, and
-- | x + (-5) is the same arithmetic as x - 5, so spacing never changes the
-- | math.
formula :: P Formula
formula = defer \_ -> do
  first <- fMult
  fAddTail first

fAddTail :: Formula -> P Formula
fAddTail left = defer \_ -> choice
  [ tk TokPlus *> (fMult >>= \r -> fAddTail (FBin FAdd left r))
  , tk TokMinus *> (fMult >>= \r -> fAddTail (FBin FSub left r))
  , negJuxt
  , pure left
  ]
  where
  negJuxt = do
    n <- satisfyMap case _ of
      TokNumber x | x < 0.0 -> Just x
      _ -> Nothing
    r <- fMultTail (FNum n)
    fAddTail (FBin FAdd left r)

-- | multiplicative := power (('*' | '/') power | juxtaposed power)*.
-- | Juxtaposition is implicit multiplication and only a name or a '('
-- | group may open a juxtaposed factor (`2x`, `2(a + b)`, `2x^2` is
-- | 2 * (x^2)); a juxtaposed positive number stays an error, and negative
-- | ones belong to the additive level. Note the lexer joins
-- | space-separated words into ONE multi-word name, so `output fraction`
-- | is a single reference -- write `output * fraction` to multiply two
-- | names.
fMult :: P Formula
fMult = defer \_ -> do
  first <- fPow
  fMultTail first

fMultTail :: Formula -> P Formula
fMultTail left = defer \_ -> choice
  [ tk TokStar *> (fPow >>= \r -> fMultTail (FBin FMul left r))
  , tk TokSlash *> (fPow >>= \r -> fMultTail (FBin FDiv left r))
  , juxt
  , pure left
  ]
  where
  juxt = do
    base <- choice [ fAtom, fParen ]
    r <- powTail base
    fMultTail (FBin FMul left r)

-- | power := factor ('^' power)? -- right-associative (`x^2^3` is
-- | x^(2^3)) and tighter than multiplication and juxtaposition (`x^2y` is
-- | (x^2) * y, the paper convention).
fPow :: P Formula
fPow = defer \_ -> do
  base <- fFactor
  powTail base

powTail :: Formula -> P Formula
powTail base = defer \_ -> choice
  [ tk TokCaret *> (FBin FPow base <$> fPow)
  , pure base
  ]

-- | factor := NUMBER | atom | '(' formula ')'
-- | The `t` guard runs before the labeled choice so its message survives
-- | the `<?>` (which would otherwise mask any non-consuming failure).
fFactor :: P Formula
fFactor = defer \_ -> guardNotT *> (choice
  [ FNum <$> numberTok
  , fAtom
  , fParen
  ] <?> "a number, a name, or '(' in the formula")

-- | atom := NAME shift*
-- | A reference to another node by name, minting a parser id as every name
-- | mention does -- except the single word `t`, the reserved time
-- | variable, which may only open a time shift (see fShiftTail) and is
-- | rejected here with a positioned error before anything is consumed.
fAtom :: P Formula
fAtom = defer \_ -> do
  guardNotT
  name <- identTok
  i <- fresh
  fShiftTail (FRef i name)

-- | Inside a formula the name `t` is the time variable, not a reference --
-- | a node named `t` is simply not reachable from formulas.
guardNotT :: P Unit
guardNotT = do
  ParseState input _ _ <- getParserT
  case input of
    { tok: TokIdent "t", pos } : _ ->
      failWithPosition "'t' is the time variable -- it only opens a time shift like x(t - 1)" pos
    _ -> pure unit

-- | shift := '(' 't' ('-' time | NEGNUMBER)? ')'
-- | Postfix time shifts, chaining left to right: after a name or a paren
-- | group, the exact token pair `(t` opens a shift -- `x(t - T)` reads the
-- | value x had T ago (a pipeline delay), and `x(t)` is just x. Any other
-- | '(' is left alone (it is juxtaposed multiplication), decided by
-- | `peekShift`'s pure two-token peek, so the grammar stays `try`-free.
-- | The time is one multiplicative term: `x(t - 3 - d)` is a positioned
-- | error -- parenthesize the compound time, `x(t - (3 + d))`. A signed
-- | literal folds exactly like the additive level's negative
-- | juxtaposition: `x(t -3)` is `x(t - 3)`. A shift mints no id of its
-- | own (see FCall).
fShiftTail :: Formula -> P Formula
fShiftTail base = defer \_ -> peekShift >>=
  if _ then do
    tk TokLParen
    _ <- identTok -- the peeked `t`
    shifted <- choice
      [ tk TokMinus *> (FCall base <$> fMult)
      , negLiteral <#> \n -> FCall base (FNum (negate n))
      , pure base -- `x(t)`: the signal right now
      ]
    tk TokRParen <?> "a closing ')' after the time shift (parenthesize a compound time: x(t - (3 + d)))"
    fShiftTail shifted
  else pure base
  where
  negLiteral = satisfyMap case _ of
    TokNumber n | n < 0.0 -> Just n
    _ -> Nothing

-- | Peek: does a time shift `(t` start here? Consumes nothing either way.
peekShift :: P Boolean
peekShift = do
  ParseState input _ _ <- getParserT
  pure case input of
    { tok: TokLParen } : { tok: TokIdent "t" } : _ -> true
    _ -> false

fParen :: P Formula
fParen = defer \_ -> do
  tk TokLParen
  f <- formula
  tk TokRParen <?> "a closing ')' in the formula"
  fShiftTail f
-- | program := sep? (statement sepEndBy sep) eof
-- | The lexer collapses every newline run into a single TokSep, so one
-- | optional leading separator plus sepEndBy covers blank leading, interior,
-- | and trailing lines without ever producing an empty statement.
program :: P (List Tree)
program = do
  optional (tk TokSep)
  trees <- sepEndBy statement (tk TokSep)
  Token.eof <?> "an operator ('->', '<-', '=>', '<='), a new line, or the end of the input"
  pure trees
-- | statement := loop tail | expression
-- | A loop annotation opens a statement and may be continued by operators,
-- | exactly like a parenthesized term: `B(...) <- goal` hangs an arrow off
-- | whatever the loop's inner expression resolves to (its chain's end), and
-- | the tail's nodes are NOT loop members -- figure 15 feeds `thermostat
-- | setting` into a discrepancy inside the B loop without joining it. A loop
-- | is still never an *interior* term: `a->R(b)` is a positioned parse
-- | error. The alternatives dispatch on disjoint first tokens (TokLoop
-- | starts only a loop), so still no `try`.
statement :: P Tree
statement = choice [ loopStmt >>= exprTail, expression ]
-- | loop := LOOPKIND expression ')'   (the `R(`/`B(` lexeme is one token).
-- | Mints BEFORE its body, like ParenExpr (id-stability point).
loopStmt :: P Tree
loopStmt = do
  kind <- loopTok
  i <- fresh
  inner <- expression <?> ("an expression inside '" <> loopLetter kind <> "(...)'")
  tk TokRParen <?> "a closing ')'"
  pure (LoopExpr i kind inner)
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
faucetTail :: (Id -> String -> Maybe Annot -> Tree -> Maybe Tree -> Tree) -> String -> Tree -> P Tree
faucetTail mk opName left = do
  name <- identTok <?> ("a faucet name after '" <> opName <> "'")
  mval <- annotTail
  i <- fresh
  mtarget <- optionMaybe expression
  exprTail (mk i name mval left mtarget)
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
  mval <- valueTail
  tk TokRBracket <?> "a closing ']'"
  i <- fresh
  pure (StockExpr i name mval)
-- | `|` is always a bare anonymous cloud; it never takes a following
-- | identifier as its label (`|a` is a parse error -- write `|->a`).
cloudTerm :: P Tree
cloudTerm = do
  tk TokCloud
  i <- fresh
  pure (CloudExpr i)
-- | A bare name takes a full annotation, exactly like a faucet: `: N` is
-- | an auxiliary constant (`room temperature: 18`), `@` steps make it a
-- | driving variable (figure 19's cold day), and `: (expr)` a computed
-- | auxiliary (`output: (capital / 3)`). annotTail consumes nothing when
-- | no ':' follows, and the id still mints after the whole term, so
-- | value-less minting order is untouched.
identTerm :: P Tree
identTerm = do
  name <- identTok
  mval <- annotTail
  i <- fresh
  pure (NodeExpr i name mval)
-- | ParenExpr mints BEFORE its inner expression (id-stability point).
parenTerm :: P Tree
parenTerm = do
  tk TokLParen
  i <- fresh
  inner <- expression
  tk TokRParen <?> "a closing ')'"
  pure (ParenExpr i inner)
