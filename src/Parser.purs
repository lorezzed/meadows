module Parser
  ( Annot(..)
  , Dir(..)
  , Formula
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
import Data.List (List(..), (:))
import Data.Maybe (Maybe(..))
import Data.Tuple (Tuple(..), fst)
import Expr (Expr(..), FormOp(..), Ref(..))
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
-- | A value formula (`investment: (output * fraction of output invested)`):
-- | arithmetic over numbers and named nodes, plus the time vocabulary (see
-- | `Expr`, which owns the shape and is shared with the evaluator's resolved
-- | form). Each reference mints a parser id like any other name mention, so
-- | the evaluator resolves it through the registry -- identity, not spelling
-- | -- and that is exactly what the `Ref` payload carries.
type Formula = Expr Ref
-- | A node's annotation: a schedule (a constant or `@` steps) or a
-- | parenthesized formula.
data Annot = SchedAnnot Sched | FormulaAnnot Formula
derive instance eqAnnot :: Eq Annot
instance showAnnot :: Show Annot where
  show (SchedAnnot sch) = "Sched" <> showSched (Just sch)
  show (FormulaAnnot f) = "Formula: " <> show f
-- | Which way an arrow or a flow runs: `->`/`=>` read left to right,
-- | `<-`/`<=` right to left. The two spellings share one production and one
-- | evaluator case, so direction travels as DATA -- every rule that depends
-- | on it (which endpoint is the source, which end a chain resolves to) is
-- | then written once instead of twice, and cannot drift apart.
data Dir = Rightward | Leftward
derive instance eqDir :: Eq Dir
instance showDir :: Show Dir where
  show = dirLetter

dirLetter :: Dir -> String
dirLetter Rightward = "R"
dirLetter Leftward = "L"

-- | How the direction reads in a rendered tree (and in the surface syntax).
dirGlyph :: Dir -> String
dirGlyph Rightward = " -> "
dirGlyph Leftward = " <- "

data Tree
  = NodeExpr Id String (Maybe Annot)
  | CloudExpr Id
  | StockExpr Id String (Maybe Number)
  | FaucetExpr Id Dir String (Maybe Annot) Tree (Maybe Tree)
  | ArrowExpr Id Dir Tree Tree
  | ParenExpr Id Tree
  | LoopExpr Id LoopKind Tree
derive instance eqTree :: Eq Tree
instance showTree :: Show Tree where
  show (NodeExpr i s v) = "Node#" <> show i <> "(" <> s <> showAnnotM v <> ")"
  show (StockExpr i s v) = "Stock#" <> show i <> "(" <> show s <> showValue v <> ")"
  show (CloudExpr i) = "Cloud#" <> show i
  show (FaucetExpr i d s v l r) = "Faucet" <> dirLetter d <> "#" <> show i <> "[" <> show s <> showAnnotM v <> "](" <> show l <> dirGlyph d <> show r <> " )"
  show (ArrowExpr i d l r) = "Arrow" <> dirLetter d <> "#" <> show i <> "(" <> show l <> dirGlyph d <> show r <> ")"
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
-- | Mint this node's id. THE minting rule, stated once: an id is taken the
-- | moment the node's own lexemes are consumed and BEFORE any sub-expression
-- | is parsed. Every production obeys it -- leaves mint after their own
-- | tokens, `(` and `R(` mint before their body, an operator mints after the
-- | operator (and a faucet's name and annotation) and before the right
-- | operand -- so ids run in source order as a consequence of the grammar's
-- | shape, not of call ordering. test/golden.mjs pins the result byte-exactly.
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
  [ tk TokPlus *> (fMult >>= \r -> fAddTail (EBin FAdd left r))
  , tk TokMinus *> (fMult >>= \r -> fAddTail (EBin FSub left r))
  , negJuxt
  , pure left
  ]
  where
  negJuxt = do
    n <- satisfyMap case _ of
      TokNumber x | x < 0.0 -> Just x
      _ -> Nothing
    r <- fMultTail (ENum n)
    fAddTail (EBin FAdd left r)

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
  [ tk TokStar *> (fPow >>= \r -> fMultTail (EBin FMul left r))
  , tk TokSlash *> (fPow >>= \r -> fMultTail (EBin FDiv left r))
  , juxt
  , pure left
  ]
  where
  juxt = do
    base <- choice [ fAtom, fParen ]
    r <- powTail base
    fMultTail (EBin FMul left r)

-- | power := factor ('^' power)? -- right-associative (`x^2^3` is
-- | x^(2^3)) and tighter than multiplication and juxtaposition (`x^2y` is
-- | (x^2) * y, the paper convention).
fPow :: P Formula
fPow = defer \_ -> do
  base <- fFactor
  powTail base

powTail :: Formula -> P Formula
powTail base = defer \_ -> choice
  [ tk TokCaret *> (EBin FPow base <$> fPow)
  , pure base
  ]

-- | factor := NUMBER | atom | '(' formula ')'
fFactor :: P Formula
fFactor = defer \_ -> choice
  [ ENum <$> numberTok
  , fAtom
  , fParen
  ] <?> "a number, a name, or '(' in the formula"

-- | atom := 't' | 'pi' | FUNC '(' args ')' shift* | NAME shift*
-- | One name token, then a dispatch on what it is. `t` (the time variable)
-- | and `pi` are complete terms that mint nothing and take no shift tail
-- | (`t(t - 1)` is juxtaposed multiplication t * (t - 1) -- only true
-- | names and paren groups open shifts). A reserved function name whose
-- | NEXT token is `(` is a call -- decided here, before fShiftTail, so
-- | `cos(t / 24)` is a call and never a time shift of a node named `cos`;
-- | without the `(` it is an ordinary reference (the `smooth`/`delay`
-- | precedent: reserved words don't poison plain names). Everything else
-- | mints a parser id and becomes a reference, as every name mention does.
-- | Inside formulas `t` and `pi` shadow any nodes so named -- a node named
-- | `t` is simply not reachable from formulas.
fAtom :: P Formula
fAtom = defer \_ -> do
  name <- identTok
  if name == "t" then pure ETime
  else if name == "pi" then pure EPi
  else do
    call <- peekLParen
    if call && Array.elem name [ "cos", "sin" ] then fFun1 name >>= fShiftTail
    else if call && Array.elem name [ "min", "max" ] then fFun2 name >>= fShiftTail
    else do
      i <- fresh
      fShiftTail (ERef (Ref i name))

-- | Peek: is the next token a '('? Consumes nothing either way. Decides
-- | whether a reserved function name opens a call.
peekLParen :: P Boolean
peekLParen = do
  ParseState input _ _ <- getParserT
  pure case input of
    { tok: TokLParen } : _ -> true
    _ -> false

-- | call := FUNC1 '(' formula ')'   (cos, sin)
-- | Non-backtracking like every annotation body: the consumed '(' commits,
-- | so a malformed argument list is a positioned error.
fFun1 :: String -> P Formula
fFun1 name = do
  tk TokLParen
  a <- formula
  tk TokRParen <?> ("a closing ')' after " <> name <> "'s argument")
  pure (EFun1 name a)

-- | call := FUNC2 '(' formula ',' formula ')'   (min, max)
-- | The comma lives only here: `formula` never consumes one, so it ends
-- | the first argument, and a comma anywhere else is a positioned error.
fFun2 :: String -> P Formula
fFun2 name = do
  tk TokLParen
  a <- formula
  tk TokComma <?> ("a ',' between " <> name <> "'s two arguments")
  b <- formula
  tk TokRParen <?> ("a closing ')' after " <> name <> "'s arguments")
  pure (EFun2 name a b)

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
-- | own (see EShift).
fShiftTail :: Formula -> P Formula
fShiftTail base = defer \_ -> peekShift >>=
  if _ then do
    tk TokLParen
    _ <- identTok -- the peeked `t`
    shifted <- choice
      [ tk TokMinus *> (EShift base <$> fMult)
      , negLiteral <#> \n -> EShift base (ENum (negate n))
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
  [ opTok ArrowR *> arrowTail Rightward "->" left
  , opTok ArrowL *> arrowTail Leftward "<-" left
  , opTok FaucetR *> faucetTail Rightward "=>" left
  , opTok FaucetL *> faucetTail Leftward "<=" left
  , pure left
  ]
-- | arrow tail := expression  (operator already consumed). The id mints
-- | after the operator and before the right operand -- the one minting rule
-- | (see `fresh`), and pinned byte-exactly by test/golden.mjs.
arrowTail :: Dir -> String -> Tree -> P Tree
arrowTail dir opName left = do
  i <- fresh
  right <- expression <?> ("an expression after '" <> opName <> "'")
  pure (ArrowExpr i dir left right)
-- | faucet tail := NAME expression? tail  (operator already consumed). The
-- | target is optional -- a flow may end at its faucet (`a=>j`). optionMaybe
-- | does not backtrack partial consumption, so a malformed *started* target
-- | surfaces its own positioned error instead of vanishing into Nothing.
-- | Re-entering exprTail lets an operator after a dangling faucet apply to
-- | the faucet itself (`a=>b->c` == `(a=>b)->c`); a present target has
-- | already consumed any trailing operators, so exprTail then falls through
-- | its bare-term alternative -- one path serves both shapes.
faucetTail :: Dir -> String -> Tree -> P Tree
faucetTail dir opName left = do
  name <- identTok <?> ("a faucet name after '" <> opName <> "'")
  mval <- annotTail
  i <- fresh
  mtarget <- optionMaybe expression
  exprTail (FaucetExpr i dir name mval left mtarget)
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
