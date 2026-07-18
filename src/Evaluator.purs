module Evaluator 
  ( Graph
  , Node
  , NodeType(..)
  , Link
  , evaluate
  , runEvaluator
  ) where

import Prelude
import Data.Array as Array
import Data.Map as Map
import Data.Maybe (Maybe(..))
import Data.Tuple (Tuple(..))
import Control.Monad.State (State, runState, gets, modify_)
import Parser (Tree(..), Id)
import Simple.JSON (class WriteForeign, writeImpl)

data NodeType = Dot | Stock | Faucet | Cloud
derive instance eqNodeType :: Eq NodeType
instance showNodeType :: Show NodeType where
  show Dot = "dot"
  show Stock = "stock"
  show Faucet = "faucet"
  show Cloud = "cloud"
instance writeForeignNodeType :: WriteForeign NodeType where
  writeImpl = writeImpl <<< show

type Node = { type :: NodeType, id :: String, label :: String }
type Link = { type :: String, source :: String, target :: String }
type Graph = { nodes :: Array Node, links :: Array Link }

-- | `registry` maps a *name* to the id assigned the first time that name
-- | was seen. This is what makes repeated mentions of the same named node
-- | (e.g. two occurrences of `a`) resolve to one graph node. Ids themselves
-- | are opaque, built from the parser's per-node counter -- never the raw
-- | source text -- so links reference identity, not spelling.
type EvalState =
  { registry :: Map.Map String String
  , nodes :: Map.Map String { ty :: NodeType, label :: String }
  , links :: Array Link
  }

type Evaluator = State EvalState

prefixFor :: NodeType -> String
prefixFor Dot = "dot#"
prefixFor Stock = "stock#"
prefixFor Faucet = "faucet#"
prefixFor Cloud = "cloud#"

addLink :: String -> String -> String -> Evaluator Unit
addLink source target linkType = modify_ \s ->
  s { links = Array.snoc s.links { source, target, type: linkType } }

-- | Named nodes: reuse the id from the registry if this name has been
-- | seen before, otherwise mint one from this occurrence's parser Id.
resolveNamed :: NodeType -> Id -> String -> Evaluator String
resolveNamed ty i name = do
  reg <- gets _.registry
  case Map.lookup name reg of
    Just existingId -> pure existingId
    Nothing -> do
      let newId = prefixFor ty <> show i
      modify_ \s -> s
        { registry = Map.insert name newId s.registry
        , nodes = Map.insert newId { ty, label: name } s.nodes
        }
      pure newId

-- | Anonymous nodes (clouds): always mint a fresh id, never touch the
-- | registry, so repeated occurrences never collapse into one node.
freshAnon :: NodeType -> Id -> String -> Evaluator String
freshAnon ty i label = do
  let newId = prefixFor ty <> show i
  modify_ \s -> s { nodes = Map.insert newId { ty, label } s.nodes }
  pure newId

-- | Resolve (registering as needed) the id of the leftmost leaf of a
-- | subtree, without walking the rest of the subtree's internal links.
leftmostId :: Tree -> Evaluator String
leftmostId (NodeExpr i s) = resolveNamed Dot i s
leftmostId (StockExpr i s) = resolveNamed Stock i s
leftmostId (CloudExpr i s) = freshAnon Cloud i s
leftmostId (FaucetExpr _ _ left _) = leftmostId left
leftmostId (ArrowRExpr _ left _) = leftmostId left
leftmostId (ArrowLExpr _ left _) = leftmostId left
leftmostId (ParenExpr _ expr) = leftmostId expr

-- | Evaluate a subtree, registering nodes/links as a side effect, and
-- | return the id (never the label) of the node it resolves to.
evaluateNode :: Tree -> Evaluator String
evaluateNode (NodeExpr i s) = resolveNamed Dot i s
evaluateNode (StockExpr i s) = resolveNamed Stock i s
evaluateNode (CloudExpr i s) = freshAnon Cloud i s
evaluateNode (FaucetExpr i name left right) = do
  l <- evaluateNode left
  fid <- resolveNamed Faucet i name
  addLink l fid "arrow"
  rid <- leftmostId right
  addLink fid rid "arrow"
  evaluateNode right
evaluateNode (ArrowRExpr _ left right) = do
  l <- evaluateNode left
  rid <- leftmostId right
  addLink l rid "arrow"
  evaluateNode right
evaluateNode (ArrowLExpr _ left right) = do
  l <- evaluateNode left
  r <- evaluateNode right
  addLink r l "arrow"
  pure l
evaluateNode (ParenExpr _ expr) = evaluateNode expr

evaluate :: Tree -> Graph
evaluate tree =
  let initialState = { registry: Map.empty, nodes: Map.empty, links: [] }
      Tuple _ finalState = runState (evaluateNode tree) initialState
      nodeArray = (Map.toUnfoldable finalState.nodes :: Array (Tuple String { ty :: NodeType, label :: String }))
      nodes = map (\(Tuple id v) -> { type: v.ty, id, label: v.label }) nodeArray
  in { nodes, links: finalState.links }

runEvaluator :: Tree -> Tuple String Graph
runEvaluator tree =
  let initialState = { registry: Map.empty, nodes: Map.empty, links: [] }
      Tuple result finalState = runState (evaluateNode tree) initialState
      nodeArray = (Map.toUnfoldable finalState.nodes :: Array (Tuple String { ty :: NodeType, label :: String }))
      nodes = map (\(Tuple id v) -> { type: v.ty, id, label: v.label }) nodeArray
      graph = { nodes, links: finalState.links }
  in Tuple result graph

