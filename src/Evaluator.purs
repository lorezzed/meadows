module Evaluator 
  ( Graph
  , Node
  , NodeType(..)
  , Link
  , RFormula(..)
  , evaluate
  ) where

import Prelude
import Data.Array as Array
import Data.Either (Either(..))
import Data.Foldable (traverse_, foldl, minimum, any)
import Data.Int as Int
import Data.List (List(..), (:))
import Data.List as List
import Data.Map as Map
import Data.Maybe (Maybe(..), fromMaybe, isJust, maybe)
import Data.Set (Set)
import Data.Set as Set
import Data.String (Pattern(..), split)
import Data.Tuple (Tuple(..), fst)
import Control.Alt ((<|>))
import Control.Monad.State (State, runState, gets, modify_)
import Lexer (loopLetter)
import Parser (Annot(..), Formula(..), Tree(..), Id, Sched, Step, opString)
import Simple.JSON (class WriteForeign, writeImpl)

data NodeType = Dot | Stock | Faucet | Cloud | Port
derive instance eqNodeType :: Eq NodeType
instance showNodeType :: Show NodeType where
  show Dot = "dot"
  show Stock = "stock"
  show Faucet = "faucet"
  show Cloud = "cloud"
  show Port = "port"
instance writeForeignNodeType :: WriteForeign NodeType where
  writeImpl = writeImpl <<< show

-- | A formula with its references resolved to node ids (identity, not
-- | spelling -- the same seam rule as links). Serializes as nested objects:
-- | {kind: "num", value}, {kind: "ref", id}, {kind: "+"|"-"|"*"|"/", left,
-- | right}, {kind: "delay", input, time} -- directly evaluable by the
-- | simulator with no re-parsing.
data RFormula = RNum Number | RRef String | RBin String RFormula RFormula | RCall RFormula RFormula
derive instance eqRFormula :: Eq RFormula
instance showRFormula :: Show RFormula where
  show (RNum n) = "RNum " <> show n
  show (RRef id) = "RRef " <> id
  show (RBin op l r) = "(" <> show l <> " " <> op <> " " <> show r <> ")"
  show (RCall input time) = show input <> "(t - " <> show time <> ")"
instance writeForeignRFormula :: WriteForeign RFormula where
  writeImpl (RNum n) = writeImpl { kind: "num", value: n }
  writeImpl (RRef id) = writeImpl { kind: "ref", id }
  writeImpl (RBin op l r) = writeImpl { kind: op, left: l, right: r }
  writeImpl (RCall input time) = writeImpl { kind: "delay", input, time }

-- | The ids a formula references, in reference order, deduplicated. Time
-- | shifts count both sides: `orders(t - delivery delay)` implies arrows
-- | from the delayed flow and the delay constant (figure 31 draws both).
refIds :: RFormula -> Array String
refIds (RNum _) = []
refIds (RRef id) = [ id ]
refIds (RBin _ l r) = Array.nub (refIds l <> refIds r)
refIds (RCall input time) = Array.nub (refIds input <> refIds time)

-- | The ids whose CURRENT value a formula reads when evaluated -- the edges
-- | that matter for cycle detection. A time shift reads its own state (the
-- | delay buffer), never its input's current value, so shifts break
-- | dependency cycles: `deliveries: (orders to factory(t - ...))` may sit
-- | on a loop that winds back to deliveries.
eagerRefIds :: RFormula -> Array String
eagerRefIds (RNum _) = []
eagerRefIds (RRef id) = [ id ]
eagerRefIds (RBin _ l r) = Array.nub (eagerRefIds l <> eagerRefIds r)
eagerRefIds (RCall _ _) = []

type NodeRec = { ty :: NodeType, label :: String, value :: Maybe Number, steps :: Maybe (Array Step), expr :: Maybe RFormula, parent :: Maybe String }

type Node = { type :: NodeType, id :: String, label :: String, value :: Maybe Number, steps :: Maybe (Array Step), expr :: Maybe RFormula, parent :: Maybe String, group :: Maybe Int, loop :: Maybe (Array String) }
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
  , nodes :: Map.Map String NodeRec
  , links :: Array Link
  , loopTags :: Map.Map String (Array String)
  , loopCount :: Int
  -- numbers the ports (boundary dots on stocks) in draw order, the way
  -- loopCount numbers the loop annotations
  , portCount :: Int
  -- first model-level error (bad formula reference); checked at the end
  , err :: Maybe String
  }

type Evaluator = State EvalState

prefixFor :: NodeType -> String
prefixFor Dot = "dot#"
prefixFor Stock = "stock#"
prefixFor Faucet = "faucet#"
prefixFor Cloud = "cloud#"
prefixFor Port = "port#"

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
        , nodes = Map.insert newId { ty, label: name, value: Nothing, steps: Nothing, expr: Nothing, parent: Nothing } s.nodes
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
  modify_ \s -> s { nodes = Map.insert newId { ty, label, value: Nothing, steps: Nothing, expr: Nothing, parent: Nothing } s.nodes }
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

-- | Attach a schedule (a faucet's rate, a dot's constant or driving curve).
-- | Same first-wins spirit, but as a unit: the first mention carrying any
-- | annotation fixes the initial (`value`) and the steps together; later
-- | annotations never overwrite either. An empty steps list serializes as
-- | no `steps` key at all.
setSched :: String -> Sched -> Evaluator Unit
setSched id sch = modify_ \s ->
  s { nodes = Map.update upd id s.nodes }
  where
  upd rec = Just $ if annotated rec then rec else rec
    { value = Just sch.initial
    , steps = if Array.null sch.steps then Nothing else Just sch.steps
    }

-- | Already carrying an annotation? (a plain/scheduled value or a formula
-- | -- either blocks later annotations, as a unit)
annotated :: NodeRec -> Boolean
annotated rec = isJust rec.value || isJust rec.expr

-- | Record the first model-level error; later ones keep the first.
setErr :: String -> Evaluator Unit
setErr msg = modify_ \s -> s { err = s.err <|> Just msg }

-- | The identity a link endpoint stands for: a port stands for its parent
-- | stock, everything else for itself. Arrow deduplication compares these,
-- | so port-attached arrows still count as stock-to-X arrows.
logicalEnd :: EvalState -> String -> String
logicalEnd s id = fromMaybe id (Map.lookup id s.nodes >>= _.parent)

-- | Info arrows never touch a stock directly: each arrow end landing on one
-- | gets its own PORT -- an anonymous boundary dot carrying `parent` (the
-- | stock's id), numbered in draw order like the loop annotations. Non-stock
-- | endpoints pass through unchanged.
portFor :: String -> Evaluator String
portFor id = do
  tyM <- gets \s -> map _.ty (Map.lookup id s.nodes)
  case tyM of
    Just Stock -> do
      n <- gets _.portCount
      let pid = prefixFor Port <> show n
      modify_ \s -> s
        { portCount = n + 1
        , nodes = Map.insert pid { ty: Port, label: "", value: Nothing, steps: Nothing, expr: Nothing, parent: Just id } s.nodes
        }
      pure pid
    _ -> pure id

-- | An info arrow between two resolved endpoints, unless one between the
-- | same logical endpoints is already drawn -- formulas re-imply arrows a
-- | hand-written statement (or an earlier formula) may already have drawn,
-- | and a repeated statement redraws its own. Stock ends attach through a
-- | freshly minted port each (so the dedup check runs first: a duplicate
-- | must not mint a second port).
drawArrow :: String -> String -> Evaluator Unit
drawArrow source target = do
  dup <- gets \s -> Array.any
    (\l -> l.type == "arrow" && logicalEnd s l.source == source && logicalEnd s l.target == target)
    s.links
  if dup then pure unit
  else do
    src <- portFor source
    tgt <- portFor target
    addLink src tgt "arrow"

-- | Resolve a formula's references through the registry (minting dots for
-- | unseen names, exactly like a bare mention). A reference must land on a
-- | stock or a dot -- a faucet has no value to read (v1) -- EXCEPT as a
-- | time shift's input, where a faucet reference reads the flow's rate:
-- | that is how `orders(t - ...)` reads a delayed flow. The flag rides
-- | down through arithmetic; a shift's time resets it (a delay time is a
-- | value, not a flow).
resolveFormula :: Boolean -> Formula -> Evaluator RFormula
resolveFormula _ (FNum n) = pure (RNum n)
resolveFormula inShift (FBin op l r) = RBin (opString op) <$> resolveFormula inShift l <*> resolveFormula inShift r
resolveFormula _ (FCall input time) =
  RCall <$> resolveFormula true input <*> resolveFormula false time
resolveFormula inShift (FRef i name) = do
  id <- resolveNamed Dot i name
  tyM <- gets \s -> map _.ty (Map.lookup id s.nodes)
  case tyM of
    Just Faucet | not inShift ->
      setErr ("a formula may only reference stocks and dots; '" <> name <> "' is a faucet (a time shift like " <> name <> "(t - T) may read one)")
    _ -> pure unit
  pure (RRef id)

-- | Attach a formula annotation: resolve its references, store the resolved
-- | tree, and draw the info arrows the equation implies (each referenced
-- | node -> this one), deduplicated against arrows already present. First
-- | annotation wins as a unit: a losing formula is ignored entirely (no
-- | refs minted, no arrows).
setFormula :: String -> Formula -> Evaluator Unit
setFormula id f = do
  already <- gets \s -> maybe false annotated (Map.lookup id s.nodes)
  if already then pure unit
  else do
    rf <- resolveFormula false f
    modify_ \s -> s { nodes = Map.update (\rec -> Just rec { expr = Just rf }) id s.nodes }
    traverse_ (\src -> drawArrow src id) (refIds rf)

-- | Dispatch an annotation to its setter.
setAnnot :: String -> Maybe Annot -> Evaluator Unit
setAnnot _ Nothing = pure unit
setAnnot id (Just (SchedAnnot sch)) = setSched id sch
setAnnot id (Just (FormulaAnnot f)) = setFormula id f

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
  setAnnot did v
  pure did
evaluateNode (StockExpr i s v) = do
  sid <- resolveNamed Stock i s
  setValue sid v
  pure sid
evaluateNode (CloudExpr i) = freshAnon Cloud i cloudLabel
evaluateNode (FaucetRExpr i name v left right) = do
  l <- evaluateNode left
  fid <- resolveNamed Faucet i name
  setAnnot fid v
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
  setAnnot fid v
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
  drawArrow l rid
  evaluateNode right
-- | `<-` mirrors ArrowR: the link comes from the *nearest* term of the right
-- | subtree (its leftmost leaf), not the chain's far end, so `a<-b->c` fans
-- | out from b (b->a and b->c) -- exactly how FaucetLExpr picks its source.
evaluateNode (ArrowLExpr _ left right) = do
  l <- evaluateNode left
  rid <- leftmostId right
  drawArrow rid l
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

-- | Formulas may chain through other computed dots, but a cycle
-- | (`a: (b + 1)` with `b: (a + 1)`) has no evaluation order -- reject the
-- | model. Stocks break chains (their levels are integrated state, not
-- | formulas), so only expr-to-expr references count as edges -- and only
-- | EAGER ones: a time shift reads history, not current values, so a loop
-- | closed through one is legal (eagerRefIds skips shift bodies).
formulaCycleError :: Map.Map String NodeRec -> Maybe String
formulaCycleError nodes =
  let hasExpr id = maybe false (isJust <<< _.expr) (Map.lookup id nodes)
      succs id = case Map.lookup id nodes of
        Just { expr: Just rf } -> Array.filter hasExpr (eagerRefIds rf)
        _ -> []
      cyclic start =
        let go frontier seen = case Array.uncons frontier of
              Nothing -> false
              Just { head, tail }
                | head == start -> true
                | Set.member head seen -> go tail seen
                | otherwise -> go (tail <> succs head) (Set.insert head seen)
        in go (succs start) Set.empty
      ids = map fst (Map.toUnfoldable nodes :: Array (Tuple String NodeRec))
      labelOf id = maybe id _.label (Map.lookup id nodes)
  in case Array.head (Array.filter cyclic (Array.filter hasExpr ids)) of
       Nothing -> Nothing
       Just id -> Just ("formula cycle through '" <> labelOf id <> "' -- a computed value cannot depend on itself")

-- | Evaluate every statement against one shared state, so nodes named in
-- | different statements resolve (via the registry) to a single graph node.
-- | Left = a model-level error (a formula referencing a faucet, or a
-- | formula cycle); the stage errors ("Tokenization"/"Parsing"/"Model")
-- | are prefixed by Main.go.
evaluate :: List Tree -> Either String Graph
evaluate trees =
  let initialState = { registry: Map.empty, nodes: Map.empty, links: [], loopTags: Map.empty, loopCount: 0, portCount: 0, err: Nothing }
      Tuple _ finalState = runState (traverse_ evaluateNode trees) initialState
      nodeArray = (Map.toUnfoldable finalState.nodes :: Array (Tuple String NodeRec))
      groupOf = computeGroups finalState
      nodes = map (\(Tuple id v) -> { type: v.ty, id, label: v.label, value: v.value, steps: v.steps, expr: v.expr, parent: v.parent, group: Map.lookup id groupOf, loop: Map.lookup id finalState.loopTags }) nodeArray
  in case finalState.err <|> formulaCycleError finalState.nodes of
       Just msg -> Left msg
       Nothing -> Right { nodes, links: finalState.links }

