-- | PureScript unit suite for the compiler internals: token streams and
-- | positions, exact `Tree` shapes (including minted ids), and evaluator
-- | identity/link/group rules. The end-to-end JSON seam is pinned separately,
-- | byte-exactly, by test/golden.mjs (`make test` runs both).
module Test.Main where

import Prelude

import Data.Array as Array
import Data.Either (Either(..))
import Data.Foldable (traverse_)
import Data.List (List(..), (:))
import Data.Maybe (Maybe(..))
import Data.String (Pattern(..), contains)
import Data.Tuple (Tuple(..), fst)
import Effect (Effect)
import Effect.Console (log)
import Effect.Exception (throw)
import Evaluator (Graph, Link, evaluate)
import Lexer (LoopKind(..), Operator(..), Token(..), tokenize)
import Parser (Tree(..), parse)
import Parsing (Position(..))

-- | Nothing = pass; Just = failure report.
expectEq :: forall a. Eq a => Show a => String -> a -> a -> Maybe String
expectEq name expected actual
  | expected == actual = Nothing
  | otherwise = Just
      (name <> "\n    expected: " <> show expected <> "\n    actual:   " <> show actual)

-- | The result must be a Left whose message contains the given fragment
-- | (error wording is tunable; the "line L, column C" position is the
-- | contractual part).
expectErrorAt :: forall a. Show a => String -> String -> Either String a -> Maybe String
expectErrorAt name fragment result = case result of
  Left msg
    | contains (Pattern fragment) msg -> Nothing
    | otherwise -> Just
        (name <> "\n    expected error containing: " <> fragment <> "\n    actual error: " <> msg)
  Right x -> Just (name <> "\n    expected an error, got: " <> show x)

-- The compiler is pure, so the whole suite is pure data over these helpers.
parseAll :: String -> Either String (List Tree)
parseAll s = tokenize s >>= parse

graphOf :: String -> Either String Graph
graphOf s = evaluate <$> parseAll s

toksOf :: String -> Either String (List Token)
toksOf s = map _.tok <$> tokenize s

posOf :: String -> Either String (List (Tuple Int Int))
posOf s = map (\pt -> case pt.pos of Position p -> Tuple p.line p.column) <$> tokenize s

linksOf :: String -> Either String (Array Link)
linksOf s = _.links <$> graphOf s

nodeCount :: String -> Either String Int
nodeCount s = (Array.length <<< _.nodes) <$> graphOf s

-- | (label, group) per node, sorted by label so expectations read naturally.
labelGroups :: String -> Either String (Array (Tuple String (Maybe Int)))
labelGroups s =
  (Array.sortWith fst <<< map (\n -> Tuple n.label n.group) <<< _.nodes) <$> graphOf s

-- | (label, loop names) per node, sorted by label.
labelLoops :: String -> Either String (Array (Tuple String (Maybe (Array String))))
labelLoops s =
  (Array.sortWith fst <<< map (\n -> Tuple n.label n.loop) <<< _.nodes) <$> graphOf s

-- | (label, value) per node, sorted by label.
labelValues :: String -> Either String (Array (Tuple String (Maybe Number)))
labelValues s =
  (Array.sortWith fst <<< map (\n -> Tuple n.label n.value) <<< _.nodes) <$> graphOf s

-- | (label, steps) per node, sorted by label.
labelSteps :: String -> Either String (Array (Tuple String (Maybe (Array { at :: Number, value :: Number }))))
labelSteps s =
  (Array.sortWith fst <<< map (\n -> Tuple n.label n.steps) <<< _.nodes) <$> graphOf s

tests :: Array (Maybe String)
tests =
  -- Lexer: token streams
  [ expectEq "lexes idents and arrows"
      (Right (TokIdent "a" : TokOp ArrowR : TokIdent "b" : Nil))
      (toksOf "a->b")
  , expectEq "lone = is an alias for =>"
      (Right (TokIdent "a" : TokOp FaucetR : TokIdent "b" : Nil))
      (toksOf "a=b")
  , expectEq "multi-word identifier is one token"
      (Right (TokIdent "wood in living trees" : Nil))
      (toksOf "wood in living trees")
  , expectEq "a newline run collapses to one TokSep"
      (Right (TokIdent "a" : TokSep : TokIdent "b" : Nil))
      (toksOf "a\n\n\nb")
  -- Lexer: positions
  , expectEq "tokens carry their start positions"
      (Right (Tuple 1 1 : Tuple 1 3 : Tuple 1 6 : Nil))
      (posOf "a -> b")
  , expectEq "positions track lines (the separator sits at the newline)"
      (Right (Tuple 1 1 : Tuple 1 2 : Tuple 2 1 : Nil))
      (posOf "a\nb")
  , expectErrorAt "unlexable input reports its position"
      "line 1, column 1" (toksOf "?")
  -- Lexer: loop annotations (`R(`/`B(` is one loop-open lexeme)
  , expectEq "R( lexes as a loop-open token"
      (Right (TokLoop Reinforcing : TokIdent "a" : TokOp ArrowR : TokIdent "b" : TokRParen : Nil))
      (toksOf "R(a->b)")
  , expectEq "B( lexes as a loop-open token"
      (Right (TokLoop Balancing : TokIdent "a" : TokRParen : Nil))
      (toksOf "B(a)")
  , expectEq "a bare R stays an identifier"
      (Right (TokIdent "R" : TokOp ArrowR : TokIdent "b" : Nil))
      (toksOf "R->b")
  , expectEq "only the exact lexeme opens a loop: Rx( is a name plus '('"
      (Right (TokIdent "Rx" : TokLParen : TokIdent "a" : TokRParen : Nil))
      (toksOf "Rx(a)")
  , expectEq "loop tokens carry their start positions"
      (Right (Tuple 1 1 : Tuple 1 3 : Tuple 1 4 : Nil))
      (posOf "R(a)")
  -- Lexer: values (':' + number literals)
  , expectEq "a stock value lexes as colon + number"
      (Right (TokLBracket : TokIdent "a" : TokColon : TokNumber 50.0 : TokRBracket : Nil))
      (toksOf "[a: 50]")
  , expectEq "decimal literals lex"
      (Right (TokNumber 2.5 : Nil))
      (toksOf "2.5")
  , expectEq "a digit inside a word stays part of the identifier"
      (Right (TokIdent "a2" : Nil))
      (toksOf "a2")
  , expectEq "value tokens carry their start positions"
      (Right (Tuple 1 1 : Tuple 1 2 : Tuple 1 4 : Nil))
      (posOf "x: 5")
  , expectEq "@ lexes as its own token"
      (Right (TokIdent "f" : TokColon : TokNumber 0.0 : TokAt : TokNumber 5.0 : TokColon : TokNumber 5.0 : Nil))
      (toksOf "f: 0 @5: 5")
  , expectErrorAt "negative numbers are not lexable"
      "line 1, column 1" (toksOf "-5")
  , expectErrorAt "a number's trailing bare dot fails at the dot"
      "line 1, column 2" (toksOf "5.")
  -- Parser: tree shapes and exact ids (mint order: atoms after their tokens,
  -- operators after op+name before the right operand, parens before the body)
  , expectEq "arrow AST (ids: left 0, operator 1, right 2)"
      (Right (ArrowRExpr 1 (NodeExpr 0 "a" Nothing) (NodeExpr 2 "b" Nothing) : Nil))
      (parseAll "a->b")
  , expectEq "dangling faucet has no target"
      (Right (FaucetRExpr 1 "j" Nothing (NodeExpr 0 "a" Nothing) Nothing : Nil))
      (parseAll "a=>j")
  , expectEq "faucet with a stock target"
      (Right (FaucetRExpr 1 "j" Nothing (NodeExpr 0 "a" Nothing) (Just (StockExpr 2 "b" Nothing)) : Nil))
      (parseAll "a=>j[b]")
  , expectEq "leftward faucet mirrors the rightward one"
      (Right (FaucetLExpr 1 "j" Nothing (NodeExpr 0 "a" Nothing) Nothing : Nil))
      (parseAll "a<=j")
  , expectEq "an operator after a dangling faucet applies to the faucet"
      (Right (ArrowRExpr 2 (FaucetRExpr 1 "b" Nothing (NodeExpr 0 "a" Nothing) Nothing) (NodeExpr 3 "c" Nothing) : Nil))
      (parseAll "a=>b->c")
  , expectEq "with a target present the operator belongs to the target"
      (Right (FaucetRExpr 1 "b" Nothing (NodeExpr 0 "a" Nothing)
                (Just (ArrowRExpr 3 (StockExpr 2 "x" Nothing) (NodeExpr 4 "c" Nothing))) : Nil))
      (parseAll "a=>b[x]->c")
  , expectEq "paren mints before its body"
      (Right (ArrowRExpr 3 (ParenExpr 0 (FaucetRExpr 2 "f" Nothing (NodeExpr 1 "a" Nothing) Nothing)) (NodeExpr 4 "b" Nothing) : Nil))
      (parseAll "(a=>f)->b")
  , expectEq "loop AST: the annotation mints before its body"
      (Right (LoopExpr 0 Reinforcing (ArrowRExpr 2 (NodeExpr 1 "a" Nothing) (NodeExpr 3 "b" Nothing)) : Nil))
      (parseAll "R(a->b)")
  , expectEq "statements share one id counter"
      (Right (ArrowRExpr 1 (NodeExpr 0 "a" Nothing) (NodeExpr 2 "b" Nothing) : NodeExpr 3 "c" Nothing : Nil))
      (parseAll "a->b\nc")
  , expectEq "blank lines yield no empty statements"
      (Right (NodeExpr 0 "a" Nothing : NodeExpr 1 "b" Nothing : Nil))
      (parseAll "\na\n\nb\n")
  , expectEq "stock term"
      (Right (StockExpr 0 "s" Nothing : Nil)) (parseAll "[s]")
  -- Parser: value annotations (stocks, faucets, and dot constants)
  , expectEq "stock with an initial value"
      (Right (StockExpr 0 "a" (Just 50.0) : Nil))
      (parseAll "[a: 50]")
  , expectEq "faucet with a rate, no target"
      (Right (FaucetRExpr 1 "f" (Just { initial: 5.0, steps: [] }) (NodeExpr 0 "a" Nothing) Nothing : Nil))
      (parseAll "a=>f: 5")
  , expectEq "leftward faucet with a rate"
      (Right (FaucetLExpr 1 "f" (Just { initial: 5.0, steps: [] }) (NodeExpr 0 "a" Nothing) Nothing : Nil))
      (parseAll "a<=f: 5")
  , expectEq "an operator after a valued faucet still applies to the faucet"
      (Right (ArrowRExpr 2 (FaucetRExpr 1 "f" (Just { initial: 5.0, steps: [] }) (NodeExpr 0 "a" Nothing) Nothing) (NodeExpr 3 "c" Nothing) : Nil))
      (parseAll "a=>f: 5->c")
  , expectEq "the figure 5 statement parses with its values"
      (Right (FaucetRExpr 1 "inflow" Nothing (CloudExpr 0)
                (Just (FaucetRExpr 3 "outflow" (Just { initial: 5.0, steps: [] }) (StockExpr 2 "water in tub" (Just 50.0))
                  (Just (CloudExpr 4)))) : Nil))
      (parseAll "|=>inflow[water in tub: 50]=>outflow: 5|")
  -- Parser: faucet rate schedules (`@time: rate` steps)
  , expectEq "a faucet schedule parses its steps in order"
      (Right (FaucetRExpr 1 "f" (Just { initial: 0.0, steps: [ { at: 5.0, value: 5.0 } ] }) (NodeExpr 0 "a" Nothing) Nothing : Nil))
      (parseAll "a=>f: 0 @5: 5")
  , expectEq "schedules chain and allow decimals"
      (Right (FaucetRExpr 1 "f" (Just { initial: 0.0, steps: [ { at: 2.5, value: 1.0 }, { at: 7.0, value: 4.0 } ] }) (NodeExpr 0 "a" Nothing) Nothing : Nil))
      (parseAll "a=>f: 0 @2.5: 1 @7: 4")
  , expectEq "a target may follow a schedule"
      (Right (FaucetRExpr 1 "f" (Just { initial: 0.0, steps: [ { at: 5.0, value: 5.0 } ] }) (NodeExpr 0 "a" Nothing)
                (Just (StockExpr 2 "b" Nothing)) : Nil))
      (parseAll "a=>f: 0 @5: 5[b]")
  , expectErrorAt "a step needs a time"
      "line 1, column 9" (parseAll "a=>f: 0 @")
  , expectErrorAt "a step time needs a ':'"
      "line 1, column 12" (parseAll "a=>f: 0 @5 3")
  , expectErrorAt "a step needs a rate after its ':'"
      "line 1, column 11" (parseAll "a=>f: 0 @5:")
  , expectErrorAt "stocks take a single value, not a schedule"
      "line 1, column 7" (parseAll "[a: 1 @2: 3]")
  -- Parser: dot constants (a single value; never a schedule)
  , expectEq "a bare dot takes a constant"
      (Right (NodeExpr 0 "a" (Just 5.0) : Nil))
      (parseAll "a: 5")
  , expectEq "a dot constant composes with arrows (ids: dot 0, arrow 1, dot 2)"
      (Right (ArrowRExpr 1 (NodeExpr 0 "room" (Just 18.0)) (NodeExpr 2 "d" Nothing) : Nil))
      (parseAll "room: 18 -> d")
  , expectErrorAt "dots take a single value, not a schedule"
      "line 1, column 6" (parseAll "a: 1 @2: 3")
  -- Parser: values are positioned errors anywhere else
  , expectErrorAt "a colon needs a number"
      "line 1, column 4" (parseAll "[a:]")
  , expectErrorAt "a name is not a value"
      "line 1, column 5" (parseAll "[a: b]")
  , expectErrorAt "the value goes inside the stock brackets"
      "line 1, column 4" (parseAll "[a]: 5")
  , expectErrorAt "a bare number is not a term"
      "line 1, column 1" (parseAll "5")
  , expectEq "bare cloud term"
      (Right (CloudExpr 0 : Nil)) (parseAll "|")
  , expectEq "empty input parses to no statements"
      (Right Nil) (parseAll "")
  -- Parser: positioned errors
  , expectErrorAt "cloud does not swallow a following identifier"
      "line 1, column 2" (parseAll "|a")
  , expectErrorAt "dangling arrow is an error"
      "line 1, column 2" (parseAll "a->")
  , expectErrorAt "faucet needs a name"
      "line 1, column 2" (parseAll "a=>")
  , expectErrorAt "unclosed stock is an error"
      "line 1, column 2" (parseAll "[a")
  , expectErrorAt "errors land on the right line"
      "line 2, column 2" (parseAll "a->b\nc->")
  , expectErrorAt "an unclosed loop is an error"
      "line 1, column 3" (parseAll "R(a")
  , expectErrorAt "an empty loop needs an expression"
      "line 1, column 3" (parseAll "R()")
  , expectErrorAt "loops are statements, not terms"
      "line 1, column 4" (parseAll "a->R(b)")
  , expectErrorAt "a loop closes its statement: no operator may follow"
      "line 1, column 5" (parseAll "R(a)->b")
  -- Evaluator: name identity
  , expectEq "repeating a name references one node"
      (Right 1) (nodeCount "a->a")
  , expectEq "a self-link points at the one node"
      (Right [ { type: "arrow", source: "dot#0", target: "dot#0" } ])
      (linksOf "a->a")
  , expectEq "the name registry spans statements"
      (Right 3) (nodeCount "a->b\nb->c")
  , expectEq "a dot mention resolves to the stock of the same name"
      (Right [ { type: "arrow", source: "stock#0", target: "dot#3" } ])
      (linksOf "[r]\nr->x")
  , expectEq "clouds never coalesce"
      (Right 2) (nodeCount "|->|")
  -- Evaluator: flow links
  , expectEq "rightward flow runs source -> faucet -> target"
      (Right [ { type: "flow", source: "stock#0", target: "faucet#1" }
             , { type: "flow", source: "faucet#1", target: "stock#2" } ])
      (linksOf "[a]=>f[b]")
  , expectEq "leftward flow reverses both links"
      (Right [ { type: "flow", source: "faucet#1", target: "stock#0" }
             , { type: "flow", source: "stock#2", target: "faucet#1" } ])
      (linksOf "[a]<=f[b]")
  , expectEq "a=>b->c hangs the arrow off the faucet, like (a=>b)->c"
      (Right [ { type: "flow", source: "dot#0", target: "faucet#1" }
             , { type: "arrow", source: "faucet#1", target: "dot#3" } ])
      (linksOf "a=>b->c")
  , expectEq "dangling faucets chain into a flow"
      (Right [ { type: "flow", source: "dot#0", target: "faucet#1" }
             , { type: "flow", source: "faucet#1", target: "faucet#2" } ])
      (linksOf "a=>f=>g")
  -- Evaluator: value annotations
  , expectEq "values land on the stock and the faucet"
      (Right [ Tuple "a" (Just 50.0), Tuple "f" (Just 5.0), Tuple "|" Nothing ])
      (labelValues "[a: 50]=>f: 5|")
  , expectEq "unannotated nodes have no value"
      (Right [ Tuple "a" Nothing, Tuple "f" Nothing ])
      (labelValues "[a]=>f")
  , expectEq "a later mention fills a blank value"
      (Right [ Tuple "a" (Just 5.0) ])
      (labelValues "[a]\n[a: 5]")
  , expectEq "the first explicit value wins"
      (Right [ Tuple "a" (Just 5.0) ])
      (labelValues "[a: 5]\n[a: 9]")
  , expectEq "via registry aliasing a stock-syntax value lands on the dot"
      (Right [ Tuple "a" (Just 5.0), Tuple "b" Nothing ])
      (labelValues "a->b\n[a: 5]")
  , expectEq "a dot constant lands on the dot"
      (Right [ Tuple "a" (Just 5.0), Tuple "b" Nothing ])
      (labelValues "a: 5\nb")
  , expectEq "the first dot constant wins"
      (Right [ Tuple "a" (Just 5.0) ])
      (labelValues "a: 5\na: 9")
  -- Evaluator: rate schedules
  , expectEq "schedule steps land on the faucet; the initial rate is its value"
      (Right [ Tuple "a" Nothing, Tuple "f" (Just [ { at: 5.0, value: 5.0 } ]) ])
      (labelSteps "a=>f: 0 @5: 5")
  , expectEq "a schedule's initial rate serializes as the plain value"
      (Right [ Tuple "a" Nothing, Tuple "f" (Just 0.0) ])
      (labelValues "a=>f: 0 @5: 5")
  , expectEq "a step-less annotation has no steps key"
      (Right [ Tuple "a" Nothing, Tuple "f" Nothing ])
      (labelSteps "a=>f: 5")
  , expectEq "the first annotation wins as a unit (value and steps together)"
      (Right [ Tuple "a" Nothing, Tuple "f" (Just [ { at: 2.0, value: 1.0 } ]) ])
      (labelSteps "a=>f: 0 @2: 1\na=>f: 9")
  , expectEq "a later schedule never overwrites an earlier plain rate"
      (Right [ Tuple "a" Nothing, Tuple "f" Nothing ])
      (labelSteps "a=>f: 9\na=>f: 0 @2: 1")
  -- Evaluator: band groups
  , expectEq "a flow band with a reservoir gets a group"
      (Right [ Tuple "a" (Just 0), Tuple "fill" (Just 0) ])
      (labelGroups "[a]=>fill")
  , expectEq "a reservoir-less flow floats (no group)"
      (Right [ Tuple "a" Nothing, Tuple "f" Nothing ])
      (labelGroups "a=>f")
  , expectEq "bands number by source order"
      (Right [ Tuple "a" (Just 0), Tuple "b" (Just 0), Tuple "c" (Just 1)
             , Tuple "d" (Just 1), Tuple "f" (Just 0), Tuple "g" (Just 1) ])
      (labelGroups "[a]=>f[b]\n[c]=>g[d]")
  -- Evaluator: loop annotations tag members, never add nodes or links
  , expectEq "a loop tags its members with a generated name"
      (Right [ Tuple "a" (Just [ "R0" ]), Tuple "b" (Just [ "R0" ]) ])
      (labelLoops "R(a->b)")
  , expectEq "a loop annotation leaves the links untouched"
      (Right [ { type: "arrow", source: "dot#1", target: "dot#3" } ])
      (linksOf "R(a->b)")
  , expectEq "overlapping loops stack names in statement order"
      (Right [ Tuple "a" (Just [ "R0" ]), Tuple "b" (Just [ "R0", "B1" ]), Tuple "c" (Just [ "B1" ]) ])
      (labelLoops "R(a->b)\nB(b->c)")
  , expectEq "loop members resolve through the registry (a stock, a faucet)"
      (Right [ Tuple "a" (Just [ "B0" ]), Tuple "f" (Just [ "B0" ]) ])
      (labelLoops "[a]=>f\nB(f<-a)")
  , expectEq "a loop adds no nodes, even across statements"
      (Right 2) (nodeCount "[a]=>f\nB(f<-a)")
  -- Combined graphs: multiple statements mixing arrows, flows, stocks,
  -- clouds, and parens
  , expectEq "arrow edges hanging off a flow band"
      (Right [ { type: "flow", source: "stock#0", target: "faucet#1" }
             , { type: "flow", source: "faucet#1", target: "stock#2" }
             , { type: "arrow", source: "stock#2", target: "dot#5" }
             , { type: "arrow", source: "dot#5", target: "stock#0" } ])
      (linksOf "[a]=>f[b]\nb->c\nc->[a]")
  , expectEq "arrows do not extend a band: the dot floats"
      (Right [ Tuple "a" (Just 0), Tuple "b" (Just 0), Tuple "c" Nothing, Tuple "f" (Just 0) ])
      (labelGroups "[a]=>f[b]\nb->c\nc->[a]")
  , expectEq "two flows sharing a stock merge into one band"
      (Right [ Tuple "a" (Just 0), Tuple "b" (Just 0), Tuple "c" (Just 0)
             , Tuple "f" (Just 0), Tuple "g" (Just 0) ])
      (labelGroups "[a]=>f[b]\n[b]=>g[c]")
  , expectEq "band numbering skips floating dots and follows source order"
      (Right [ Tuple "a" (Just 1), Tuple "c" (Just 0), Tuple "f" (Just 1)
             , Tuple "g" (Just 0), Tuple "x" Nothing, Tuple "y" Nothing ])
      (labelGroups "x->y\n[c]=>g\n[a]=>f")
  , expectEq "identical cloud sinks do not merge bands"
      (Right [ Tuple "a" Nothing, Tuple "b" Nothing, Tuple "f" (Just 0)
             , Tuple "g" (Just 1), Tuple "|" (Just 0), Tuple "|" (Just 1) ])
      (labelGroups "a=>f|\nb=>g|")
  -- Cross-statement identity: the first spelling of a name wins
  , expectEq "a later [a] reuses the node the dot minted"
      (Right [ { type: "arrow", source: "dot#0", target: "dot#2" }
             , { type: "flow", source: "dot#0", target: "faucet#4" } ])
      (linksOf "a->b\n[a]=>f")
  , expectEq "a dot-fed flow has no reservoir, so no band"
      (Right [ Tuple "a" Nothing, Tuple "b" Nothing, Tuple "f" Nothing ])
      (labelGroups "a->b\n[a]=>f")
  , expectEq "a faucet name resolves through the same registry as dots"
      (Right [ { type: "arrow", source: "dot#0", target: "dot#2" }
             , { type: "flow", source: "dot#3", target: "dot#0" } ])
      (linksOf "f->x\na=>f")
  -- Parenthesized flows composed with arrows
  , expectEq "an arrow between two parenthesized flows links their faucets"
      (Right [ { type: "flow", source: "stock#1", target: "faucet#2" }
             , { type: "arrow", source: "faucet#2", target: "stock#5" }
             , { type: "flow", source: "stock#5", target: "faucet#6" } ])
      (linksOf "([s]=>f)->([t]=>g)")
  , expectEq "arrow-linked bands stay distinct groups"
      (Right [ Tuple "f" (Just 0), Tuple "g" (Just 1), Tuple "s" (Just 0), Tuple "t" (Just 1) ])
      (labelGroups "([s]=>f)->([t]=>g)")
  -- A feedback loop over a cloud-to-cloud pipeline
  , expectEq "feedback loop links: pipeline flows then loop arrows"
      (Right [ { type: "flow", source: "cloud#0", target: "faucet#1" }
             , { type: "flow", source: "faucet#1", target: "stock#2" }
             , { type: "flow", source: "stock#2", target: "faucet#3" }
             , { type: "flow", source: "faucet#3", target: "cloud#4" }
             , { type: "arrow", source: "stock#2", target: "dot#7" }
             , { type: "arrow", source: "dot#7", target: "faucet#1" } ])
      (linksOf "|=>inflow[pop]=>outflow|\npop->growth->inflow")
  , expectEq "the pipeline is one band; the loop dot floats"
      (Right [ Tuple "growth" Nothing, Tuple "inflow" (Just 0), Tuple "outflow" (Just 0)
             , Tuple "pop" (Just 0), Tuple "|" (Just 0), Tuple "|" (Just 0) ])
      (labelGroups "|=>inflow[pop]=>outflow|\npop->growth->inflow")
  -- Mixed link directions
  , expectEq "chained <- links each hop from its nearest term, outermost first"
      (Right [ { type: "arrow", source: "dot#2", target: "dot#0" }
             , { type: "arrow", source: "dot#4", target: "dot#2" } ])
      (linksOf "a<-b<-c")
  , expectEq "a->b<-c fans in on b"
      (Right [ { type: "arrow", source: "dot#0", target: "dot#2" }
             , { type: "arrow", source: "dot#4", target: "dot#2" } ])
      (linksOf "a->b<-c")
  , expectEq "a<-b->c fans out from b"
      (Right [ { type: "arrow", source: "dot#2", target: "dot#0" }
             , { type: "arrow", source: "dot#2", target: "dot#4" } ])
      (linksOf "a<-b->c")
  , expectEq "chained leftward flows reverse the whole pipeline"
      (Right [ { type: "flow", source: "faucet#1", target: "stock#0" }
             , { type: "flow", source: "stock#2", target: "faucet#1" }
             , { type: "flow", source: "faucet#3", target: "stock#2" }
             , { type: "flow", source: "stock#4", target: "faucet#3" } ])
      (linksOf "[a]<=f[b]<=g[c]")
  -- Positioned errors deep in multi-statement programs
  , expectErrorAt "an error on a later statement is positioned there"
      "line 3, column 4" (parseAll "[a]=>f[b]\nb->c\nc->[")
  , expectErrorAt "a dangling arrow before a newline points at the newline"
      "line 2, column 4" (parseAll "[a]=>f[b]\nb->\nc")
  ]

main :: Effect Unit
main = do
  let failures = Array.catMaybes tests
  traverse_ (\f -> log ("✗ " <> f)) failures
  if Array.null failures
    then log ("All " <> show (Array.length tests) <> " tests passed.")
    else throw (show (Array.length failures) <> " of " <> show (Array.length tests) <> " tests failed.")
