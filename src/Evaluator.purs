module Evaluator 
  ( Graph
  , Node
  , NodeType(..)
  , Link
  , evaluate
  ) where

import Prelude
import Data.Array as Array
import Data.Foldable (traverse_, foldl, minimum, any)
import Data.Int as Int
import Data.List (List(..), (:))
import Data.List as List
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe)
import Data.Set (Set)
import Data.Set as Set
import Data.String (Pattern(..), split)
import Data.Tuple (Tuple(..), fst)
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

type Node = { type :: NodeType, id :: String, label :: String, group :: Maybe Int }
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
leftmostId (FaucetRExpr _ _ left _) = leftmostId left
leftmostId (FaucetLExpr _ _ left _) = leftmostId left
leftmostId (ArrowRExpr _ left _) = leftmostId left
leftmostId (ArrowLExpr _ left _) = leftmostId left
leftmostId (ParenExpr _ expr) = leftmostId expr

-- | Evaluate a subtree, registering nodes/links as a side effect, and
-- | return the id (never the label) of the node it resolves to.
evaluateNode :: Tree -> Evaluator String
evaluateNode (NodeExpr i s) = resolveNamed Dot i s
evaluateNode (StockExpr i s) = resolveNamed Stock i s
evaluateNode (CloudExpr i s) = freshAnon Cloud i s
evaluateNode (FaucetRExpr i name left right) = do
  l <- evaluateNode left
  fid <- resolveNamed Faucet i name
  addLink l fid "flow"
  case right of
    Nothing -> pure fid
    Just r -> do
      rid <- leftmostId r
      addLink fid rid "flow"
      evaluateNode r
-- | `<=` flows right-to-left: the right operand feeds the faucet, which pours
-- | into the left operand (mirrors how ArrowL swaps its endpoints).
evaluateNode (FaucetLExpr i name left right) = do
  l <- evaluateNode left
  fid <- resolveNamed Faucet i name
  addLink fid l "flow"
  case right of
    Nothing -> pure fid
    Just r -> do
      rid <- leftmostId r
      addLink rid fid "flow"
      evaluateNode r
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

-- | Undirected adjacency over a set of links (used for flow connectivity).
buildAdjacency :: Array Link -> Map.Map String (Set String)
buildAdjacency links = foldl step Map.empty links
  where
  step m l = addEdge l.source l.target (addEdge l.target l.source m)
  addEdge a b m = Map.insertWith Set.union a (Set.singleton b) m

-- | Every id reachable from `start` in the adjacency (DFS with a visited set).
reach :: Map.Map String (Set String) -> String -> Set String
reach adj start = go (start : Nil) Set.empty
  where
  go Nil seen = seen
  go (x : xs) seen
    | Set.member x seen = go xs seen
    | otherwise =
        let nbrs = fromMaybe Set.empty (Map.lookup x adj)
        in go (List.fromFoldable nbrs <> xs) (Set.insert x seen)

-- | Connected components of the adjacency, as node-id sets.
connectedComponents :: Map.Map String (Set String) -> Array (Set String)
connectedComponents adj = (foldl step { visited: Set.empty, comps: [] } nodeIds).comps
  where
  nodeIds = map fst (Map.toUnfoldable adj :: Array (Tuple String (Set String)))
  step acc n
    | Set.member n acc.visited = acc
    | otherwise =
        let c = reach adj n
        in { visited: Set.union acc.visited c, comps: Array.snoc acc.comps c }

-- | The integer the parser minted for an id (`stock#5` -> 5). Needed because
-- | ids sort lexicographically otherwise (`stock#10` < `stock#2`).
parserId :: String -> Int
parserId s = fromMaybe top (Array.last (split (Pattern "#") s) >>= Int.fromString)

-- | Assign each node its band group: connected components over flow links,
-- | keeping only components that contain a reservoir (a stock or cloud). A
-- | group's members are its non-dot nodes; dots and reservoir-less faucets get
-- | no group and float. Groups are numbered by source order (min parser id).
computeGroups :: EvalState -> Map.Map String Int
computeGroups st =
  let flowLinks = Array.filter (\l -> l.type == "flow") st.links
      adjacency = buildAdjacency flowLinks
      tyOf id = map _.ty (Map.lookup id st.nodes)
      isDot id = tyOf id == Just Dot
      isReservoir id = tyOf id == Just Stock || tyOf id == Just Cloud
      members c = Array.fromFoldable c
      nonDot c = Array.filter (not <<< isDot) (members c)
      hasReservoir c = any isReservoir (members c)
      kept = Array.filter hasReservoir (connectedComponents adjacency)
      keyOf c = fromMaybe top (minimum (map parserId (nonDot c)))
      sorted = Array.sortWith keyOf kept
      assign m (Tuple idx c) = foldl (\mm id -> Map.insert id idx mm) m (nonDot c)
  in foldl assign Map.empty (Array.mapWithIndex Tuple sorted)

-- | Evaluate every statement against one shared state, so nodes named in
-- | different statements resolve (via the registry) to a single graph node.
evaluate :: List Tree -> Graph
evaluate trees =
  let initialState = { registry: Map.empty, nodes: Map.empty, links: [] }
      Tuple _ finalState = runState (traverse_ evaluateNode trees) initialState
      nodeArray = (Map.toUnfoldable finalState.nodes :: Array (Tuple String { ty :: NodeType, label :: String }))
      groupOf = computeGroups finalState
      nodes = map (\(Tuple id v) -> { type: v.ty, id, label: v.label, group: Map.lookup id groupOf }) nodeArray
  in { nodes, links: finalState.links }

