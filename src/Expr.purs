-- | The value-formula shape, in one place.
-- |
-- | A formula (`investment: (output * fraction of output invested)`) exists in
-- | two forms: the parser builds one whose references are *mentions* (a name
-- | plus the id that mention minted), and the evaluator resolves those to node
-- | ids. Both are the SAME tree, so it is declared once and parameterized by
-- | what a reference is:
-- |
-- |     Expr Ref      the parser's form   (Parser.Formula)
-- |     Expr String   the resolved form   (Evaluator.RFormula)
-- |
-- | Everything structural then lives here too -- `children` (the shape),
-- | `refsWhere` (fold it), `traverseRefs` (rebuild it) -- so adding a formula
-- | form means one new case per concern rather than one per concern per copy,
-- | and the two ref-walks the compiler needs stop being two hand-kept-in-sync
-- | recursions and become one policy line each.
module Expr
  ( Expr(..)
  , FormOp(..)
  , Ref(..)
  , opString
  , children
  , refsWhere
  , traverseRefs
  ) where

import Prelude

import Data.Array as Array
import Simple.JSON (class WriteForeign, writeImpl)

-- | Formula operators, usual precedence (`^` binds tightest, then `*`/`/`,
-- | then `+`/`-`). The operator's JSON kind is `opString`, so the surface
-- | spelling and the wire spelling are decided in one place.
data FormOp = FAdd | FSub | FMul | FDiv | FPow

derive instance eqFormOp :: Eq FormOp

opString :: FormOp -> String
opString FAdd = "+"
opString FSub = "-"
opString FMul = "*"
opString FDiv = "/"
opString FPow = "^"

-- | One reference as the parser sees it: the name as written plus the id this
-- | mention minted (the Int is Parser's `Id`, spelled concretely to keep this
-- | module free of the parser). The evaluator resolves it through the registry
-- | -- identity, not spelling.
data Ref = Ref Int String

derive instance eqRef :: Eq Ref
instance showRef :: Show Ref where
  show (Ref i s) = s <> "#" <> show i

-- | Arithmetic over numbers and references, plus the time vocabulary: the
-- | reserved time variable `t` and constant `pi` (complete terms that mint
-- | nothing), the function calls `cos`/`sin` (one argument) and `min`/`max`
-- | (two), and the pipeline time shift `x(t - T)` -- the value x had exactly
-- | T ago, written as function notation over `t`. None of the latter forms
-- | mints an id of its own: they create no graph nodes (the simulator keys
-- | shift state by the owning node and position instead), and only the
-- | references inside their arguments mint.
data Expr r
  = ENum Number
  | ERef r
  | EBin FormOp (Expr r) (Expr r)
  | EShift (Expr r) (Expr r)
  | ETime
  | EPi
  | EFun1 String (Expr r)
  | EFun2 String (Expr r) (Expr r)

derive instance eqExpr :: Eq r => Eq (Expr r)

instance showExpr :: Show r => Show (Expr r) where
  show (ENum n) = show n
  show (ERef r) = show r
  show (EBin op l r) = "(" <> show l <> " " <> opString op <> " " <> show r <> ")"
  show (EShift input time) = show input <> "(t - " <> show time <> ")"
  show ETime = "t"
  show EPi = "pi"
  show (EFun1 name a) = name <> "(" <> show a <> ")"
  show (EFun2 name l r) = name <> "(" <> show l <> ", " <> show r <> ")"

-- | The resolved form is the UI seam: nested objects the simulator evaluates
-- | with no re-parsing -- {kind: "num", value}, {kind: "ref", id},
-- | {kind: "+"|"-"|"*"|"/"|"^", left, right}, {kind: "delay", input, time},
-- | {kind: "t"}, {kind: "pi"}, {kind: "cos"|"sin", arg},
-- | {kind: "min"|"max", left, right}. Only the resolved form serializes: an
-- | unresolved reference has no id to write.
instance writeForeignExpr :: WriteForeign (Expr String) where
  writeImpl (ENum n) = writeImpl { kind: "num", value: n }
  writeImpl (ERef id) = writeImpl { kind: "ref", id }
  writeImpl (EBin op l r) = writeImpl { kind: opString op, left: l, right: r }
  writeImpl (EShift input time) = writeImpl { kind: "delay", input, time }
  writeImpl ETime = writeImpl { kind: "t" }
  writeImpl EPi = writeImpl { kind: "pi" }
  writeImpl (EFun1 name a) = writeImpl { kind: name, arg: a }
  writeImpl (EFun2 name l r) = writeImpl { kind: name, left: l, right: r }

-- | The shape, stated once: an expression's sub-expressions.
children :: forall r. Expr r -> Array (Expr r)
children (EBin _ l r) = [ l, r ]
children (EShift input time) = [ input, time ]
children (EFun1 _ a) = [ a ]
children (EFun2 _ l r) = [ l, r ]
children _ = []

-- | Every reference an expression makes, in reference order, deduplicated --
-- | descending through whatever sub-expressions the policy hands back. Passing
-- | `children` walks the whole tree; a policy that returns `[]` for some form
-- | stops there. The compiler's two questions ("which nodes does this formula
-- | mention?" and "which does it read RIGHT NOW?") are that one policy line
-- | apart -- see Evaluator's `refIds`/`eagerRefIds`.
refsWhere :: forall r. Ord r => (Expr r -> Array (Expr r)) -> Expr r -> Array r
refsWhere kids e = Array.nub (self <> Array.concatMap (refsWhere kids) (kids e))
  where
  self = case e of
    ERef r -> [ r ]
    _ -> []

-- | Rebuild an expression with every reference resolved, left to right (the
-- | order matters: resolving is what registers a name first seen inside a
-- | formula). The resolver is told whether the reference sits inside a time
-- | shift's INPUT, where reading a faucet means reading the flow's rate; the
-- | flag rides down through arithmetic and function arguments, and a shift's
-- | TIME resets it. Only the shape knows which child is an input and which is
-- | a time, so the flag's propagation lives here and its MEANING stays with
-- | the caller.
traverseRefs :: forall m r s. Monad m => (Boolean -> r -> m s) -> Expr r -> m (Expr s)
traverseRefs f = go false
  where
  go _ (ENum n) = pure (ENum n)
  go _ ETime = pure ETime
  go _ EPi = pure EPi
  go inShift (ERef r) = ERef <$> f inShift r
  go inShift (EBin op l r) = EBin op <$> go inShift l <*> go inShift r
  go inShift (EFun1 name a) = EFun1 name <$> go inShift a
  go inShift (EFun2 name l r) = EFun2 name <$> go inShift l <*> go inShift r
  go _ (EShift input time) = EShift <$> go true input <*> go false time
