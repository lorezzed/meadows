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
import Data.Maybe (Maybe(..), fromMaybe, maybe)
import Data.Set (Set)
import Data.Set as Set
import Data.String (Pattern(..), split)
import Data.Tuple (Tuple(..), fst)
import Control.Alt ((<|>))
import Control.Monad.State (State, runState, gets, modify_)
import Lexer (loopLetter)
import Parser (Tree(..), Id, Sched, Step)
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

type Node = { type :: NodeType, id :: String, label :: String, value :: Maybe Number, steps :: Maybe (Array Step), group :: Maybe Int, loop :: Maybe (Array String) }
type Link = { type :: String, source :: String, target :: String }
type Graph = { nodes :: Array Node, links :: Array Link }

-- | `registry` maps a *name* to the id assigned the first time that name
-- | was seen. This is what makes repeated mentions of the same named node
-- | (e.g. two occurrences of `a`) resolve to one graph node. Ids themselves
-- | are opaque, built from the parser's per-node counter -- never the raw
-- | source text -- so links reference identity, not spelling.
-- |
-- | `loopTags` collects each node's loop memberships (node id -> loop names,
-- | in annotation order); `loopCount` numbers the annotations by source order
-- | (statements evaluate in order), the way band groups are numbered.
type EvalState =
  { registry :: Map.Map String String
  , nodes :: Map.Map String { ty :: NodeType, label :: String, value :: Maybe Number, steps :: Maybe (Array Step) }
  , links :: Array Link
  , loopTags :: Map.Map String (Array String)
  , loopCount :: Int
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
        , nodes = Map.insert newId { ty, label: name, value: Nothing, steps: Nothing } s.nodes
        }
      pure newId

-- | Clouds are anonymous, so the evaluator picks their display label.
cloudLabel :: String
cloudLabel = "|"

-- | Anonymous nodes (clouds): always mint a fresh id, never touch the
-- | registry, so repeated occurrences never collapse into one node.
freshAnon :: NodeType -> Id -> String -> Evaluator String
freshAnon ty i label = do
  let newId = prefixFor ty <> show i
  modify_ \s -> s { nodes = Map.insert newId { ty, label, value: Nothing, steps: Nothing } s.nodes }
  pure newId

-- | Attach a value annotation (a stock's initial level, a faucet's rate, a
-- | dot's auxiliary constant) to
-- | an already-resolved node. First explicit value wins: a valueless mention
-- | is a no-op, and later values never overwrite an existing one (`<|>`
-- | keeps the first Just) -- mirroring the registry's first-mention-wins
-- | identity rule while still letting `[a] ... [a: 5]` fill the blank in.
setValue :: String -> Maybe Number -> Evaluator Unit
setValue _ Nothing = pure unit
setValue id mval = modify_ \s ->
  s { nodes = Map.update (\rec -> Just rec { value = rec.value <|> mval }) id s.nodes }

-- | Attach a faucet's rate schedule. Same first-wins spirit, but as a unit:
-- | the first mention carrying any annotation fixes both the initial rate
-- | (`value`) and the `@time: rate` steps; later annotations never overwrite
-- | either, and an empty steps list serializes as no `steps` key at all.
setSched :: String -> Maybe Sched -> Evaluator Unit
setSched _ Nothing = pure unit
setSched id (Just sch) = modify_ \s ->
  s { nodes = Map.update upd id s.nodes }
  where
  upd rec = Just $ case rec.value of
    Just _ -> rec
    Nothing -> rec
      { value = Just sch.initial
      , steps = if Array.null sch.steps then Nothing else Just sch.steps
      }

-- | Resolve (registering as needed) the id of the leftmost leaf of a
-- | subtree, without walking the rest of the subtree's internal links.
leftmostId :: Tree -> Evaluator String
leftmostId (NodeExpr i s _) = resolveNamed Dot i s
leftmostId (StockExpr i s _) = resolveNamed Stock i s
leftmostId (CloudExpr i) = freshAnon Cloud i cloudLabel
leftmostId (FaucetRExpr _ _ _ left _) = leftmostId left
leftmostId (FaucetLExpr _ _ _ left _) = leftmostId left
leftmostId (ArrowRExpr _ left _) = leftmostId left
leftmostId (ArrowLExpr _ left _) = leftmostId left
leftmostId (ParenExpr _ expr) = leftmostId expr
leftmostId (LoopExpr _ _ expr) = leftmostId expr

-- | Evaluate a subtree, registering nodes/links as a side effect, and
-- | return the id (never the label) of the node it resolves to.
evaluateNode :: Tree -> Evaluator String
evaluateNode (NodeExpr i s v) = do
  did <- resolveNamed Dot i s
  setValue did v
  pure did
evaluateNode (StockExpr i s v) = do
  sid <- resolveNamed Stock i s
  setValue sid v
  pure sid
evaluateNode (CloudExpr i) = freshAnon Cloud i cloudLabel
evaluateNode (FaucetRExpr i name v left right) = do
  l <- evaluateNode left
  fid <- resolveNamed Faucet i name
  setSched fid v
  addLink l fid "flow"
  case right of
    Nothing -> pure fid
    Just r -> do
      rid <- leftmostId r
      addLink fid rid "flow"
      evaluateNode r
-- | `<=` flows right-to-left: the right operand feeds the faucet, which pours
-- | into the left operand (mirrors how ArrowL swaps its endpoints).
evaluateNode (FaucetLExpr i name v left right) = do
  l <- evaluateNode left
  fid <- resolveNamed Faucet i name
  setSched fid v
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
-- | `<-` mirrors ArrowR: the link comes from the *nearest* term of the right
-- | subtree (its leftmost leaf), not the chain's far end, so `a<-b->c` fans
-- | out from b (b->a and b->c) -- exactly how FaucetLExpr picks its source.
evaluateNode (ArrowLExpr _ left right) = do
  l <- evaluateNode left
  rid <- leftmostId right
  addLink rid l "arrow"
  _ <- evaluateNode right
  pure l
evaluateNode (ParenExpr _ expr) = evaluateNode expr
-- | A loop annotation is transparent to evaluation: the inner expression
-- | emits its nodes and links as if unwrapped; afterwards every node it
-- | mentions is tagged with the loop's generated name ("R0", "B1", ... --
-- | the kind's letter plus one source-order counter across the program).
evaluateNode (LoopExpr _ kind inner) = do
  rid <- evaluateNode inner
  members <- Array.nub <$> memberIds inner
  n <- gets _.loopCount
  let name = loopLetter kind <> show n
  modify_ \s -> s
    { loopCount = n + 1
    , loopTags = foldl (addLoopTag name) s.loopTags members
    }
  pure rid

-- | Append a loop name to a node's tag list (creating the list on first tag).
addLoopTag :: String -> Map.Map String (Array String) -> String -> Map.Map String (Array String)
addLoopTag name m id = Map.alter (Just <<< maybe [ name ] (_ <> [ name ])) id m

-- | Source-order ids of every node a subtree mentions. Runs *after* the
-- | subtree has been evaluated, so every name is registered and
-- | resolveNamed/freshAnon are idempotent lookups (registry hit; a cloud
-- | re-inserts under its existing parser-id key, a no-op).
memberIds :: Tree -> Evaluator (Array String)
memberIds (NodeExpr i s _) = Array.singleton <$> resolveNamed Dot i s
memberIds (StockExpr i s _) = Array.singleton <$> resolveNamed Stock i s
memberIds (CloudExpr i) = Array.singleton <$> freshAnon Cloud i cloudLabel
memberIds (FaucetRExpr i name _ left right) = faucetMembers i name left right
memberIds (FaucetLExpr i name _ left right) = faucetMembers i name left right
memberIds (ArrowRExpr _ left right) = append <$> memberIds left <*> memberIds right
memberIds (ArrowLExpr _ left right) = append <$> memberIds left <*> memberIds right
memberIds (ParenExpr _ expr) = memberIds expr
memberIds (LoopExpr _ _ expr) = memberIds expr

-- | Shared by both faucet directions: left operand, the faucet itself, then
-- | the optional target -- source order.
faucetMembers :: Id -> String -> Tree -> Maybe Tree -> Evaluator (Array String)
faucetMembers i name left right = do
  ls <- memberIds left
  fid <- resolveNamed Faucet i name
  rs <- maybe (pure []) memberIds right
  pure (ls <> [ fid ] <> rs)

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
  let initialState = { registry: Map.empty, nodes: Map.empty, links: [], loopTags: Map.empty, loopCount: 0 }
      Tuple _ finalState = runState (traverse_ evaluateNode trees) initialState
      nodeArray = (Map.toUnfoldable finalState.nodes :: Array (Tuple String { ty :: NodeType, label :: String, value :: Maybe Number, steps :: Maybe (Array Step) }))
      groupOf = computeGroups finalState
      nodes = map (\(Tuple id v) -> { type: v.ty, id, label: v.label, value: v.value, steps: v.steps, group: Map.lookup id groupOf, loop: Map.lookup id finalState.loopTags }) nodeArray
  in { nodes, links: finalState.links }

