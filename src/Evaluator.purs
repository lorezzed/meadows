module Evaluator
  ( Graph
  , Node
  , NodeType(..)
  , Link
  , RFormula
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
import Expr (Expr(..), Ref(..), children, refsWhere, traverseRefs)
import Lexer (loopLetter)
import Parser (Annot(..), Dir(..), Formula, Tree(..), Id, Sched, Step)
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
-- | spelling -- the same seam rule as links). The shape, and the JSON the
-- | simulator evaluates, live in `Expr`: this is that shape with node ids in
-- | its reference slots, the parser's `Formula` being the same tree with
-- | unresolved mentions in them.
type RFormula = Expr String

-- | The ids a formula references, in reference order, deduplicated. Time
-- | shifts count both sides: `orders(t - delivery delay)` implies arrows
-- | from the delayed flow and the delay constant (figure 31 draws both).
-- | Function arguments count too: `cos(x)` implies an arrow from x.
refIds :: RFormula -> Array String
refIds = refsWhere children

-- | The ids whose CURRENT value a formula reads when evaluated -- the edges
-- | that matter for cycle detection. A time shift reads its own state (the
-- | delay buffer), never its input's current value, so shifts break
-- | dependency cycles: `deliveries: (orders to factory(t - ...))` may sit
-- | on a loop that winds back to deliveries. Function arguments are eager
-- | (a `min` reads both sides right now), so refusing to descend into a
-- | shift is the WHOLE difference between this walk and `refIds`.
eagerRefIds :: RFormula -> Array String
eagerRefIds = refsWhere case _ of
  EShift _ _ -> []
  e -> children e

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

flowLink :: String -> String -> Evaluator Unit
flowLink source target = addLink source target "flow"

-- | Emit something between two endpoints the way the operator points:
-- | `->`/`=>` left-to-right, `<-`/`<=` swapped. Every directional emission
-- | goes through here, so the swap lives in one place for both link kinds.
directed :: (String -> String -> Evaluator Unit) -> Dir -> String -> String -> Evaluator Unit
directed emit Rightward a b = emit a b
directed emit Leftward a b = emit b a

-- | A node with nothing attached yet -- every node is born here and is filled
-- | in afterwards by the annotation setters (a port stamps its `parent` on
-- | top). The one place the empty record is spelled out.
blank :: NodeType -> String -> NodeRec
blank ty label = { ty, label, value: Nothing, steps: Nothing, expr: Nothing, parent: Nothing }

-- | The two node-table primitives: every creation and every mutation goes
-- | through one of these, so `nodes` is written in exactly two places and the
-- | record-update noise stays out of the rules above them.
putNode :: String -> NodeRec -> Evaluator Unit
putNode id rec = modify_ \s -> s { nodes = Map.insert id rec s.nodes }

updateNode :: String -> (NodeRec -> NodeRec) -> Evaluator Unit
updateNode id f = modify_ \s -> s { nodes = Map.update (Just <<< f) id s.nodes }

-- | Named nodes: reuse the id from the registry if this name has been
-- | seen before, otherwise mint one from this occurrence's parser Id.
resolveNamed :: NodeType -> Id -> String -> Evaluator String
resolveNamed ty i name = do
  reg <- gets _.registry
  case Map.lookup name reg of
    Just existingId -> pure existingId
    Nothing -> do
      let newId = prefixFor ty <> show i
      modify_ \s -> s { registry = Map.insert name newId s.registry }
      putNode newId (blank ty name)
      pure newId

-- | Clouds are anonymous, so the evaluator picks their display label.
cloudLabel :: String
cloudLabel = "|"

-- | Anonymous nodes (clouds): always mint a fresh id, never touch the
-- | registry, so repeated occurrences never collapse into one node.
freshAnon :: NodeType -> Id -> String -> Evaluator String
freshAnon ty i label = do
  let newId = prefixFor ty <> show i
  putNode newId (blank ty label)
  pure newId

-- | Attach a stock's initial level to an already-resolved node -- through the
-- | same first-wins guard as every other annotation, so a valueless mention is
-- | a no-op, `[a] ... [a: 5]` still fills the blank in, and a name that was
-- | given a formula first (`b: (a)` then `[b: 5]`) keeps it instead of
-- | acquiring a second, contradictory reading.
setValue :: String -> Maybe Number -> Evaluator Unit
setValue _ Nothing = pure unit
setValue id mval = annotate id _ { value = mval }

-- | Attach a schedule (a faucet's rate, a dot's constant or driving curve).
-- | The initial (`value`) and the steps land together, under the one
-- | first-wins rule below. An empty steps list serializes as no `steps` key
-- | at all.
setSched :: String -> Sched -> Evaluator Unit
setSched id sch = annotate id \rec -> rec
  { value = Just sch.initial
  , steps = if Array.null sch.steps then Nothing else Just sch.steps
  }

-- | The annotation rule, in one place: the FIRST explicit annotation wins, as
-- | a UNIT -- a value-less mention never erases, and a later annotation (of
-- | any kind: value, schedule, or formula) never overwrites one already
-- | there. `setFormula` consults the same predicate one step earlier, before
-- | resolving its references, so a losing formula mints nothing.
annotate :: String -> (NodeRec -> NodeRec) -> Evaluator Unit
annotate id f = updateNode id \rec -> if annotated rec then rec else f rec

-- | Already carrying an annotation? (a plain/scheduled value or a formula
-- | -- either blocks later annotations, as a unit)
annotated :: NodeRec -> Boolean
annotated rec = isJust rec.value || isJust rec.expr

isAnnotated :: String -> Evaluator Boolean
isAnnotated id = gets \s -> maybe false annotated (Map.lookup id s.nodes)

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
      modify_ \s -> s { portCount = n + 1 }
      putNode pid ((blank Port "") { parent = Just id })
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
-- | unseen names, exactly like a bare mention) -- the whole walk is `Expr`'s,
-- | so this says only what a single reference MEANS. A reference must land on
-- | a stock or a dot -- a faucet has no value to read (v1) -- EXCEPT as a
-- | time shift's input, where a faucet reference reads the flow's rate: that
-- | is how `orders(t - ...)` reads a delayed flow (`traverseRefs` carries the
-- | in-a-shift flag down for us, resetting it for a shift's time, which is a
-- | value and not a flow).
resolveFormula :: Formula -> Evaluator RFormula
resolveFormula = traverseRefs \inShift (Ref i name) -> do
  id <- resolveNamed Dot i name
  tyM <- gets \s -> map _.ty (Map.lookup id s.nodes)
  case tyM of
    Just Faucet | not inShift ->
      setErr ("a formula may only reference stocks and dots; '" <> name <> "' is a faucet (a time shift like " <> name <> "(t - T) may read one)")
    _ -> pure unit
  pure id

-- | Attach a formula annotation: resolve its references, store the resolved
-- | tree, and draw the info arrows the equation implies (each referenced
-- | node -> this one), deduplicated against arrows already present. First
-- | annotation wins as a unit: a losing formula is ignored entirely (no
-- | refs minted, no arrows).
setFormula :: String -> Formula -> Evaluator Unit
setFormula id f = do
  already <- isAnnotated id
  if already then pure unit
  else do
    rf <- resolveFormula f
    updateNode id _ { expr = Just rf }
    traverse_ (\src -> drawArrow src id) (refIds rf)

-- | Dispatch an annotation to its setter.
setAnnot :: String -> Maybe Annot -> Evaluator Unit
setAnnot _ Nothing = pure unit
setAnnot id (Just (SchedAnnot sch)) = setSched id sch
setAnnot id (Just (FormulaAnnot f)) = setFormula id f

-- | Resolve (registering as needed) the id of the leftmost leaf of a
-- | subtree, without walking the rest of the subtree's internal links.
-- |
-- | It looks like duplicated work -- the caller evaluates that subtree
-- | immediately afterwards -- but running it FIRST is load-bearing: the link
-- | it lets the caller draw lands between the subtree's own links (the arrow
-- | in `([s]=>f)->([t]=>g)` sits between the two flows) and fixes port
-- | numbering. Both are pinned byte-exactly by test/golden.mjs.
leftmostId :: Tree -> Evaluator String
leftmostId (NodeExpr i s _) = resolveNamed Dot i s
leftmostId (StockExpr i s _) = resolveNamed Stock i s
leftmostId (CloudExpr i) = freshAnon Cloud i cloudLabel
leftmostId (FaucetExpr _ _ _ _ left _) = leftmostId left
leftmostId (ArrowExpr _ _ left _) = leftmostId left
leftmostId (ParenExpr _ expr) = leftmostId expr
leftmostId (LoopExpr _ _ expr) = leftmostId expr

-- | What evaluating a subtree yields: the id it RESOLVES TO (never a label --
-- | see the sink rule on the arrow cases) and, in source order, the ids of
-- | every node the subtree mentions. The membership is collected on the way
-- | through, so a loop annotation reads it straight off its body instead of
-- | re-walking the same tree with a second family of functions.
type Eval = { id :: String, members :: Array String }

leaf :: String -> Eval
leaf id = { id, members: [ id ] }

-- | Evaluate a subtree, registering nodes/links as a side effect.
evaluateNode :: Tree -> Evaluator Eval
evaluateNode (NodeExpr i s v) = do
  did <- resolveNamed Dot i s
  setAnnot did v
  pure (leaf did)
evaluateNode (StockExpr i s v) = do
  sid <- resolveNamed Stock i s
  setValue sid v
  pure (leaf sid)
evaluateNode (CloudExpr i) = leaf <$> freshAnon Cloud i cloudLabel
-- | A flow: the left operand feeds the faucet, which pours into the target.
-- | `<=` reverses both hops (the right operand feeds, the left receives), and
-- | that is the ONLY difference between the two spellings -- `directed` holds
-- | the swap, so neither hop can be reversed in one direction and forgotten
-- | in the other.
evaluateNode (FaucetExpr i dir name v left right) = do
  l <- evaluateNode left
  fid <- resolveNamed Faucet i name
  setAnnot fid v
  directed flowLink dir l.id fid
  case right of
    Nothing -> pure { id: fid, members: l.members <> [ fid ] }
    Just r -> do
      rid <- leftmostId r
      directed flowLink dir fid rid
      res <- evaluateNode r
      pure { id: res.id, members: l.members <> [ fid ] <> res.members }
-- | An info arrow links the left term to the *nearest* term of the right
-- | subtree (its leftmost leaf), never the chain's far end, so `a<-b->c` fans
-- | out from b (b->a and b->c) -- exactly how a faucet picks its source. The
-- | chain then resolves to its information SINK: `->` hands back the right
-- | subtree's resolution, `<-` the left's (`B(a<-b) <- c` hangs the tail off
-- | the head of the loop's chain).
evaluateNode (ArrowExpr _ dir left right) = do
  l <- evaluateNode left
  rid <- leftmostId right
  directed drawArrow dir l.id rid
  r <- evaluateNode right
  pure { id: sink dir l.id r.id, members: l.members <> r.members }
  where
  sink Rightward _ rightId = rightId
  sink Leftward leftId _ = leftId
evaluateNode (ParenExpr _ expr) = evaluateNode expr
-- | A loop annotation is transparent to evaluation: the inner expression
-- | emits its nodes and links as if unwrapped; afterwards every node it
-- | mentions is tagged with the loop's generated name ("R0", "B1", ... --
-- | the kind's letter plus one source-order counter across the program).
evaluateNode (LoopExpr _ kind inner) = do
  res <- evaluateNode inner
  n <- gets _.loopCount
  let name = loopLetter kind <> show n
  modify_ \s -> s
    { loopCount = n + 1
    , loopTags = foldl (addLoopTag name) s.loopTags (Array.nub res.members)
    }
  pure res

-- | Append a loop name to a node's tag list (creating the list on first tag).
addLoopTag :: String -> Map.Map String (Array String) -> String -> Map.Map String (Array String)
addLoopTag name m id = Map.alter (Just <<< maybe [ name ] (_ <> [ name ])) id m

-- | Undirected adjacency over a set of links (used for flow connectivity).
buildAdjacency :: Array Link -> Map.Map String (Set String)
buildAdjacency links = foldl step Map.empty links
  where
  step m l = addEdge l.source l.target (addEdge l.target l.source m)
  addEdge a b m = Map.insertWith Set.union a (Set.singleton b) m

-- | Every id reachable from a frontier by following `next` (DFS with a
-- | visited set). The file's one graph walk: the two things it is asked --
-- | flow-band components and formula cycles -- differ only in the successor
-- | function and the frontier they start from.
closure :: (String -> Array String) -> Array String -> Set String
closure next frontier = go (List.fromFoldable frontier) Set.empty
  where
  go Nil seen = seen
  go (x : xs) seen
    | Set.member x seen = go xs seen
    | otherwise = go (List.fromFoldable (next x) <> xs) (Set.insert x seen)

neighbours :: Map.Map String (Set String) -> String -> Array String
neighbours adj id = Array.fromFoldable (fromMaybe Set.empty (Map.lookup id adj))

-- | Connected components of the adjacency, as node-id sets.
connectedComponents :: Map.Map String (Set String) -> Array (Set String)
connectedComponents adj = (foldl step { visited: Set.empty, comps: [] } nodeIds).comps
  where
  nodeIds = map fst (Map.toUnfoldable adj :: Array (Tuple String (Set String)))
  step acc n
    | Set.member n acc.visited = acc
    | otherwise =
        let c = closure (neighbours adj) [ n ]
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
      -- a node is on a cycle when it is reachable from its own successors
      cyclic start = Set.member start (closure succs (succs start))
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

