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
import Data.Set as Set
import Data.Map as Map
import Data.Tuple (Tuple(..))
import Debug
import Control.Monad.State (State, runState, get, modify_)
import Parser (Tree(..))
import Lexer (Operator(..))
import Simple.JSON (class WriteForeign, writeImpl)

-- Graph types
-- data NodeType String = NodeType String
data NodeType = Dot | Stock | Faucet | Cloud
derive instance eqNodeType :: Eq NodeType
instance showNodeType :: Show NodeType where
  show Dot = "dot"
  show Stock = "stock"
  show Faucet = "faucet"
  show Cloud = "cloud"
instance writeForeignNodeType :: WriteForeign NodeType where
  writeImpl = writeImpl <<< show
-- type Node = {  id :: String, label :: String }
type Node = {  type :: NodeType, id :: String, label :: String }
type Link = {  type :: String, source :: String, target :: String }
type Graph = { nodes :: Array Node, links :: Array Link }


-- Evaluator state
type EvalState = 
  -- { nodes :: Set.Set String
  { nodes :: Map.Map String NodeType
  , links :: Array Link
  }

-- Evaluator monad
type Evaluator = State EvalState

-- type SymTab = M.Map String String

-- newtype Evaluator a = Ev (SymTab -> (a, SymTab))

-- instance Monad Evaluator where
--     (Ev act) >>= k = Ev $
--         \symTab -> 
--             let (x, symTab') = act symTab
--                 (Ev act') = k x
--             in act' symTab'
--     return x = Ev (\symTab -> (x, symTab))

-- -- Add a node to the graph (if it doesn't exist)
-- addNode :: String -> Evaluator Unit
-- addNode nodeId = modify_ \state ->
--   state { nodes = Set.insert nodeId state.nodes }
addNode :: NodeType -> String -> Evaluator Unit
addNode nodeType nodeId = modify_ \state ->
  state { nodes = Map.insert nodeId nodeType state.nodes }
  
-- Add a link to the graph
addLink :: String -> String -> String -> Evaluator Unit
addLink source target linkType = modify_ \state ->
  state { links = Array.snoc state.links { source, target, type: linkType } }

getLeftmost :: Tree -> String
getLeftmost (NodeExpr str) = str
getLeftmost (StockExpr s) = s
getLeftmost (CloudExpr s) = s
getLeftmost (FaucetExpr _ left _) = getLeftmost left
getLeftmost (ArrowRExpr left _) = getLeftmost left
getLeftmost (ArrowLExpr left _) = getLeftmost left
getLeftmost (ParenExpr expr) = getLeftmost expr

getLeftmostType :: Tree -> NodeType
getLeftmostType (NodeExpr _) = Dot
getLeftmostType (StockExpr _) = Stock
getLeftmostType (CloudExpr _) = Cloud
getLeftmostType (FaucetExpr _ left _) = getLeftmostType left
getLeftmostType (ArrowRExpr left _) = getLeftmostType left
getLeftmostType (ArrowLExpr left _) = getLeftmostType left
getLeftmostType (ParenExpr expr) = getLeftmostType expr

-- Evaluate tree and return the node identifier
evaluateNode :: Tree -> Evaluator String
evaluateNode (NodeExpr s) = do
  addNode Dot s
  pure s
evaluateNode (StockExpr s) = do
  addNode Stock s
  pure s
evaluateNode (CloudExpr s) = do
  addNode Cloud s
  pure s
-- evaluateNode (StockRExpr left right) = do
--   l <- evaluateNode left
--   r <- evaluateNode right
--   addLink l r "stock"
--   pure r  -- Return target node
evaluateNode (FaucetExpr name left right) = do
  l <- evaluateNode left
  addNode Faucet name
  addLink l name "arrow"
  case right of
    NodeExpr str -> do
      r <- evaluateNode right
      addLink name r "arrow"
      pure r
    _ -> do
      let rightStart = getLeftmost right
          rightType = getLeftmostType right
      addNode rightType rightStart
      addLink name rightStart "arrow"
      evaluateNode right
evaluateNode (ArrowRExpr left right) = do
  l <- evaluateNode left
  case right of
    NodeExpr str -> do
      r <- evaluateNode right
      addLink l r "arrow"
      pure r
    _ -> do
      -- let rightStart = getLeftmost right
      -- addNode rightStart
      let rightStart = getLeftmost right
          rightType = getLeftmostType right
      addNode rightType rightStart
      addLink l rightStart "arrow"
      evaluateNode right
-- evaluateNode (ArrowRExpr left right) = do
--   l <- evaluateNode left
--   r <- evaluateNode right
--   addLink (spy "L" l) (spy "R" r) "arrow"
--   pure r  -- Return target node
evaluateNode (ArrowLExpr left right) = do
  l <- evaluateNode left
  r <- evaluateNode right
  addLink r l "arrow"  -- Reversed direction
  pure l  -- Return target node
evaluateNode (ParenExpr expr) = evaluateNode expr

-- Main evaluation function that builds the complete graph
evaluate :: Tree -> Graph
evaluate tree = 
  let initialState = { nodes: Map.empty, links: [] }
      Tuple _ finalState = runState (evaluateNode tree) initialState
      -- nodeArray = Set.toUnfoldable finalState.nodes
      -- nodes = map (\id -> { id, label: id }) nodeArray
      nodeArray = (Map.toUnfoldable finalState.nodes :: Array (Tuple String NodeType))
      nodes = map (\(Tuple id ty) -> { type: ty, id, label: id }) nodeArray
  in { nodes, links: finalState.links }

-- Alternative runner that returns both the result and the graph
runEvaluator :: Tree -> Tuple String Graph
runEvaluator tree = 
  let initialState = { nodes: Map.empty, links: [] }
      Tuple result finalState = runState (evaluateNode tree) initialState
      -- nodeArray = Map.toUnfoldable finalState.nodes
      -- nodes = map (\id -> { id, label: id }) nodeArray
      nodeArray = (Map.toUnfoldable finalState.nodes :: Array (Tuple String NodeType))
      nodes = map (\(Tuple id ty) -> { type: ty, id, label: id }) nodeArray
      graph = { nodes, links: finalState.links }
  in Tuple result graph


-- module Evaluator 
--   ( evaluate
--   , Graph
--   , Node
--   , Link
--   , LinkType(..)
--   , initialGraph
--   ) where

-- import Prelude

-- import Data.Array as Array
-- import Data.Either (Either(..))
-- import Data.List (List(..))
-- import Data.List as List
-- import Data.Map as M
-- import Data.Maybe (Maybe(..))
-- import Data.Set as Set
-- import Data.Tuple (Tuple(..))
-- import Parser (Tree(..))
-- import Undefined

-- -- Link types to distinguish different connections
-- data LinkType 
--   = Flow      -- regular arrow
--   | Stock     -- stock relationship
--   | Inflow    -- into stock
--   | Outflow   -- out of stock

-- derive instance eqLinkType :: Eq LinkType

-- instance showLinkType :: Show LinkType where
--   show Flow = "flow"
--   show Stock = "stock"
--   show Inflow = "inflow"
--   show Outflow = "outflow"

-- type Node = 
--   { id :: String
--   , nodeType :: String  -- "regular" or "stock"
--   }

-- type Link = 
--   { id :: String
--   , source :: String
--   , target :: String
--   , linkType :: LinkType
--   }

-- type Graph = 
--   { nodes :: Array Node
--   , links :: Array Link
--   }

-- initialGraph :: Graph
-- initialGraph = { nodes: [], links: [] }

-- evaluate :: Tree -> Graph -> Either String Graph
-- evaluate tree _ = undefined
-- -- evaluate tree _ = evaluateTree tree

-- -- evaluateTree :: Tree -> Either String Graph
-- -- evaluateTree tree = 
-- --   case processTree tree of
-- --     Left err -> Left err
-- --     Right result -> Right result

-- -- -- Process tree and generate nodes/links
-- -- processTree :: Tree -> Either String Graph
-- -- processTree tree = 
-- --   case collectElements tree of
-- --     Left err -> Left err
-- --     Right elements -> 
-- --       let processed = processElements elements
-- --       in Right 
-- --         { nodes: Array.nub processed.nodes
-- --         , links: processed.links
-- --         }

-- -- Element type for intermediate processing
-- data Element 
--   = RegularNode String
--   | StockNode String
--   | FlowLink String String
--   | StockLink String String LinkType

-- -- collectElements :: Tree -> Either String (List Element)
-- -- collectElements = go Nil
-- --   where
-- --     go :: List Element -> Tree -> Either String (List Element)
-- --     go acc (NodeExpr id) = Right (RegularNode id : acc)
    
-- --     go acc (ArrowExpr left right) = do
-- --       leftElems <- collectElements left
-- --       rightElems <- collectElements right
-- --       let leftId = getLastNodeId leftElems
-- --           rightId = getFirstNodeId rightElems
-- --       case Tuple leftId rightId of
-- --         Tuple (Just l) (Just r) -> 
-- --           Right (leftElems <> (FlowLink l r : rightElems) <> acc)
-- --         _ -> Left "Invalid arrow expression structure"
    
-- --     go acc (StockForwardExpr left right) = do
-- --       leftElems <- collectElements left
-- --       rightElems <- collectElements right
-- --       let leftId = getLastNodeId leftElems
-- --           rightId = getFirstNodeId rightElems
-- --       case Tuple leftId rightId of
-- --         Tuple (Just l) (Just r) -> 
-- --           let stockId = l <> "_" <> r <> "_stock"
-- --               newElems = leftElems <> 
-- --                         List.fromFoldable
-- --                           [ StockNode stockId
-- --                           , StockLink l stockId Inflow
-- --                           , StockLink stockId r Outflow
-- --                           ] <> rightElems
-- --           in Right (newElems <> acc)
-- --         _ -> Left "Invalid stock forward expression"
    
-- --     go acc (StockBackwardExpr left right) = do
-- --       leftElems <- collectElements left
-- --       rightElems <- collectElements right
-- --       let leftId = getLastNodeId leftElems
-- --           rightId = getFirstNodeId rightElems
-- --       case Tuple leftId rightId of
-- --         Tuple (Just l) (Just r) -> 
-- --           let stockId = r <> "_" <> l <> "_stock"
-- --               newElems = leftElems <> 
-- --                         List.fromFoldable
-- --                           [ StockNode stockId
-- --                           , StockLink r stockId Inflow
-- --                           , StockLink stockId l Outflow
-- --                           ] <> rightElems
-- --           in Right (newElems <> acc)
-- --         _ -> Left "Invalid stock backward expression"
    
-- --     go acc (ParenExpr expr) = go acc expr

-- -- getFirstNodeId :: List Element -> Maybe String
-- -- getFirstNodeId Nil = Nothing
-- -- getFirstNodeId (RegularNode id : _) = Just id
-- -- getFirstNodeId (StockNode id : _) = Just id
-- -- getFirstNodeId (_ : rest) = getFirstNodeId rest

-- -- getLastNodeId :: List Element -> Maybe String
-- -- getLastNodeId elems = getFirstNodeId (List.reverse elems)

-- processElements :: List Element -> { nodes :: Array Node, links :: Array Link }
-- processElements elements = 
--   List.foldl processElement { nodes: [], links: [] } elements
--   where
--     processElement acc (RegularNode id) = 
--       acc { nodes = Array.snoc acc.nodes { id, nodeType: "regular" } }
    
--     processElement acc (StockNode id) = 
--       acc { nodes = Array.snoc acc.nodes { id, nodeType: "stock" } }
    
--     processElement acc (FlowLink source target) = 
--       let link = { id: source <> "-" <> target
--                  , source
--                  , target
--                  , linkType: Flow
--                  }
--       in acc { links = Array.snoc acc.links link }
    
--     processElement acc (StockLink source target linkType) = 
--       let link = { id: source <> "-" <> show linkType <> "-" <> target
--                  , source
--                  , target
--                  , linkType
--                  }
--       in acc { links = Array.snoc acc.links link }
