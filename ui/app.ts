import * as d3 from "d3";

import * as interpreter from '../output/Main/index'
import type { Expr, Node, Link, System } from "./type";
import faucetSvg from './shape/faucet.svg'
import cloudSvg from './shape/cloud.svg'
import { exampleList } from "./example";
import { T_END, flowSeries, goalRefs, hasDelays, hasNumbers, simulate } from "./simulate";
import { createChart, STOCK_PALETTE } from "./chart";
import { nameSpans } from "./highlight";

// All page chrome lives in this stylesheet, injected via d3 so index.html
// stays a bare shell. It is keyed on the class names assigned below; the
// inline styles in this file are layout logic only (flex `order`, display
// toggles). The diagram's structural marks (pipes, arcs, icons) stay
// black-on-white Meadows notation; each named NODE wears its accent — the
// one per-node color shared with the editor text and the chart (see the
// assignment in update()) — and the grays extend the chart's recessive ink
// family (see ui/chart.ts).
const css = `
  :root {
    --ink: #0b0b0b;
    --secondary: #52514e;
    --faint: #898781;
    --line: #dbd9d2;
    --paper: #faf9f7;
    --panel: #fff;
    --error: #b00020;
    --sans: system-ui, -apple-system, "Segoe UI", sans-serif;
    --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px;
    height: 100vh;    /* the app is fixed to the window; only the side column scrolls */
    overflow: hidden;
    display: flex;
    flex-direction: column;
    background: var(--paper);
    color: var(--ink);
    font-family: var(--sans);
  }
  header { margin-bottom: 16px; }
  header h1 {
    margin: 0;
    font-size: 16px;
    font-weight: 650;
    letter-spacing: 0.02em;
  }
  header p {
    margin: 3px 0 0;
    font-size: 12.5px;
    color: var(--faint);
  }
  .container {
    flex: 1;        /* fill the window below the header */
    min-height: 0;  /* may shrink to the fixed window height, never grow past it */
    display: flex;  /* default align-items stretch runs the diagram panel full height */
    gap: 12px;
  }
  .side {
    flex: 1 1 420px;
    min-width: 320px;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    overflow-y: auto; /* a long stack scrolls inside; the window never does */
  }
  .side > * { flex: none; } /* children keep natural height (no squash before scroll) */
  svg.svg, svg.chart {
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 8px;
  }
  /* The diagram panel is pinned to the window: it stretches to the fixed
     container height and never grows with content — a model that outgrows
     the canvas zooms OUT inside it (the eased viewBox letterboxes via
     preserveAspectRatio) rather than growing the page. The wrapper is
     positioned so the zoom cluster can overlay the panel's corner. */
  .diagram {
    position: relative;
    flex: 1 1 480px;
    min-width: 320px;
    display: flex;
  }
  svg.svg { flex: 1; min-width: 0; }
  .zoom {
    position: absolute;
    top: 10px;
    right: 10px;
    display: flex;
    gap: 6px;
  }
  .zoom button {
    min-width: 26px;
    height: 26px;
    padding: 0 7px;
    font-family: var(--sans);
    font-size: 13px;
    line-height: 1;
    color: var(--secondary);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    cursor: pointer;
  }
  .zoom button:hover { color: var(--ink); border-color: var(--faint); }
  .zoom button:active { background: var(--paper); }
  /* The build palette overlays the diagram's top-left corner (the zoom
     cluster's mirror): one picker per node kind and per link kind. An armed
     picker turns canvas clicks into placements — each lands as an appended
     DSL statement through the editor's own input dispatch, keeping the text
     the one source of truth — and the hint card narrates the link tools'
     two-click source→target gesture. */
  .palette {
    position: absolute;
    top: 10px;
    left: 10px;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 5px;
    /* The column's layout box is wider than its visible marks (the hint card
       stretches it): only the buttons take clicks, so the canvas underneath
       stays a placement surface right up to the visible pixels. */
    pointer-events: none;
  }
  .palette button {
    pointer-events: auto;
    width: 32px;
    height: 28px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
    cursor: pointer;
  }
  .palette button:hover { border-color: var(--faint); }
  .palette button.active { border-color: var(--ink); background: var(--paper); }
  .palette .sep { width: 32px; height: 1px; margin: 2px 0; background: var(--line); }
  .palette-hint {
    max-width: 150px;
    padding: 4px 8px;
    font-size: 11px;
    line-height: 1.35;
    color: var(--secondary);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
  }
  svg.chart { width: 100%; aspect-ratio: 700 / 260; }
  svg.chart:focus-visible {
    outline: 2px solid var(--faint);
    outline-offset: 2px;
  }
  /* The chart's footer row, tucked under the panel's right corner: the
     flows toggle (shown only when the model has delay calls) and the
     t= horizon field, right where the time axis they affect ends. */
  .horizon {
    display: flex;
    justify-content: flex-end;
    gap: 14px;
    margin-top: -4px;
  }
  .horizon label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--secondary);
  }
  .horizon input[type="number"] {
    width: 62px;
    padding: 3px 8px;
    font-family: var(--sans);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
    color: var(--ink);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 6px;
  }
  .horizon input[type="number"]:focus { outline: none; border-color: var(--faint); }
  .horizon input[type="checkbox"] {
    margin: 0;
    accent-color: var(--secondary);
  }
  .text-input:focus {
    outline: none;
    border-color: var(--faint);
  }
  /* Stylesheet rules beat SVG presentation attributes: one font for the
     diagram labels without touching the render code. */
  svg.svg text { font-family: var(--sans); }
  /* Empty canvas pans (grab, grabbing mid-pan); a shape instead moves under
     the cursor (drag pins the node), so it shows the move cursor — a distinct
     affordance from the pan hand. The panning class flips every mark to
     grabbing for the duration of a canvas pan (it outranks the shape rule:
     two classes to one). */
  svg.svg { cursor: grab; }
  svg.svg circle, svg.svg rect, svg.svg image { cursor: move; }
  /* A node's name label reads as editable (click to rename); before the
     panning/placing rules so those still win when active. */
  svg.svg text.node-label { cursor: text; }
  svg.svg.panning, svg.svg.panning * { cursor: grabbing; }
  /* An armed palette picker turns the whole canvas into a placement surface
     (after the panning rule, so the crosshair wins while a tool is armed). */
  svg.svg.placing, svg.svg.placing * { cursor: crosshair; }
  /* A node in the select tool's multi-selection wears the glow filter (a
     zero-offset colored halo — see the sel-glow def). */
  svg.svg g.selected { filter: url(#sel-glow); }
  /* A node picked into a loop tool's in-progress chain wears a distinct
     (violet) glow, so building a loop reads apart from a selection. */
  svg.svg g.loop-pick { filter: url(#loop-glow); }
  /* The link-delete hit twins are inert until the delete tool arms, then
     their fat stroke becomes clickable (nodes, drawn above them, still win a
     shared click). */
  svg.svg .link-hit { pointer-events: none; }
  svg.svg.delete-armed .link-hit { pointer-events: stroke; }
  /* The examples area stacks two collapsible <details> sections (figures
     from the book, and the extra examples); each holds a wrapping row of
     pills in an .example-group. */
  .examples {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .examples details {
    border: 1px solid var(--line);
    border-radius: 8px;
    background: var(--panel);
    padding: 7px 10px;
  }
  .examples summary {
    cursor: pointer;
    font-size: 11px;
    font-weight: 650;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--secondary);
    user-select: none;
  }
  .examples summary:hover { color: var(--ink); }
  .examples details[open] summary { margin-bottom: 8px; }
  .example-group {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  /* The format row tucks under the editor's right corner, mirroring the
     horizon row under the chart; its button shares the example-pill look. */
  .tools {
    display: flex;
    justify-content: flex-end;
    margin-top: -4px;
  }
  .examples button, .tools button {
    font-family: var(--sans);
    font-size: 12px;
    color: var(--secondary);
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 999px;
    padding: 4px 11px;
    cursor: pointer;
  }
  .examples button:hover, .tools button:hover { color: var(--ink); border-color: var(--faint); }
  .examples button:active, .tools button:active { background: var(--paper); }
  /* The pill whose model the editor holds (see updateActiveExamples). After
     the hover/active rules so the same-specificity cascade keeps the fill —
     hover would otherwise put ink text on the ink pill. */
  .examples button.active { background: var(--ink); border-color: var(--ink); color: var(--paper); }
  /* The editor is a textarea stacked over a color backdrop: .highlight
     renders the same text with each node name in its accent color, and the
     textarea above it makes its own glyphs transparent (caret and selection
     stay native). The two must share exact text metrics — the shared rule
     below pins every property that positions a glyph, so the colors sit
     precisely under the letters. The backdrop takes no part in layout
     (absolute) — the textarea alone sizes the wrapper, and its vertical
     resize handle keeps working. */
  .editor {
    position: relative;
    display: flex;
  }
  .text-input, .highlight {
    margin: 0;
    padding: 10px 12px;
    font-family: var(--mono);
    font-size: 12.5px;
    line-height: 1.55;
    letter-spacing: normal;
    tab-size: 8;
    text-align: left;
    white-space: pre-wrap;
    overflow-wrap: break-word;
    /* Classic (space-taking) scrollbars would narrow the textarea's wrap
       width but not the backdrop's; reserving the gutter in both keeps the
       two wrapping identically. Overlay scrollbars reserve nothing. */
    scrollbar-gutter: stable;
    border: 1px solid transparent;
    border-radius: 8px;
  }
  .highlight {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background: var(--panel);
    color: var(--ink);
    pointer-events: none;
  }
  .text-input {
    position: relative; /* paints above the backdrop */
    width: 100%;
    min-height: 10em;
    color: transparent;
    caret-color: var(--ink);
    background: transparent;
    border-color: var(--line);
    resize: vertical;
  }
  .text-input::placeholder { color: var(--faint); }
  /* Last so it also beats :focus (same specificity): a non-compiling model
     keeps the editor's border flagged while typing continues. */
  .text-input.error { border-color: rgba(176, 0, 32, 0.55); }
  /* Shown only while the model fails to compile (display toggled inline by
     the input handler), so the error styling is baked in. */
  .pre-output {
    margin: 0;
    max-height: 14em;
    overflow: auto;
    padding: 10px 12px;
    font-family: var(--mono);
    font-size: 11px;
    line-height: 1.5;
    color: var(--error);
    background: var(--panel);
    border: 1px solid rgba(176, 0, 32, 0.4);
    border-radius: 8px;
    white-space: pre-wrap;
    word-wrap: break-word;
  }
  /* The inline rename box: a small fixed-position input floated over a node's
     name label (see startRename), styled like the editor chrome. */
  .rename-input {
    position: fixed;
    z-index: 1000;
    height: 22px;
    padding: 1px 6px;
    font-family: var(--sans);
    font-size: 12px;
    text-align: center;
    color: var(--ink);
    background: var(--panel);
    border: 1.5px solid var(--secondary);
    border-radius: 5px;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.18);
    outline: none;
  }
  .rename-input.invalid { border-color: var(--error); }
  /* Narrow windows: back to one ordinary scrolling document column. */
  @media (max-width: 760px) {
    body { height: auto; min-height: 100vh; overflow: visible; }
    .container { flex-direction: column; }
    .diagram { min-height: 70vh; }
    .side { overflow-y: visible; }
  }
`
d3.select('head').append('style').text(css)

const body = d3.select('body')
const pageHeader = body.append('header')
pageHeader.append('h1').text('meadows')
pageHeader.append('p')
  .text('stock-and-flow diagrams from text, after ')
  .append('em').text('Thinking in Systems')

// Two columns filling the window: the example buttons, editor, compile-error
// panel and chart stacked in `side` on the left (flex orders 2, 2, 3, 9);
// the diagram svg on the right (container orders — side 1, svg 2).
const container = body
  .append('div')
  .attr('class', 'container')
const side = container
  .append('div')
  .attr('class', 'side')
  .style('order', 1)
const examples = side
  .append('div')
  .attr('class', 'examples')
  .style('order', 2)
// The compile-error panel: hidden while the model compiles, shown below the
// editor with the positioned message when it doesn't (see the input handler).
const pre = side
  .append('pre')
  .attr('class', 'pre-output')
  .style('order', 3)
  .style('display', 'none')
// The examples split into two collapsible <details> sections: every "figure
// N" entry (the book's diagrams) and everything else (the extra examples).
// Each pill's datum is its content's canonical reprint — the match key for
// the active-pill highlight (updateActiveExamples selects every button under
// `.examples`, so the nesting is transparent to it).
const addExampleSection = (title: string, items: typeof exampleList, open: boolean) => {
  const details = examples.append('details')
  if (open) details.attr('open', '')
  details.append('summary').text(title)
  const group = details.append('div').attr('class', 'example-group')
  items.forEach(x => {
    group.append('button')
      .datum(interpreter.format(x.content))
      .text(x.label)
      .on('click', () => loadExample(x))
  })
}
addExampleSection('figures from the book', exampleList.filter(x => x.label.startsWith('figure')), true)
addExampleSection('examples', exampleList.filter(x => !x.label.startsWith('figure')), true)


const svgWidth = 700
const svgHeight = 600
// Current viewBox, eased toward the auto-fit target scaled by the
// button-driven user zoom; see easeView().
let viewX = 0, viewY = 0, viewW = svgWidth, viewH = svgHeight;
// Button-driven zoom factor on top of the auto-fit: 1 = the fit itself,
// >1 closer, <1 further out.
let userZoom = 1;
// Drag-driven pan offset (viewBox user units) added to the auto-fit target
// center by easeView(); set by dragging empty canvas, cleared by the "1×"
// reset. Riding on the auto-fit target (rather than an absolute viewBox)
// keeps it composable with the zoom and the layout's own settling.
let panX = 0, panY = 0;

// The diagram panel: a positioned wrapper (see .diagram) so the zoom
// cluster can overlay the svg's top-right corner.
const diagram = container
  .append('div')
  .attr('class', 'diagram')
  .style('order', 2)
const svg: d3.Selection<SVGSVGElement, unknown, HTMLElement, any> = diagram
  .append('svg')
  .attr('class', 'svg')
  .attr("viewBox", `0 0 ${svgWidth} ${svgHeight}`)
  .call(canvasPan())
// Zoom controls: zoom in, reset to the auto-fit, zoom out — 1.25× steps
// about the view center, clamped; ensureViewEase animates the change even
// while the simulation is idle.
const zoomButtons = diagram
  .append('div')
  .attr('class', 'zoom')
const zoomStep = 1.25;
const setZoom = (z: number) => {
  userZoom = Math.min(8, Math.max(0.2, z));
  ensureViewEase();
};
zoomButtons.append('button')
  .attr('title', 'zoom in').attr('aria-label', 'zoom in')
  .text('+')
  .on('click', () => setZoom(userZoom * zoomStep));
zoomButtons.append('button')
  .attr('title', 'reset zoom').attr('aria-label', 'reset zoom')
  .text('1×')
  .on('click', () => { panX = 0; panY = 0; setZoom(1); });
zoomButtons.append('button')
  .attr('title', 'zoom out').attr('aria-label', 'zoom out')
  .text('−')
  .on('click', () => setZoom(userZoom / zoomStep));

// The build palette overlaying the svg's top-left corner: one picker per
// node kind (dot, stock, faucet — placed as a minimal cloud-to-cloud flow,
// since a faucet can't stand alone — and cloud) and per link kind (info
// arrow, flow pipe). A placement is really a text edit: each appends one
// DSL statement through the editor's own input dispatch (see
// appendStatement), so compile, diagram recycle, accents, highlight, and
// the chart all follow, and the placed node pins at the drop point exactly
// like a hand drag (a later click releases it). Link tools run a two-click
// source→target pick (see pickLinkEnd); Escape or re-clicking the armed
// picker disarms.
type ToolName = 'dot' | 'stock' | 'faucet' | 'cloud' | 'arrow' | 'flow'
  | 'reinforcing' | 'balancing' | 'select' | 'delete';
// A link tool's picked source: a named node, or (flow tool only) a canvas
// point standing for a new cloud.
type CanvasEnd = { x: number; y: number };
let armedTool: ToolName | null = null;
let linkSource: Node | CanvasEnd | null = null;
const isNodeEnd = (v: Node | CanvasEnd): v is Node => 'id' in v;
// The ordered node ids a loop tool (reinforcing/balancing) has picked so
// far, drawn with the loop-pick glow; committed as `R(a -> b -> …)` /
// `B(...)`. Reset on arm/disarm; update() prunes vanished ids.
let loopChain: string[] = [];
// The multi-selection built by the select tool: node ids, drawn with a glow
// (see renderSelection). Persists across edits — update() prunes ids that
// vanish — and across arming other tools, so you can select, then arm delete
// and remove the whole set at once. Cleared by a canvas-click while
// selecting, by a delete, and by an example load.
const selected = new Set<string>();
const palette = diagram.append('div').attr('class', 'palette');
const toolButton = (tool: ToolName, title: string) => palette
  .append('button')
  .datum(tool)
  .attr('title', title)
  .on('click', () => armTool(tool))
  .append<SVGSVGElement>('svg')
  .attr('width', 22).attr('height', 18)
  .attr('viewBox', '0 0 22 18');
// Each icon is a miniature of the diagram's own mark, so a picker reads as
// what it places.
toolButton('dot', 'place a dot (auxiliary variable)')
  .append('circle')
  .attr('cx', 11).attr('cy', 9).attr('r', 4)
  .attr('fill', '#fff').attr('stroke', '#000').attr('stroke-width', 1.5);
toolButton('stock', 'place a stock')
  .append('rect')
  .attr('x', 3.5).attr('y', 4.5).attr('width', 15).attr('height', 9)
  .attr('fill', '#fff').attr('stroke', '#000').attr('stroke-width', 1.5);
toolButton('faucet', 'place a faucet (a tap fed from a source cloud)')
  .append('image')
  .attr('href', faucetSvg)
  .attr('x', 3).attr('y', 1).attr('width', 16).attr('height', 16);
toolButton('cloud', 'place a cloud (a source or sink beyond the model)')
  .append('image')
  .attr('href', cloudSvg)
  .attr('x', 2).attr('y', 0).attr('width', 18).attr('height', 18);
palette.append('div').attr('class', 'sep');
toolButton('arrow', 'draw an info arrow: pick the source node, then the target')
  .call(icon => icon.append('path')
    .attr('d', 'M3,14 Q10,12.5 15.5,7.5')
    .attr('fill', 'none').attr('stroke', '#000').attr('stroke-width', 1.5))
  .call(icon => icon.append('path')
    .attr('d', 'M18.6,5 L16.9,9.2 L14.1,5.8 Z')
    .attr('fill', '#000'));
toolButton('flow', 'draw a flow pipe: pick stocks or faucets, or empty canvas for a cloud')
  .call(icon => icon.append('path')
    .attr('d', 'M2,9 L13,9')
    .attr('stroke', '#999').attr('stroke-width', 5))
  .call(icon => icon.append('path')
    .attr('d', 'M13,4.5 L20.5,9 L13,13.5 Z')
    .attr('fill', '#999'));
// The loop tools mark a feedback loop: click its nodes in order, then close
// it. Each writes an `R(...)`/`B(...)` annotation — a circular-arrow icon
// carrying the loop's letter, mirroring the diagram's floating R/B glyph.
const loopIcon = (letter: string) => (icon: d3.Selection<SVGSVGElement, ToolName, HTMLElement, any>) => {
  icon.append('path')
    .attr('d', 'M15.6,4.6 A6,6 0 1 0 17,9')
    .attr('fill', 'none').attr('stroke', '#444').attr('stroke-width', 1.4);
  icon.append('path')
    .attr('d', 'M13.2,4 L16.4,4.6 L15,7.5 Z')
    .attr('fill', '#444');
  icon.append('text')
    .attr('x', 10.5).attr('y', 9.4).attr('text-anchor', 'middle').attr('dy', '0.35em')
    .attr('font-size', 8).attr('font-weight', 700).attr('font-family', 'sans-serif')
    .attr('fill', '#444').text(letter);
};
toolButton('reinforcing', 'mark a reinforcing loop: click its nodes in order, then close it')
  .call(loopIcon('R'));
toolButton('balancing', 'mark a balancing loop: click its nodes in order, then close it')
  .call(loopIcon('B'));
palette.append('div').attr('class', 'sep');
// The edit tools act on existing nodes rather than adding one. Select builds
// a multi-selection (a dashed marquee icon); delete removes nodes and the
// statements that name them (a trash-can icon).
toolButton('select', 'select nodes: click to toggle, click canvas to clear')
  .append('rect')
  .attr('x', 3).attr('y', 4).attr('width', 16).attr('height', 10)
  .attr('rx', 1)
  .attr('fill', 'none').attr('stroke', '#000').attr('stroke-width', 1.3)
  .attr('stroke-dasharray', '2.5 2');
toolButton('delete', 'delete a node or a link (and the statement behind it), or a selection')
  .call(icon => icon.append('path')
    .attr('d', 'M5,5 H17')
    .attr('stroke', '#b00020').attr('stroke-width', 1.4).attr('stroke-linecap', 'round'))
  .call(icon => icon.append('path')
    .attr('d', 'M9,5 V3.6 H13 V5')
    .attr('fill', 'none').attr('stroke', '#b00020').attr('stroke-width', 1.4))
  .call(icon => icon.append('path')
    .attr('d', 'M6.6,5 L7.4,16 H14.6 L15.4,5 Z')
    .attr('fill', 'none').attr('stroke', '#b00020').attr('stroke-width', 1.4).attr('stroke-linejoin', 'round'))
  .call(icon => icon.append('path')
    .attr('d', 'M9.2,7.5 V13.5 M11,7.5 V13.5 M12.8,7.5 V13.5')
    .attr('stroke', '#b00020').attr('stroke-width', 1).attr('stroke-linecap', 'round'));
const paletteHint = palette.append('div')
  .attr('class', 'palette-hint')
  .style('display', 'none');

// Canvas clicks place the armed tool. A click on a link-hit twin (only
// hittable while the delete tool is armed) deletes that link — handled here
// rather than on the path itself, because a per-path click listener gets
// eaten by the canvas pan drag, while this bubble-phase svg handler fires
// reliably with the path as its target. Otherwise, only a background click
// (target is the svg itself) acts — a click on a shape has that shape as its
// target and routes through the node gestures. d3.pointer maps through the
// viewBox CTM, so the drop lands under the cursor at any zoom/pan.
svg.on('click', (event: MouseEvent) => {
  if (armedTool == null) return;
  const target = event.target as Element;
  if (armedTool === 'delete' && target instanceof SVGPathElement && target.classList.contains('link-hit')) {
    const d = d3.select<SVGPathElement, Link>(target).datum();
    if (d) deleteLink(d);
    return;
  }
  if (target !== svg.node()) return;
  const [x, y] = d3.pointer(event, svg.node());
  placeAt(x ?? 0, y ?? 0);
});
// Escape abandons the armed tool (and any half-picked link source or loop
// chain); Enter closes an in-progress loop. Both are ignored while typing in
// the editor, so editing text never trips them.
window.addEventListener('keydown', (event: KeyboardEvent) => {
  if (event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLInputElement) return;
  if (event.key === 'Escape' && armedTool != null) disarmTool();
  else if (event.key === 'Enter' && (armedTool === 'reinforcing' || armedTool === 'balancing')) {
    event.preventDefault();
    commitLoop();
  }
});
// The behavior-over-time panel, at the bottom of the left-hand column: its
// order 9 sorts after the examples' and editor's order 2; the t= horizon
// field footers it at order 10.
const chart = createChart(side)
// The simulation horizon: how much time the chart runs and shows. The t=
// field edits it live; only the chart re-renders (the diagram is time-free).
// lastChart holds what a horizon change must re-run: the last successfully
// compiled system with its stock accent assignment, and whether it plots.
let tEnd = T_END;
// The flows toggle (figure 33's view): when on, the chart overlays each
// delay call's input and output as thin lines — orders against
// deliveries. Off by default so the plain stock charts (figures 32, 34,
// 35) stay exactly the book's.
let showFlows = false;
let lastChart: { system: System; colorOf: (id: string) => string; plottable: boolean } | null = null;
function refreshChart(): void {
  if (lastChart?.plottable) {
    const { system, colorOf } = lastChart;
    chart.render(simulate(system, tEnd), colorOf, goalRefs(system), tEnd,
      showFlows ? flowSeries(system, tEnd) : []);
  } else {
    chart.empty(tEnd);
  }
  // The toggle appears only when the model has a delay to unfold.
  if (lastChart?.plottable && hasDelays(lastChart.system)) flowsLabel.style('display', null);
  else flowsLabel.style('display', 'none');
}
const horizonRow = side
  .append('div')
  .attr('class', 'horizon')
  .style('order', 10)
const flowsLabel = horizonRow
  .append('label')
  .attr('title', "plot each delay's input (solid) and output (dashed) — the figure 33 view")
  .style('display', 'none')
const flowsInput = flowsLabel.append('input')
  .attr('type', 'checkbox')
  .on('change', function () {
    showFlows = (this as HTMLInputElement).checked;
    refreshChart();
  });
flowsLabel.append('span').text('flows')
const horizonLabel = horizonRow
  .append('label')
  .attr('title', 'simulated time horizon')
horizonLabel.append('span').text('t =')
horizonLabel.append('input')
  .attr('type', 'number')
  .attr('min', 1)
  .attr('max', 1000)
  .attr('step', 1)
  .attr('value', T_END)
  .on('input', function () {
    // Live while typing; a mid-edit blank (NaN) keeps the current horizon.
    const v = this.valueAsNumber;
    if (!Number.isFinite(v)) return;
    tEnd = Math.min(1000, Math.max(1, v));
    refreshChart();
  })
  .on('change', function () {
    // Enter/blur: snap the field to the horizon actually in effect (applies
    // the clamp, un-blanks an emptied field).
    this.value = String(tEnd);
  });
// Editor accent per node NAME, rebuilt by update() from the compiled graph:
// the compiler's registry makes a name one node, so the editor colors every
// mention of that name alike. renderHighlight() reads it; names it doesn't
// hold (mid-edit in a not-yet-compiling model) stay ink.
let nameColor = new Map<string, string>();
// A palette accent readable AS TEXT on the white panel: the pale entries
// (yellow, aqua, magenta) clamp to LAB lightness 55 — the same hue family
// the chart shows, dark enough for 12.5px glyphs. The chart may run them
// pale because its labels are ink; in the editor the color IS the glyph.
const textAccent = (c: string): string => {
  const lab = d3.lab(c);
  if (lab.l > 55) lab.l = 55;
  return lab.formatHex();
};
// The editor stack: the .highlight color backdrop first, the transparent-text
// textarea after it (so the textarea paints on top — see the stylesheet).
const editorWrap = side
  .append('div')
  .attr('class', 'editor')
  .style('order', 2)
const highlight = editorWrap
  .append('div')
  .attr('class', 'highlight')
  .attr('aria-hidden', 'true')
const textInput = editorWrap
  .append('textarea')
  .attr('class', 'text-input')
  .attr('placeholder', '|=>inflow[stock]=>outflow|')
  .attr('spellcheck', 'false')
  .attr('autocapitalize', 'off')
  .attr('autocomplete', 'off')
  .on('input', function (e: Event) {
    if (!(e.target instanceof HTMLTextAreaElement)) {
      console.error("Event target is not a HTMLTextAreaElement");
      return;
    }
    const input = e.target.value;
    try {
      const output = interpreter.go(input);
      const result = JSON.parse(output) as unknown;
      const editor = d3.select(e.target);
      if (typeof result === 'string') {
        // Compile error: flag the editor's border, reveal the error panel
        // with the message, and keep the last good graph on screen.
        editor.classed('error', true);
        pre.style('display', null).text(result);
        return;
      }
      editor.classed('error', false);
      pre.style('display', 'none').text('');
      const parse = result as System;
      console.log('parse::', parse)
      update(parse)
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error("Error occurred while processing input:", error.message, error);
        console.error(error);
        return
      }
      console.error("An unknown error occurred:", error);
    } finally {
      // Every path re-inks the backdrop — on a compile error too, where the
      // last good compile's colors still mark the recognized names. On
      // success this runs AFTER update() refreshed nameColor, so a
      // just-typed name colors on its own keystroke.
      renderHighlight(input);
      updateActiveExamples(input);
    }
  })
  .on('scroll', syncHighlightScroll)

// The format button, tucked under the editor: reprints the model in the
// canonical spacing (src/Formatter.purs — token-preserving, so the graph,
// layout, and accents are untouched). Applied through the same value-set +
// input-dispatch path as loadExample, so compile, diagram recycle, and the
// highlight backdrop all refresh; input that doesn't lex comes back
// unchanged from format(), and the button simply no-ops.
const tools = side
  .append('div')
  .attr('class', 'tools')
  .style('order', 2)
tools.append('button')
  .text('format')
  .on('click', () => {
    const ta = textInput.node();
    if (!ta) return;
    const formatted: string = interpreter.format(ta.value);
    if (formatted === ta.value) return;
    textInput.property('value', formatted);
    ta.dispatchEvent(new Event('input'));
  });

// Rebuild the editor's color backdrop: the same text the textarea holds,
// with every recognized node name in its accent (weight 600 so pale accents
// still carry; the mono face keeps the same advance width when bold, so the
// glyphs stay exactly under the textarea's). Wholesale rebuild per
// keystroke — models are tiny.
function renderHighlight(text: string): void {
  highlight.selectAll('span').remove();
  for (const s of nameSpans(text)) {
    const span = highlight.append('span').text(s.text);
    const c = s.name != null ? nameColor.get(s.name) : undefined;
    if (c != null) span.style('color', c).style('font-weight', 600);
  }
  // pre-wrap drops a trailing newline's empty line box where the textarea
  // keeps one; a zero-width space holds the backdrop's height in step.
  if (text.endsWith('\n')) highlight.append('span').text('\u200b');
  syncHighlightScroll();
}
// An example pill lights while the editor holds its model. The comparison is
// on the FORMATTED text (each button's datum is its content's canonical
// reprint), so the highlight keys on the underlying value, not the spelling:
// buttons sharing one model (the figure 31 & 32/33/34 trio) light together,
// and a format press or a spacing-only edit never clears it — any real edit
// does. Runs from the input handler's finally, so every path — typing, a
// button load, format, even a compile error — keeps the pills honest.
function updateActiveExamples(text: string): void {
  const canon = interpreter.format(text);
  examples.selectAll<HTMLButtonElement, string>('button')
    .classed('active', d => d === canon);
}
// The backdrop shows whatever slice the textarea has scrolled to.
function syncHighlightScroll(): void {
  const hl = highlight.node(), ta = textInput.node();
  if (hl && ta) {
    hl.scrollTop = ta.scrollTop;
    hl.scrollLeft = ta.scrollLeft;
  }
}

// Arrowhead markers. Both anchor their BASE at the path's end (refX 0) so the
// line stops cleanly where the triangle starts and the head extends beyond it —
// no line poking out around the narrowing tip. Sized in user-space pixels.
const flowArrowLength = 24; // big solid head for pipes (Meadows notation)
const infoArrowLength = 9;  // small head for thin info arcs
const defs = svg.append("defs");
defs.append("marker")
  .attr("id", "flow-arrow")
  .attr("viewBox", "0 0 10 10")
  .attr("refX", 0)
  .attr("refY", 5)
  .attr("markerWidth", flowArrowLength)
  .attr("markerHeight", flowArrowLength)
  .attr("markerUnits", "userSpaceOnUse")
  .attr("orient", "auto")
  .append("path")
  .attr("d", "M0,0L10,5L0,10Z")
  .attr("fill", "#999");
defs.append("marker")
  .attr("id", "info-arrow")
  .attr("viewBox", "0 0 10 10")
  .attr("refX", 0)
  .attr("refY", 5)
  .attr("markerWidth", infoArrowLength)
  .attr("markerHeight", infoArrowLength)
  .attr("markerUnits", "userSpaceOnUse")
  .attr("orient", "auto")
  .append("path")
  .attr("d", "M0,0L10,5L0,10Z")
  .attr("fill", "#000");
// There is deliberately no tail marker on info arcs: every arrow tail meets
// a drawn node whose own glyph is the Meadows open circle (a dot's circle, a
// port's) — a marker would just double it.
// The selection glow: a zero-offset colored drop-shadow the select tool
// paints around a chosen node's whole group (see the .selected CSS rule and
// renderSelection). The wide filter region keeps the halo from clipping.
const glowFilter = (id: string, color: string) => defs.append("filter")
  .attr("id", id)
  .attr("x", "-60%").attr("y", "-60%")
  .attr("width", "220%").attr("height", "220%")
  .append("feDropShadow")
  .attr("dx", 0).attr("dy", 0)
  .attr("stdDeviation", 3)
  .attr("flood-color", color)
  .attr("flood-opacity", 1);
glowFilter("sel-glow", "#2f6fed");   // select tool: blue
glowFilter("loop-glow", "#7c3aed");  // loop tools: violet

// Flow pipes render BELOW the nodes (a faucet must sit on top of its pipe).
let flowLink = svg.append("g")
  .attr("fill", "none")
  .selectAll<SVGPathElement, Link>("path");
// A transparent wide-stroke twin of every link (flow and info), for the
// delete tool to click: thin info arcs are near-impossible to hit on their
// 1.5px stroke. It sits just above the flow pipes but BELOW the node layers,
// so a node click still wins over a link that passes near it. Inert
// (pointer-events none) until the delete tool arms — see the .delete-armed
// CSS rule — so it never steals pan or other-tool clicks. Its `d` is the
// same path as the visible link (set in ticked()).
let linkHit = svg.append("g")
  .attr("fill", "none")
  .selectAll<SVGPathElement, Link>("path");

// Meadows size hierarchy, faucet held at 40px as the reference unit: stocks
// dominate (~2.3x the faucet, 4:3), clouds sit between, aux dots are tiny.
const dotRadius = 5;
const stockWidth = 96;
const stockHeight = 72;
const faucetWidth = 40;
const faucetHeight = 40
// In the artwork the tap's base — the part the pipe passes through in the
// reference figures — is centred at 79% of the icon's height, not its middle.
// Draw the icon lifted by that excess so the base straddles the pipe line
// (= the node point) and the handle rises above it; everything that AIMS at
// a faucet (label, info arcs) shifts by the same amount via aimY.
const faucetLift = faucetHeight * (0.79 - 0.5);
const cloudWidth = 52;
const cloudHeight = 52;
// A port (the boundary dot the compiler mints where an info arrow meets a
// stock) draws as the Meadows open tail circle promoted to a node, pinned
// inside the stock's rect.
const portRadius = 4;

// What a node displays: its name, plus its value annotation when it carries
// one ("water in tub: 50", "outflow: 5", "inflow: 0 @5: 5" for a rate
// schedule). Display only — node ids and the compiler's name registry stay
// keyed on the bare name, so `[water in tub]` written elsewhere still
// resolves to the same node.
// Labels for formula references, refreshed by update() (refs are ids).
let labelById = new Map<string, string>();
const renderExpr = (e: Expr): string => {
  switch (e.kind) {
    case "num": return `${e.value}`;
    case "t": return "t";
    case "pi": return "pi";
    case "ref": return labelById.get(e.id) ?? e.id;
    case "cos": case "sin": return `${e.kind}(${renderExpr(e.arg)})`;
    case "min": case "max": return `${e.kind}(${renderExpr(e.left)}, ${renderExpr(e.right)})`;
    case "delay": {
      // A shift prints as the source reads: input(t - T), the input
      // parenthesized unless it can take a shift tail bare (a reference
      // or a call) and the time unless it is one term — exactly the
      // re-parseable spelling.
      const bareInput = ["ref", "cos", "sin", "min", "max"].includes(e.input.kind);
      const input = bareInput ? renderExpr(e.input) : `(${renderExpr(e.input)})`;
      const bareTime = ["num", "ref", "t", "pi", "cos", "sin", "min", "max"].includes(e.time.kind);
      const time = bareTime ? renderExpr(e.time) : `(${renderExpr(e.time)})`;
      return `${input}(t - ${time})`;
    }
    default: {
      // Parenthesize a child that binds looser than this operator; shifts
      // and atoms bind tightest and never need wrapping.
      const rank = (k: Expr["kind"]) =>
        k === "+" || k === "-" ? 0 : k === "*" || k === "/" ? 1 : 2;
      const wrap = (c: Expr) =>
        rank(c.kind) < rank(e.kind) ? `(${renderExpr(c)})` : renderExpr(c);
      return e.kind === "^"
        ? `${wrap(e.left)}^${wrap(e.right)}`
        : `${wrap(e.left)} ${e.kind} ${wrap(e.right)}`;
    }
  }
};
const displayLabel = (d: Node): string => {
  if (d.expr != null) return `${d.label}: (${renderExpr(d.expr)})`;
  if (d.value == null) return d.label;
  const steps = (d.steps ?? []).map(s => ` @${s.at}: ${s.value}`).join("");
  return `${d.label}: ${d.value}${steps}`;
};

// Distance from a node's center to where links should stop. Stock uses its
// half-width (pipes enter horizontally); info arcs into a stock's top/bottom
// stop a touch early — acceptable scalar approximation.
function edgeOf(d: Node): number {
  switch (d.type) {
    case "stock": return stockWidth / 2;
    case "cloud": return cloudWidth / 2;
    case "dot": return dotRadius + 4;
    case "port": return portRadius;
    default: return faucetWidth / 2;
  }
}

// Where an info arc aims. A faucet's node point is its pipe junction (the
// lifted icon's base), but arrows should meet the visible tap body above it —
// so every info-arc computation (trim, bulge, sweep scoring, letter parking,
// viewBox union) reads faucet endpoints through this lift. Flow pipes keep
// the true node point: that IS the pipe line.
const aimY = (n: Node): number => (n.y ?? 0) - (n.type === "faucet" ? faucetLift : 0);

// Each node is a <g> that holds its shape *and* its text label, so the two
// move together (positioned via a transform in ticked()).
let nodeDot = svg.append<SVGGElement>("g")
  .selectAll<SVGGElement, Node>("g");
let nodeStock = svg.append<SVGGElement>("g")
  .selectAll<SVGGElement, Node>("g");
let nodeFaucet = svg.append<SVGGElement>("g")
  .selectAll<SVGGElement, Node>("g");
let nodeCloud = svg.append<SVGGElement>("g")
  .selectAll<SVGGElement, Node>("g");
// Ports render above the other nodes (each must sit on top of its stock's
// rect) and below the info links whose ends they anchor.
let nodePort = svg.append<SVGGElement>("g")
  .selectAll<SVGGElement, Node>("g");

// Info links render ABOVE the nodes so their heads stay visible where they
// meet a stock/cloud, and the arcs read as continuous rather than vanishing
// behind shapes.
let infoLink = svg.append("g")
  .attr("fill", "none")
  .selectAll<SVGPathElement, Link>("path");

// Loop letters render topmost: each R(...)/B(...) annotation floats its
// letter inside its loop (a pure overlay — loop labels are not simulation
// nodes and feel no forces). Each instance records the links joining two of
// its members — the loop's drawn boundary — so the letter can park at that
// boundary's mean (pipe midpoints, arc bulge apexes) rather than at the
// member centroid, which a wide stock rect pulls onto its own body.
type LoopInstance = { name: string, letter: string, members: Node[], edges: Link[] };
let loopLabel = svg.append("g")
  .selectAll<SVGTextElement, LoopInstance>("text");

const systemNodes: Node[] = [];
const systemLinks: Link[] = []
const system: System = { nodes: systemNodes, links: systemLinks }

const simulation = d3.forceSimulation<Node, Link>(systemNodes)
  // Flow pipes stay stiff, but info arrows are soft suggestions: at the d3
  // default strength they reel a dragged dot back to rest-length, so e.g.
  // `growth goal` could never float above its band — every equilibrium sat
  // pinned on the band line. Soft arrows let hand placement win.
  // A flow pipe's rest length is the distance between its endpoints' layout
  // slots (including a branch's vertical drop), so the pipe holds its faucet in
  // the slot it was laid out in rather than reeling it back toward its
  // reservoir. Info arrows keep the fixed rest length (they aren't slotted).
  .force("link", d3.forceLink<Node, Link>(systemLinks).id(d => d.id)
    .distance(l => l.type === "flow"
      ? Math.max(40, Math.hypot(
          ((l.source as Node).gx ?? 0) - ((l.target as Node).gx ?? 0),
          ((l.source as Node).gy ?? 0) - ((l.target as Node).gy ?? 0)))
      : 80)
    .strength(l => l.type === "flow" ? 0.5 : 0.2))
  // Stocks are the diagram's anchors: they repel harder than other nodes;
  // dots repel a bit more than faucets/clouds so the aux web spreads through
  // the inter-band region instead of clumping at the midline.
  // Ports are force-inert satellites: fx/fy-pinned inside their stock every
  // tick, and with zero charge/collision so they neither shove neighbors
  // away from the stock's edge nor phantom-repel the aux web.
  .force("charge", d3.forceManyBody<Node>().strength(d =>
    d.type === "stock" ? -300 : d.type === "dot" ? -250 : d.type === "port" ? 0 : -200))
  // Collision radii track the size hierarchy so big shapes push neighbors out
  // of their space; dots are tiny but their label above needs clearance.
  .force("collide", d3.forceCollide<Node>().radius(d =>
    d.type === "stock" ? 62 : d.type === "cloud" ? 30 : d.type === "dot" ? 26 : d.type === "port" ? 0 : 24
  ).strength(0.85))
  // No forceCenter: it rigidly translates ALL nodes every tick (unscaled by
  // alpha) until their MEAN sits at the canvas center. With bands pinned to
  // absolute slots, that forbids any asymmetric rest pose — figure 9's aux
  // web could never hang below its band, and every settle or drag slid the
  // whole diagram. Bands anchor the layout absolutely; floaters hold to the
  // weak pulls below.
  // Stocks pull hard to their slot x (evenly spaced per band, see update());
  // everything else gets only gentle x-centering — too strong crowds each band
  // inward, and collision then escapes vertically (waving the line).
  .force("x", d3.forceX<Node>(d => d.gx ?? svgWidth / 2).strength(d => d.gx != null ? 0.25 : 0.02))
  // Stocks pin to their band's y hardest, other band members strongly (forming
  // a horizontal line); floating nodes get only a barely-there tie-breaker
  // toward their float line (floatY in update()) — weak enough that a dot
  // dragged to the other side of its band stays there (links + charge
  // dominate) instead of drifting back.
  .force("y", d3.forceY<Node>(d => d.gy ?? svgHeight / 2).strength(d => d.type === "stock" ? 1.0 : d.inFlow ? 0.9 : 0.01))
  .on("tick", ticked);

// The integer the compiler minted into an id ("dot#3" -> 3): update()'s slot
// ordering and accent assignment order by it, and the palette matches fresh
// clouds to their canvas clicks through it (mint order is statement order).
const parserId = (id: string): number => {
  const n = parseInt(id.slice(id.indexOf("#") + 1), 10);
  return isNaN(n) ? 0 : n;
};

update(system);

function update(system: System) {
  // Make a shallow copy to protect against mutation, while recycling old nodes to preserve position and velocity.
  const old = new Map(simulation.nodes().map(d => [d.id, d] as [string, Node]));
  const nodes = system.nodes.map(d => {
    const prev = old.get(d.id);
    // Clear the Maybe-omitted compiler fields before merging: a recycled node
    // would otherwise keep a stale `group`/`loop`/`value`/`steps` after
    // losing it upstream (the JSON simply omits the key, so Object.assign
    // wouldn't overwrite).
    return prev ? Object.assign(prev, { group: null, loop: null, value: null, steps: null, expr: null, parent: null }, d) : { ...d };
  });
  const links = system.links.map(d => ({ ...d }));
  // Formula labels resolve refs by id; refresh before any displayLabel call
  // (the node joins below render labels).
  labelById = new Map(nodes.map(n => [n.id, n.label]));
  // Link endpoints arrive from the compiler as id strings, but d3's link force
  // rewrites them to node objects once it has seen them (a recycled node from
  // a prior update carries such links) — normalize before using one as a key.
  const endId = (e: Link["source"]): string =>
    typeof e === "object" && e !== null ? (e as Node).id : String(e);
  const nodeById = new Map(nodes.map(n => [n.id, n] as [string, Node]));
  // Stamp each port's per-update hints: its parent stock's node object (the
  // port pins just inside that rect every tick) and its one arrow's far
  // endpoint (which side of the stock to face) — resolved onward to the far
  // parent when both ends are ports, so neither position depends on the
  // other port's yet-unplaced coordinates.
  const throughPort = (n: Node | undefined): Node | undefined =>
    n?.type === "port" && n.parent != null ? nodeById.get(n.parent) : n;
  for (const l of links) {
    if (l.type === "flow") continue;
    const s = nodeById.get(endId(l.source)), t = nodeById.get(endId(l.target));
    if (s?.type === "port" && s.parent != null) {
      s.portParent = nodeById.get(s.parent);
      s.portFar = throughPort(t);
    }
    if (t?.type === "port" && t.parent != null) {
      t.portParent = nodeById.get(t.parent);
      t.portFar = throughPort(s);
    }
  }

  flowLink = flowLink
    .data(links.filter(l => l.type === "flow"))
    .join("path")
    .attr("fill", "none");
  infoLink = infoLink
    .data(links.filter(l => l.type !== "flow"))
    .join("path")
    .attr("fill", "none");
  // The delete-hit twins cover every link with a wide transparent stroke — a
  // fat click target, since a 1.5px info arc is near-impossible to hit. The
  // click itself is handled by the svg's own click handler (which fires
  // reliably on bubble, where a per-path click listener gets eaten by the
  // canvas pan drag): it reads the clicked path's datum. Gated to the delete
  // tool by the .delete-armed pointer-events rule, so these are inert (and
  // never steal pan/other-tool clicks) otherwise.
  linkHit = linkHit
    .data(links)
    .join("path")
    .attr("class", "link-hit")
    .attr("fill", "none")
    .attr("stroke", "transparent")
    .attr("stroke-width", 16)
    .attr("stroke-linecap", "round");
  nodeDot = nodeDot
    .data(nodes.filter(x => x.type === 'dot'), d => d.id)
    .join(enter => {
      const g = enter.append("g");
      g.append("circle")
        .attr("r", dotRadius)
        .attr("fill", "#fff")
        .attr("stroke", "#000")
        .attr("stroke-width", 1.5);
      // Label above the tiny circle so it stays visible.
      appendLabel(g, -12);
      return g;
    })
    .call(sel => sel.select<SVGTextElement>("text").text(displayLabel))
    .call(drag(), undefined);
  nodeStock = nodeStock
    .data(nodes.filter(x => x.type === 'stock'), d => d.id)
    .join(enter => {
      const g = enter.append("g");
      g.append("rect")
        .attr("x", -stockWidth / 2)
        .attr("y", -stockHeight / 2)
        .attr("width", stockWidth)
        .attr("height", stockHeight)
        .attr("stroke", "#000")
        .attr("stroke-width", 2)
        .attr("fill", "#fff");
      // Label inside the rectangle, slightly larger than the others.
      appendLabel(g, 0, 12);
      return g;
    })
    .call(sel => sel.select<SVGTextElement>("text").text(displayLabel))
    .call(drag(), undefined);
  nodeFaucet = nodeFaucet
    .data(nodes.filter(x => x.type === 'faucet'), d => d.id)
    .join(enter => {
      const g = enter.append("g");
      g.append("image")
        .attr("href", faucetSvg)
        .attr("x", -faucetWidth / 2)
        .attr("y", -faucetHeight / 2 - faucetLift)
        .attr("width", faucetWidth)
        .attr("height", faucetHeight);
      // Label above the icon, as in the reference figure.
      appendLabel(g, -28 - faucetLift);
      return g;
    })
    .call(sel => sel.select<SVGTextElement>("text").text(displayLabel))
    .call(drag(), undefined);
  nodeCloud = nodeCloud
    .data(nodes.filter(x => x.type === 'cloud'), d => d.id)
    .join(enter => {
      // Clouds carry no label (theirs is just "|").
      const g = enter.append("g");
      g.append("image")
        .attr("href", cloudSvg)
        .attr("x", -cloudWidth / 2)
        .attr("y", -cloudHeight / 2)
        .attr("width", cloudWidth)
        .attr("height", cloudHeight);
      return g;
    })
    .call(drag(), undefined);
  // Ports: label-less open circles (the Meadows tail glyph as a node), pinned
  // by ticked(). Draggable — but only along the stock's boundary (portDrag
  // records a bearing, never a free position); an invisible larger disc makes
  // the tiny circle grabbable while the rest of the stock's surface keeps
  // driving the stock's own drag.
  nodePort = nodePort
    .data(nodes.filter(x => x.type === 'port'), d => d.id)
    .join(enter => {
      const g = enter.append("g");
      g.append("circle")
        .attr("r", portRadius)
        .attr("fill", "#fff")
        .attr("stroke", "#000")
        .attr("stroke-width", 1.5);
      g.append("circle")
        .attr("r", portRadius + 6)
        .attr("fill", "transparent");
      return g;
    })
    .call(portDrag(), undefined);

  // One floating letter per loop annotation: group the nodes by loop name
  // (a node can be in several loops) and derive each letter from its name
  // ("R0" -> "R"). ticked() parks the letter at its members' centroid.
  const loopMembers = new Map<string, Node[]>();
  for (const d of nodes) {
    for (const name of d.loop ?? []) {
      const arr = loopMembers.get(name) ?? [];
      arr.push(d);
      loopMembers.set(name, arr);
    }
  }
  // Link endpoints are still id strings here (the force rewrites them to
  // node objects later), so match member-to-member links by id either way.
  // A port endpoint counts as its parent stock: loop tags never land on
  // ports, but the stock→faucet arc closing a loop hangs off one — its
  // bulge apex must keep feeding the letter's parking spot.
  const memberEnd = (e: Link["source"]): string => {
    const n = nodeById.get(endId(e));
    return n?.type === "port" && n.parent != null ? n.parent : endId(e);
  };
  const loopInstances: LoopInstance[] = [...loopMembers.entries()]
    .map(([name, members]) => {
      const ids = new Set(members.map(m => m.id));
      const edges = links.filter(l => ids.has(memberEnd(l.source)) && ids.has(memberEnd(l.target)));
      return { name, letter: name.charAt(0), members, edges };
    });
  loopLabel = loopLabel
    .data(loopInstances, d => d.name)
    .join("text")
    .attr("text-anchor", "middle")
    .attr("dy", "0.32em")
    .attr("font-size", 28)
    .attr("font-family", "sans-serif")
    .attr("fill", "#444")
    .attr("pointer-events", "none")
    .text(d => d.letter);

  // Lay nodes out in horizontal bands. The compiler assigns each node a `group`
  // (a flow-connected chain of stocks/faucets/clouds), numbered top to bottom;
  // dots and reservoir-less faucets have no group and float.
  const gs = nodes.map(n => n.group).filter((g): g is number => g != null);
  const groupCount = gs.length ? Math.max(...gs) + 1 : 0;
  // Allocate the vertical gap between bands dynamically (any number of groups):
  // spread them to fill the canvas — outer bands near the top/bottom edges,
  // leaving the middle open for the floating aux web — but never tighter than a
  // comfortable minimum. With many bands the stack overflows the canvas and the
  // auto-fit viewBox zooms out, keeping the gap readable rather than cramming.
  const bandMargin = svgHeight * 0.12;
  const minBandGap = 200;
  const bandGap = groupCount > 1
    ? Math.max(minBandGap, (svgHeight - 2 * bandMargin) / (groupCount - 1))
    : 0;
  const rowGap = 120; // vertical drop from a band to a branch row below it
  // Floaters rest at the canvas midline — the open inter-band region — but
  // with a single band the midline IS the band line: dots seeded on it get
  // kicked out to an arbitrary side, splitting the aux web above/below the
  // flow. Bias them one row below instead, where the reference figures hang
  // their aux webs (figure 9). The pull toward floatY stays a tie-breaker, so
  // a dot dragged above the band still stays put.
  const floatY = groupCount === 1 ? svgHeight / 2 + rowGap : svgHeight / 2;
  for (const d of nodes) {
    d.inFlow = d.group != null;
    d.gy = d.group == null
      ? floatY
      : svgHeight / 2 + (d.group - (groupCount - 1) / 2) * bandGap;
  }

  // Lay each band out as a direction-aware horizontal main row, dropping extra
  // flows onto rows below. Within a row, nodes are ordered by walking the flow
  // links (not by the order statements were written), so every pipe reads
  // left-to-right: inflows approach a stock from its left, outflows leave to
  // its right. A stock's FIRST inflow and FIRST outflow stay on its band; each
  // further dead-end flow becomes a branch on a row `rowGap` lower — an extra
  // outflow to the stock's lower right (pipe elbows down out of the stock,
  // then runs right), an extra inflow from its lower left (pipe runs right,
  // then elbows up into the stock's bottom). A two-in/two-out reservoir thus
  // matches the Meadows reference: rain/evaporation on the band, river
  // inflow/discharge on the row below. Every faucet still sits on a horizontal
  // pipe and nothing overlaps: each slot is wide enough for the node's icon,
  // label and collision radius; main rows are centred, branch rows hang off
  // their parent stock, and the auto-fit viewBox zooms to fit.
  const slotHalf = (d: Node) => {
    const icon = d.type === "stock" ? stockWidth / 2 : d.type === "cloud" ? cloudWidth / 2 : d.type === "dot" ? dotRadius : faucetWidth / 2;
    const collide = d.type === "stock" ? 62 : d.type === "cloud" ? 30 : d.type === "dot" ? 26 : 24;
    return Math.max(icon, displayLabel(d).length * 3, collide);
  };
  const slotPad = 10; // extra breathing room between adjacent slots

  // Flow adjacency in both directions, for walking chains and spotting branches.
  const outL = new Map<string, Link[]>();
  const inL = new Map<string, Link[]>();
  for (const l of links) {
    if (l.type !== "flow") continue;
    const o = outL.get(endId(l.source)) ?? [];
    o.push(l);
    outL.set(endId(l.source), o);
    const i = inL.get(endId(l.target)) ?? [];
    i.push(l);
    inL.set(endId(l.target), i);
  }
  // A dead-end branch hanging off a stock: from a faucet, follow the flow
  // downstream (an extra outflow draining away) or upstream (an extra inflow
  // fed from outside), bailing out (null) if it reaches a stock — such a chain
  // rejoins the main graph rather than dead-ending. Returns the member ids.
  const collectBranch = (rootId: string, dir: "up" | "down"): string[] | null => {
    const members: string[] = [];
    const seen = new Set<string>();
    const stack = [rootId];
    while (stack.length) {
      const x = stack.pop()!;
      if (seen.has(x)) continue;
      seen.add(x);
      const node = nodeById.get(x);
      if (!node) continue;
      if (node.type === "stock") return null;
      members.push(x);
      if (dir === "down") for (const l of outL.get(x) ?? []) stack.push(endId(l.target));
      else for (const l of inL.get(x) ?? []) stack.push(endId(l.source));
    }
    return members;
  };

  // Pull each stock's extra dead-end flows out into branch rows. The first
  // flow of each direction (source order) stays inline on the band; further
  // ones drop below, outflows branching to the right and inflows arriving from
  // the left, with in/out branch levels counted separately so an extra inflow
  // and an extra outflow share one row (as in the reference reservoir figure).
  const branchNodes = new Set<string>();
  const branches: { parent: Node, members: Node[], level: number, side: "in" | "out" }[] = [];
  const extractBranches = (d: Node, ls: Link[], dir: "up" | "down") => {
    const far = (l: Link) => dir === "down" ? endId(l.target) : endId(l.source);
    const sorted = ls.slice().sort((a, b) => parserId(far(a)) - parserId(far(b)));
    let level = 0;
    for (let i = 1; i < sorted.length; i++) {
      const l = sorted[i];
      if (!l) continue;
      const ids = collectBranch(far(l), dir);
      if (!ids) continue; // not a clean dead end — leave it inline on the row
      const members = ids.map(id => nodeById.get(id)).filter((n): n is Node => !!n);
      members.forEach(m => branchNodes.add(m.id));
      branches.push({ parent: d, members, level: ++level, side: dir === "down" ? "out" : "in" });
      l.elbow = true; // the stock<->faucet pipe draws as an elbow (see ticked)
    }
  };
  for (const d of nodes) {
    if (d.type !== "stock" || d.group == null) continue;
    extractBranches(d, outL.get(d.id) ?? [], "down");
    extractBranches(d, inL.get(d.id) ?? [], "up");
  }

  // Order a row's nodes by walking its flow links (Kahn's algorithm), so each
  // row reads left-to-right along the flow direction regardless of statement
  // order or writing direction (`<=` chains). Parser id breaks ties — and flow
  // cycles, where the walk restarts at the lowest remaining id.
  const flowOrder = (arr: Node[]): Node[] => {
    const ids = new Set(arr.map(d => d.id));
    const indeg = new Map(arr.map(d => [d.id, 0] as [string, number]));
    const succ = new Map<string, string[]>();
    for (const l of links) {
      if (l.type !== "flow") continue;
      const s = endId(l.source), t = endId(l.target);
      if (!ids.has(s) || !ids.has(t)) continue;
      indeg.set(t, (indeg.get(t) ?? 0) + 1);
      const a = succ.get(s) ?? [];
      a.push(t);
      succ.set(s, a);
    }
    const byId = arr.slice().sort((a, b) => parserId(a.id) - parserId(b.id));
    const order: Node[] = [];
    const placed = new Set<string>();
    while (order.length < arr.length) {
      const next = byId.find(d => !placed.has(d.id) && (indeg.get(d.id) ?? 0) <= 0)
        ?? byId.find(d => !placed.has(d.id));
      if (!next) break;
      placed.add(next.id);
      order.push(next);
      for (const t of succ.get(next.id) ?? []) indeg.set(t, (indeg.get(t) ?? 0) - 1);
    }
    return order;
  };

  // Slot a set of nodes onto a row from startX, left-to-right in flow order;
  // returns the row's right edge.
  const slotRow = (arr: Node[], startX: number) => {
    let cursor = startX;
    for (const d of flowOrder(arr)) {
      cursor += slotHalf(d);
      d.gx = cursor;
      cursor += slotHalf(d) + slotPad;
    }
    return cursor - slotPad;
  };
  // Total width a row of nodes will occupy, for right-aligning inflow branches.
  const rowWidth = (arr: Node[]) =>
    arr.reduce((w, d) => w + 2 * slotHalf(d), 0) + Math.max(0, arr.length - 1) * slotPad;

  // Main rows: every band member that isn't a branch node (or a dot), centred.
  const mainByBand = new Map<number, Node[]>();
  for (const d of nodes) {
    d.gx = undefined; // clear stale slots on recycled nodes
    if (d.group != null && d.type !== "dot" && !branchNodes.has(d.id)) {
      const arr = mainByBand.get(d.group) ?? [];
      arr.push(d);
      mainByBand.set(d.group, arr);
    }
  }
  for (const arr of mainByBand.values()) {
    const right = slotRow(arr, 0);
    const shift = svgWidth / 2 - right / 2; // centre the row on the canvas
    for (const d of arr) d.gx = (d.gx ?? 0) + shift;
  }
  // Branch rows: drop `level * rowGap` below the parent's band. An outflow
  // branch runs rightward from under the stock (elbow: down, then right); an
  // inflow branch ends just left of it, reading toward the stock (elbow:
  // right, then up into the stock's bottom). The elbow verticals sit a quarter
  // stock-width either side of centre, so an inflow and an outflow branch
  // sharing a row never share a pipe line.
  for (const b of branches) {
    const y = (b.parent.gy ?? svgHeight / 2) + b.level * rowGap;
    for (const d of b.members) d.gy = y;
    const px = b.parent.gx ?? svgWidth / 2;
    if (b.side === "out") slotRow(b.members, px + stockWidth / 4);
    else slotRow(b.members, px - stockWidth / 4 - rowWidth(b.members));
  }

  // Flow links render as thick gray straight pipes (Meadows notation); the
  // segment entering a stock/cloud carries the big triangular arrowhead — none
  // into a faucet, where the pipe visually passes through. Info links are thin
  // black curved arcs with a small head; their tails are bare — the source
  // node's own circle (dot, port) is the Meadows tail glyph.
  const styleLink = (sel: d3.Selection<SVGPathElement, Link, any, any>) => sel
    .attr("stroke", d => d.type === "flow" ? "#999" : "#000")
    .attr("stroke-width", d => d.type === "flow" ? 8 : 1.5)
    .attr("stroke-opacity", 1)
    // Explicit null sheds the old tail marker from recycled paths.
    .attr("marker-start", null)
    .attr("marker-end", d => {
      if (d.type !== "flow") return "url(#info-arrow)";
      const t = nodeById.get(d.target as string);
      return t && t.type !== "faucet" ? "url(#flow-arrow)" : null;
    });
  styleLink(flowLink);
  styleLink(infoLink);

  // A brand-new node starts life at (or near) where the layout wants it; d3
  // would otherwise spawn it on a small spiral at the ORIGIN — the top-left
  // corner. From there, same-row neighbours have to thread through each
  // other's collision discs to reach their slots and jam on the wrong side,
  // and the initial charge burst flings clumped floaters far off-canvas,
  // stranding the auto-fit viewBox zoomed out when alpha dies before the
  // easing catches up. Slotted nodes seed exactly at their slot; floaters
  // (dots) seed on the same phyllotaxis spiral d3 uses, centred one row below
  // the mean slot of the banded nodes they link to — the aux web hangs under
  // its own band, so a three-band model's floaters don't all pile onto the
  // canvas-centred float line beside the MIDDLE band and have to thread the
  // whole stack's collision discs to reach a band two gaps away (figure 25's
  // per-scenario fertility/mortality dots). With one band the fallthrough
  // (canvas mid-x, floatY) and the linked seed coincide. Only the spawn moves:
  // the force targets are untouched, so settled layouts, drags, and typing
  // edits (which recycle positions) behave exactly as before.
  const floatSeed = new Map<string, { x: number; y: number; n: number }>();
  for (const l of links) {
    const s = nodeById.get(endId(l.source)), t = nodeById.get(endId(l.target));
    if (!s || !t) continue;
    for (const [fl, banded] of [[s, t], [t, s]] as const) {
      if (fl.group != null || banded.gx == null || banded.gy == null) continue;
      const acc = floatSeed.get(fl.id) ?? { x: 0, y: 0, n: 0 };
      floatSeed.set(fl.id, { x: acc.x + banded.gx, y: acc.y + banded.gy, n: acc.n + 1 });
    }
  }
  // Ports spawn already pinned at their stock (ticked() re-pins them just
  // inside its border every frame); the fx/fy fix also keeps the link force
  // from reeling their arrow's far end toward an unplaced origin.
  for (const d of nodes) {
    if (d.type !== "port") continue;
    const p = d.portParent;
    if (d.x == null || d.y == null) {
      d.x = p?.x ?? p?.gx ?? svgWidth / 2;
      d.y = p?.y ?? p?.gy ?? svgHeight / 2;
    }
    d.fx = d.x;
    d.fy = d.y;
  }
  nodes.forEach((d, i) => {
    if (d.x != null || d.y != null) return;
    if (d.gx != null && d.gy != null) {
      d.x = d.gx;
      d.y = d.gy;
    } else {
      const r = 10 * Math.sqrt(0.5 + i), a = i * 2.399963229728653; // d3's spiral
      const seed = floatSeed.get(d.id);
      d.x = (seed ? seed.x / seed.n : svgWidth / 2) + r * Math.cos(a);
      d.y = (seed ? seed.y / seed.n + rowGap : d.gy ?? svgHeight / 2) + r * Math.sin(a);
    }
  });

  simulation.nodes(nodes);

  const linkForce = simulation.force<d3.ForceLink<Node, Link>>("link");
  if (!linkForce) {
    throw new Error("Link force is not defined in the simulation.");
  }
  linkForce.links(links);
  simulation.alpha(0.5).restart();

  // One accent assignment for ALL views — the editor's names, the diagram's
  // marks, the chart's lines and goal rules — keyed by node id here and by
  // NAME in nameColor (the compiler's identity rule: one name, one node),
  // so a node wears one color everywhere it appears. Stocks take the
  // palette slots in parser-id order; every other named node (dots,
  // faucets — clouds and ports are nameless) draws from the remaining
  // entries, also in first-appearance order. Every entry passes through the
  // text clamp, so the views agree on the same hex — not a pale sibling.
  // Past the palette (figure 25 alone names fifteen nodes) accents are
  // MINTED, never cycled: a golden-angle walk around the HCL hue wheel,
  // slightly darker than the palette band so a minted hue reads as its own
  // color, deterministic in assignment order so a model recolors the same
  // way every compile. Minted hues lack the palette's validated pair
  // separation, but every mark keeps its direct label — the color links
  // mentions, it never identifies alone. The coloring is identity, not
  // simulation state, so it is always on — numeric or not.
  const numeric = hasNumbers(system);
  const stockIds = nodes.filter(n => n.type === "stock").map(n => n.id)
    .sort((a, b) => parserId(a) - parserId(b));
  nameColor = new Map();
  const accentById = new Map<string, string>();
  let minted = 0;
  const mintAccent = () => d3.hcl(210 + 137.508 * minted++, 50, 42).formatHex();
  const assign = (n: Node | undefined, c: string) => {
    if (!n || n.label === "") return;
    accentById.set(n.id, textAccent(c));
    nameColor.set(n.label, textAccent(c));
  };
  const taken = new Set<string>();
  stockIds.forEach((id, i) => {
    const c = STOCK_PALETTE[i];
    if (c != null) taken.add(c);
    assign(nodeById.get(id), c ?? mintAccent());
  });
  const spare = STOCK_PALETTE.filter(c => !taken.has(c));
  nodes
    .filter(n => (n.type === "dot" || n.type === "faucet") && n.label !== "" && !nameColor.has(n.label))
    .sort((a, b) => parserId(a.id) - parserId(b.id))
    .forEach((n, i) => assign(n, spare[i] ?? mintAccent()));
  const colorOf = (id: string): string => accentById.get(id) ?? "#000";
  // The diagram wears the accents: stock rect strokes (as before, no longer
  // gated on the model being numeric), dot circles and their labels, and
  // faucet labels — the tap icon itself stays the black Meadows glyph, so
  // its label carries the color. Stock labels stay ink: the rect already
  // carries the accent, matching the chart's line-plus-label reading.
  nodeStock.select<SVGRectElement>("rect").attr("stroke", d => colorOf(d.id));
  nodeDot.select<SVGCircleElement>("circle").attr("stroke", d => colorOf(d.id));
  nodeDot.select<SVGTextElement>("text").attr("fill", d => colorOf(d.id));
  nodeFaucet.select<SVGTextElement>("text").attr("fill", d => colorOf(d.id));
  // Behavior-over-time panel (figure 6 to the diagram's figure 5): when the
  // model carries numbers and has a stock to plot, simulate it and draw the
  // chart through the same colorOf. Without numbers the panel clears to its
  // empty frame (numbers gate the PLOT, never the accents). The render goes
  // through refreshChart so the t= horizon field can re-run it without a
  // diagram update.
  lastChart = { system, colorOf, plottable: numeric && stockIds.length > 0 };
  refreshChart();

  // Carry the select tool's highlight and any in-progress loop chain across
  // this rebuild: drop ids that no longer exist (a delete, or a name edited
  // away), then repaint the glows on the recycled groups the joins rebound.
  for (const id of [...selected]) if (!nodeById.has(id)) selected.delete(id);
  loopChain = loopChain.filter(id => nodeById.has(id));
  renderSelection();
  renderLoopChain();

  // Path everything synchronously now. `linkForce.links()` above already
  // resolved each link's endpoints to seeded node objects, so ticked() can
  // draw a complete frame immediately — the animation ticks then take over.
  // Without this the delete-hit twins can sit with an empty `d` until the
  // first tick lands, leaving links briefly unclickable right after a load.
  ticked();
}

// How round the info arcs are: arc radius = chord length × this factor, so it
// fixes the arc's angular sweep regardless of distance. Must be ≥ 0.5:
//   0.5  -> semicircle (180°), maximum minor-arc roundness
//   0.55 -> ~131° arc, the pronounced swoop of the Meadows reference figure
//   0.6  -> ~113° arc
//   1.0  -> 60° arc, the gentle bend this app previously drew
// The same radius serves the MAJOR (large-flag) arcs used for same-band
// feedback loops, where roundness inverts: the balloon's apex sits
// (κ + √(κ²−¼)) × chord off the chord — ≈ 0.78 × chord at 0.55 — so the
// loop encloses real area instead of hugging the pipe it feeds back along.
const infoArcCurvature = 0.55;
const infoArcRadius = (chord: number) => chord * infoArcCurvature;

// A feedback arc between two members of the SAME band — figure 12's stock
// arrowing into its own faucet, figure 42's capital → depreciation — cannot
// read as a loop when drawn as a minor arc: it hugs the pipe connecting the
// two. Draw it as the major arc instead (the reference figures' balloon),
// leaving room for the R/B letter inside. Cross-band and floater arcs keep
// the minor bow. A port has no band group of its own — it sits inside its
// parent stock, so the same-band test reads the parent's group (otherwise
// every stock-anchored feedback balloon would collapse to a hugging arc).
const bandOf = (n: Node): number | null | undefined =>
  n.type === "port" ? n.portParent?.group : n.group;
const arcLarge = (s: Node, t: Node): 0 | 1 => {
  const sg = bandOf(s), tg = bandOf(t);
  return sg != null && sg === tg ? 1 : 0;
};

// The info-link arc is an arc of the circle of radius `infoArcRadius(chord)`
// through both endpoints, drawn with the given sweep and large-arc flags.
// Move both endpoints along that same circle — start forward by `mStart`,
// end back by `mEnd` arc-pixels — so the shortened path still lies exactly
// on the original arc and both markers orient to their true tangents.
// The two circle centers mirror across the chord: for a minor arc the
// sweep-1 center sits at w = +1 opposite the bulge (sweep-0 mirrors it);
// a major arc uses the other center, putting it inside the balloon. Angular
// travel runs in the direction of `w` for either arc, so the start advances
// by +w and the end backs up by -w arc-pixels.
function trimArc(sx: number, sy: number, tx: number, ty: number, mStart: number, mEnd: number, sweep: 0 | 1, large: 0 | 1 = 0): { start: { x: number, y: number }, end: { x: number, y: number } } {
  const untrimmed = { start: { x: sx, y: sy }, end: { x: tx, y: ty } };
  const dx = tx - sx, dy = ty - sy;
  const d = Math.hypot(dx, dy);
  const r = infoArcRadius(d);
  // Path length available for trimming: a minor arc has roughly its chord,
  // a major arc the rest of its circle.
  const arcLen = large ? r * (2 * Math.PI - 2 * Math.asin(Math.min(1, d / (2 * r)))) : d;
  if (arcLen < mStart + mEnd + 8) return untrimmed; // too short to trim
  const mx = (sx + tx) / 2, my = (sy + ty) / 2;
  const h = Math.sqrt(Math.max(0, r * r - (d / 2) * (d / 2)));
  const ux = dx / d, uy = dy / d;
  const w = sweep === 1 ? 1 : -1;
  const cSide = large ? 1 : -1;
  const cx = mx + cSide * w * uy * h, cy = my - cSide * w * ux * h;
  const a0 = Math.atan2(sy - cy, sx - cx);
  const a1 = Math.atan2(ty - cy, tx - cx);
  const as = a0 + w * (mStart / r); // arc length -> angle, along travel
  const ae = a1 - w * (mEnd / r);
  return {
    start: { x: cx + r * Math.cos(as), y: cy + r * Math.sin(as) },
    end: { x: cx + r * Math.cos(ae), y: cy + r * Math.sin(ae) },
  };
}

// Bulge apex of the candidate arc for a sweep flag: the arc's midpoint sits
// perpendicular to the chord off its midpoint — (r - h) out for a minor arc,
// (r + h) for a major one (same side; the balloon just reaches further) —
// sweep 1 on one side, sweep 0 mirrored. Used to score which side has more
// room, and to park a two-member loop's letter inside its balloon.
function arcBulge(sx: number, sy: number, tx: number, ty: number, sweep: 0 | 1, large: 0 | 1 = 0): { x: number, y: number } | null {
  const dx = tx - sx, dy = ty - sy;
  const d = Math.hypot(dx, dy);
  if (d === 0) return null;
  const r = infoArcRadius(d);
  const h = Math.sqrt(Math.max(0, r * r - (d / 2) * (d / 2)));
  const off = large ? r + h : r - h;
  const ux = dx / d, uy = dy / d;
  const w = sweep === 1 ? 1 : -1;
  return { x: (sx + tx) / 2 + w * uy * off, y: (sy + ty) / 2 - w * ux * off };
}

function ticked() {
  // Pin each port just inside its stock's border, facing its arrow's far
  // endpoint; a stock's several ports spread apart along that inset boundary
  // so their arcs stay individually anchored (figure 42's capital carries
  // three). Ports are fx/fy-fixed satellites, so the forces never fight this
  // placement — the pin simply follows the stock as it settles or drags.
  const portsByStock = new Map<string, Node[]>();
  for (const d of simulation.nodes()) {
    if (d.type !== "port" || !d.portParent) continue;
    const arr = portsByStock.get(d.portParent.id) ?? [];
    arr.push(d);
    portsByStock.set(d.portParent.id, arr);
  }
  const portInsetX = stockWidth / 2 - 10, portInsetY = stockHeight / 2 - 10;
  const portMinSep = 0.5; // radians between neighboring ports of one stock
  const labelClear = 12;  // half-height of the label band across the rect's middle
  for (const ports of portsByStock.values()) {
    const p = ports[0]!.portParent!;
    const px = p.x ?? 0, py = p.y ?? 0;
    // A hand-dragged port keeps its recorded bearing; the rest face their
    // arrow's far endpoint.
    const placed = ports
      .map(d => ({
        d,
        pinned: d.portAngle != null,
        a: d.portAngle ?? Math.atan2((d.portFar?.y ?? py) - py, (d.portFar?.x ?? px + 1) - px),
      }))
      .sort((u, v) => u.a - v.a || u.d.id.localeCompare(v.d.id));
    // Spread near-coincident bearings apart (cyclic; a few passes suffice
    // for the handful of ports a stock carries). Hand-placed ports stay put:
    // their automatic neighbors do the yielding.
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < placed.length; i++) {
        const u = placed[i]!, v = placed[(i + 1) % placed.length]!;
        if (u === v) continue;
        const gap = v.a - u.a + (i === placed.length - 1 ? 2 * Math.PI : 0);
        if (gap >= portMinSep) continue;
        const push = portMinSep - gap;
        if (u.pinned && !v.pinned) v.a += push;
        else if (v.pinned && !u.pinned) u.a -= push;
        else {
          u.a -= push / 2;
          v.a += push / 2;
        }
      }
    }
    for (const { d, a } of placed) {
      const ca = Math.cos(a), sa = Math.sin(a);
      const onSide = Math.abs(ca) / portInsetX >= Math.abs(sa) / portInsetY;
      const scale = 1 / Math.max(Math.abs(ca) / portInsetX, Math.abs(sa) / portInsetY);
      let ox = ca * scale, oy = sa * scale;
      // The stock's label runs across the rect's vertical middle (and can
      // overflow it horizontally), so a port landing on a left/right edge
      // dodges that band — sliding along the edge, away from the text.
      if (onSide && Math.abs(oy) < labelClear) oy = oy > 0 ? labelClear : -labelClear;
      d.x = d.fx = px + ox;
      d.y = d.fy = py + oy;
    }
  }

  nodeDot.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  nodeStock.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  nodeFaucet.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  nodeCloud.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  nodePort.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  // A loop letter parks at the mean of its loop's drawn boundary — each
  // member-to-member pipe contributes its midpoint, each info arc its bulge
  // apex (current bow side, balloons included) — which sits inside the
  // enclosed region even when a wide stock rect pulls the member centroid
  // onto its own body (figure 15's B sat on the stock's corner). A loop
  // with no member-to-member links falls back to the member centroid.
  loopLabel.attr("transform", d => {
    let px = 0, py = 0, pn = 0;
    for (const l of d.edges) {
      const s = l.source, t = l.target;
      if (typeof s !== "object" || s === null || typeof t !== "object" || t === null) continue;
      const sx = (s as Node).x ?? 0, sy = (s as Node).y ?? 0;
      const tx = (t as Node).x ?? 0, ty = (t as Node).y ?? 0;
      const p = l.type === "flow"
        ? { x: (sx + tx) / 2, y: (sy + ty) / 2 }
        : arcBulge(sx, aimY(s as Node), tx, aimY(t as Node), l.sweep ?? 1, arcLarge(s as Node, t as Node));
      if (p) { px += p.x; py += p.y; pn++; }
    }
    if (pn > 0) return `translate(${px / pn},${py / pn})`;
    const n = d.members.length || 1;
    const cx = d.members.reduce((acc, m) => acc + (m.x ?? 0), 0) / n;
    const cy = d.members.reduce((acc, m) => acc + (m.y ?? 0), 0) / n;
    return `translate(${cx},${cy})`;
  });

  // Each info arc bows away from the nearest clutter: score both candidate
  // bulge apexes by their clearance to the nearest uninvolved node and keep
  // the roomier side. Without this the sweep flag was a constant, so the bow
  // side was an accident of chord direction — a dot dragged above its band
  // got arcs sagging back down into the band. Hysteresis keeps near-ties
  // from flickering while the simulation jiggles; ties keep the legacy side.
  const sweepHysteresis = 16;
  const obstacles = simulation.nodes();
  infoLink.each(d => {
    const s = d.source as Node, t = d.target as Node;
    const sx = s.x ?? 0, sy = aimY(s), tx = t.x ?? 0, ty = aimY(t);
    const clearance = (b: { x: number, y: number } | null) => {
      if (!b) return 0;
      let min = Infinity;
      for (const n of obstacles) {
        if (n === s || n === t) continue;
        min = Math.min(min, Math.hypot((n.x ?? 0) - b.x, (n.y ?? 0) - b.y));
      }
      return min;
    };
    const large = arcLarge(s, t);
    const c1 = clearance(arcBulge(sx, sy, tx, ty, 1, large));
    const c0 = clearance(arcBulge(sx, sy, tx, ty, 0, large));
    if (d.sweep === undefined) d.sweep = c0 > c1 ? 0 : 1;
    else if ((d.sweep === 1 ? c0 - c1 : c1 - c0) > sweepHysteresis) d.sweep = d.sweep === 1 ? 0 : 1;
  });

  const pathFor = (d: Link) => {
      const source = d.source as Node;
      const target = d.target as Node;
      const sx = source.x ?? 0, sy = source.y ?? 0;
      const tx = target.x ?? 0, ty = target.y ?? 0;
      const dx = tx - sx, dy = ty - sy;
      const dr = Math.hypot(dx, dy);
      if (dr === 0) return `M${sx},${sy}L${tx},${ty}`;
      if (d.type === "flow") {
        // Branch connectors keep every faucet on a horizontal pipe (not a
        // slope). An extra OUTflow — stock on the band feeding a faucet on the
        // row below — drops out of the stock's bottom, then turns right
        // through its faucet (faucet target, so no head to trim). An extra
        // INflow — faucet on the row below feeding the stock — runs right from
        // its faucet, then turns up into the stock's bottom, stopping an
        // arrowhead short of the edge so the head's tip lands exactly on it.
        // The verticals are offset a quarter stock-width right/left of centre
        // respectively, so opposite branches never overlap their pipes.
        if (d.elbow && source.type === "stock" && target.type === "faucet") {
          const ex = sx + stockWidth / 4;
          return `M${ex},${sy + stockHeight / 2}L${ex},${ty}L${tx},${ty}`;
        }
        if (d.elbow && source.type === "faucet" && target.type === "stock") {
          const ex = tx - stockWidth / 4;
          return `M${sx},${sy}L${ex},${sy}L${ex},${ty + stockHeight / 2 + flowArrowLength}`;
        }
        // Straight pipe. The line stops at the arrowhead's BASE (marker refX
        // 0), so reservoir targets are trimmed by node edge + head length and
        // the tip lands on the node's edge. Faucet ends stay untrimmed — the
        // faucet icon sits on top of the pipe.
        const st = source.type === "faucet" ? 0 : edgeOf(source);
        const tt = target.type === "faucet" ? 0 : edgeOf(target) + flowArrowLength;
        const f = dr > st + tt + 6 ? 1 : dr / (st + tt + 6); // degenerate: scale down
        const ux = dx / dr, uy = dy / dr;
        return `M${sx + ux * st * f},${sy + uy * st * f}L${tx - ux * tt * f},${ty - uy * tt * f}`;
      }
      // Info arc: move both endpoints along the arc's own circle so the tail
      // starts at the source's edge and the small head lands at the target's,
      // instead of buried under the shapes. The radius must match trimArc's.
      const sweep = d.sweep ?? 1;
      const large = arcLarge(source, target);
      const asy = aimY(source), aty = aimY(target);
      const r = infoArcRadius(Math.hypot(tx - sx, aty - asy));
      const a = trimArc(sx, asy, tx, aty, edgeOf(source), edgeOf(target) + infoArrowLength, sweep, large);
      return `M${a.start.x},${a.start.y}A${r},${r} 0 ${large},${sweep} ${a.end.x},${a.end.y}`;
  };
  flowLink.attr("d", pathFor);
  infoLink.attr("d", pathFor);
  linkHit.attr("d", pathFor);

  easeView();
}

// One easing step of the viewBox toward its current target: the union of the
// nominal canvas and the padded node bbox — the auto-fit, which on its own
// only ever zooms OUT so all nodes stay visible — scaled about its center by
// the button-driven userZoom (>1 = closer; nodes may then clip past the
// panel, which is the point of zooming in) and shifted by the drag-driven
// pan offset (panX/panY). Pads follow each node's own
// size; the x-pad also grows with the label so wide names ("yield per unit
// capital") never clip — ~3px per char ≈ half the rendered width at
// font-size 10; the y-pad leaves room for the labels that sit above dots and
// faucets. Runs every simulation tick, and from the zoom buttons' timer
// while the simulation is idle; returns true once within half a pixel of
// the target, so that timer knows when to stop.
function easeView(): boolean {
  let x0 = 0, y0 = 0, x1 = svgWidth, y1 = svgHeight;
  for (const d of simulation.nodes()) {
    if (d.x == null || d.y == null) continue;
    const padX = Math.max(edgeOf(d) + 12, displayLabel(d).length * 3);
    const padY = edgeOf(d) + 24 + (d.type === "faucet" ? faucetLift : 0);
    x0 = Math.min(x0, d.x - padX); y0 = Math.min(y0, d.y - padY);
    x1 = Math.max(x1, d.x + padX); y1 = Math.max(y1, d.y + padY);
  }
  // A same-band feedback balloon swings well past its endpoint nodes, so an
  // outer band's loop would clip at the canvas edge — union the major arcs'
  // bulge apexes too (the loop letter parks inside the balloon, so this
  // covers it as well).
  infoLink.each(d => {
    const s = d.source as Node, t = d.target as Node;
    if (!arcLarge(s, t)) return;
    const b = arcBulge(s.x ?? 0, aimY(s), t.x ?? 0, aimY(t), d.sweep ?? 1, 1);
    if (!b) return;
    x0 = Math.min(x0, b.x - 12); y0 = Math.min(y0, b.y - 12);
    x1 = Math.max(x1, b.x + 12); y1 = Math.max(y1, b.y + 12);
  });
  const tw = (x1 - x0) / userZoom;
  const th = (y1 - y0) / userZoom;
  const tx = (x0 + x1 - tw) / 2 + panX;
  const ty = (y0 + y1 - th) / 2 + panY;
  const ease = 0.2;
  viewX += (tx - viewX) * ease;
  viewY += (ty - viewY) * ease;
  viewW += (tw - viewW) * ease;
  viewH += (th - viewH) * ease;
  svg.attr("viewBox", `${viewX} ${viewY} ${viewW} ${viewH}`);
  return Math.max(Math.abs(tx - viewX), Math.abs(ty - viewY),
    Math.abs(tw - viewW), Math.abs(th - viewH)) < 0.5;
}

// The zoom buttons animate through the same easing while the simulation is
// idle (ticked() only fires while it runs): a self-stopping frame timer. If
// the simulation IS running, both step toward the same target — the glide
// just lands sooner; they never fight.
let zoomEaseTimer: d3.Timer | null = null;
function ensureViewEase() {
  if (zoomEaseTimer) return;
  zoomEaseTimer = d3.timer(() => {
    if (easeView()) {
      zoomEaseTimer?.stop();
      zoomEaseTimer = null;
    }
  });
}

// Dragging empty canvas pans the view: the whole diagram follows the cursor.
// The pan is an offset on easeView()'s auto-fit target (panX/panY, viewBox
// user units), so it rides along as the layout settles and composes with the
// zoom buttons; the "1×" reset clears it back to the auto-fit framing. Node
// and port drags stopPropagation on pointerdown, so grabbing a shape starts
// that gesture instead of a pan. Pixel deltas convert to user units through
// the live CTM scale (the letterboxed viewBox's own screen scale), so a
// grabbed point tracks the cursor 1:1 at any zoom. Like the zoom buttons it
// eases toward the new target via ensureViewEase() rather than writing the
// viewBox itself, keeping easeView() the sole viewBox owner.
function canvasPan() {
  return d3.drag<SVGSVGElement, unknown>()
    // A slightly jittery click still counts as a click (fires placement)
    // rather than being swallowed as a 2px pan.
    .clickDistance(4)
    .on("start", () => { svg.classed("panning", true); })
    .on("drag", (event) => {
      const ctm = svg.node()?.getScreenCTM();
      if (!ctm || !ctm.a || !ctm.d) return;
      panX -= event.dx / ctm.a;
      panY -= event.dy / ctm.d;
      ensureViewEase();
    })
    .on("end", () => { svg.classed("panning", false); });
}

// Arm (or toggle off) a palette picker. Arming resets any half-done link
// pick; the hint card narrates the next click and the canvas cursor flips
// to the placement crosshair.
const armHint: Record<ToolName, string> = {
  dot: 'click the canvas to place a dot',
  stock: 'click the canvas to place a stock',
  faucet: 'click the canvas to place a flow',
  cloud: 'click the canvas to place a cloud',
  arrow: 'pick the arrow source node',
  flow: 'pick the flow source: a stock, a faucet, or empty canvas',
  reinforcing: 'reinforcing loop: click its nodes in order',
  balancing: 'balancing loop: click its nodes in order',
  select: 'click nodes to select; click canvas to clear',
  delete: 'click a node or a link to delete it (and the statement behind it)',
};
function armTool(tool: ToolName): void {
  if (armedTool === tool) return disarmTool();
  armedTool = tool;
  linkSource = null;
  loopChain = [];
  renderLoopChain();
  palette.selectAll<HTMLButtonElement, ToolName>('button').classed('active', d => d === tool);
  svg.classed('placing', true);
  // Only the delete tool makes links clickable (see the .delete-armed CSS).
  svg.classed('delete-armed', tool === 'delete');
  // Arming delete with a selection already standing announces the batch it
  // will remove; select announces its running count.
  if (tool === 'select') setHint(selectHint());
  else if (tool === 'delete' && selected.size) setHint(`click a selected node to delete all ${selected.size}, or any node to delete it`);
  else setHint(armHint[tool]);
}
function disarmTool(): void {
  armedTool = null;
  linkSource = null;
  loopChain = [];
  renderLoopChain();
  palette.selectAll('button').classed('active', false);
  svg.classed('placing', false);
  svg.classed('delete-armed', false);
  setHint(null);
}
function setHint(text: string | null): void {
  if (text == null) paletteHint.style('display', 'none').text('');
  else paletteHint.style('display', null).text(text);
}

// Mint a fresh node name for a placement — the first free "<prefix>N", the
// digit glued to the word ("stock 1" would lex as a name then a number).
// Checked against the compiled graph's labels AND the raw editor text, so a
// draft that doesn't compile yet still can't collide-and-coalesce.
function mintName(prefix: string): string {
  const labels = new Set(simulation.nodes().map(n => n.label));
  const text = textInput.node()?.value ?? '';
  for (let i = 1; ; i++) {
    const name = `${prefix}${i}`;
    if (!labels.has(name) && !new RegExp(`(^|[^a-z0-9])${name}([^a-z0-9]|$)`, 'i').test(text)) {
      return name;
    }
  }
}

// A placement is a text edit: append the statement and dispatch the editor's
// own input event, so compile, diagram recycle, accents, highlight, and the
// chart all refresh through the one path typing uses.
function appendStatement(stmt: string): void {
  const ta = textInput.node();
  if (!ta) return;
  const sep = ta.value === '' || ta.value.endsWith('\n') ? '' : '\n';
  textInput.property('value', ta.value + sep + stmt + '\n');
  ta.dispatchEvent(new Event('input'));
}

// Pin a just-placed node at its drop point — the same fx/fy pin a hand drag
// writes, so clicking the node later releases it. The lookup runs after the
// dispatch compiled and update() rebuilt the simulation; if the placement
// landed in a draft that doesn't compile, there is nothing to pin yet and
// the statement simply waits in the text.
function pinPlaced(n: Node | undefined, x: number, y: number): void {
  if (!n) return;
  n.x = x;
  n.y = y;
  n.fx = x;
  n.fy = y;
}
const nodeByLabel = (label: string): Node | undefined =>
  simulation.nodes().find(n => n.label === label);

// An armed canvas click. Node tools append their one-statement spelling and
// pin the new node at the drop point; the flow tool reads a canvas click as
// a cloud endpoint (spelled `|`); the arrow tool has no canvas reading.
function placeAt(x: number, y: number): void {
  switch (armedTool) {
    case 'dot': {
      const name = mintName('dot');
      appendStatement(name);
      pinPlaced(nodeByLabel(name), x, y);
      return disarmTool();
    }
    case 'stock': {
      const name = mintName('stock');
      appendStatement(`[${name}]`);
      pinPlaced(nodeByLabel(name), x, y);
      return disarmTool();
    }
    case 'faucet': {
      // A faucet can't stand alone (`=>f` needs a source term), so it comes
      // with the minimal single SOURCE cloud: `| =>f`, a tap fed from a
      // cloud with an open output. One cloud, one statement — wire the
      // output to a stock (or a second cloud) with the flow tool. Pin the
      // tap at the drop point and its source cloud to the left, so the pipe
      // reads left→right.
      const name = mintName('flow');
      const before = new Set(simulation.nodes().filter(n => n.type === 'cloud').map(n => n.id));
      appendStatement(`| =>${name}`);
      pinPlaced(nodeByLabel(name), x, y);
      const fresh = simulation.nodes().find(n => n.type === 'cloud' && !before.has(n.id));
      if (fresh) pinPlaced(fresh, x - stockWidth, y); // source cloud, left
      return disarmTool();
    }
    case 'cloud': {
      // Clouds are anonymous — find the placed one by diffing ids.
      const before = new Set(simulation.nodes().filter(n => n.type === 'cloud').map(n => n.id));
      appendStatement('|');
      pinPlaced(simulation.nodes().find(n => n.type === 'cloud' && !before.has(n.id)), x, y);
      return disarmTool();
    }
    case 'flow':
      if (linkSource == null) {
        linkSource = { x, y };
        setHint('pick the flow target: a stock, a faucet, or empty canvas');
      } else {
        completeFlow(linkSource, { x, y });
      }
      return;
    case 'arrow':
      setHint('arrows link named nodes — pick a dot, a stock, or a faucet');
      return;
    case 'select':
      // Empty-canvas click clears the running selection (the marquee's
      // "click away to deselect").
      if (selected.size) {
        selected.clear();
        renderSelection();
      }
      setHint(selectHint());
      return;
    case 'delete':
      setHint(selected.size
        ? `click a selected node to delete all ${selected.size}, or any node to delete it`
        : armHint.delete);
      return;
    case 'reinforcing':
    case 'balancing':
      // Empty-canvas click closes the loop (an alternative to clicking back
      // to a picked node, or pressing Enter).
      commitLoop();
      return;
  }
}

// A node click while a link tool is armed picks the link's next endpoint
// (drag()'s no-move path routes here instead of releasing the pin).
function pickLinkEnd(d: Node): void {
  if (armedTool === 'arrow') {
    if (d.type !== 'dot' && d.type !== 'stock' && d.type !== 'faucet') {
      setHint('arrows link named nodes — pick a dot, a stock, or a faucet');
    } else if (linkSource == null) {
      linkSource = d;
      setHint('pick the arrow target node');
    } else if (isNodeEnd(linkSource) && linkSource.id === d.id) {
      setHint('that is the source — pick a different node');
    } else if (isNodeEnd(linkSource)) {
      // Bare names: the registry resolves a mention to the one node the name
      // already is, whatever its kind (stocks included — figure 8's
      // `stock2 -> outflow`).
      appendStatement(`${linkSource.label} -> ${d.label}`);
      disarmTool();
    }
  } else if (armedTool === 'flow') {
    if (d.type !== 'stock' && d.type !== 'faucet') {
      setHint('flows connect stocks and faucets — click empty canvas for a cloud');
    } else if (linkSource == null) {
      linkSource = d;
      setHint('pick the flow target: a stock, a faucet, or empty canvas');
    } else if (isNodeEnd(linkSource) && linkSource.id === d.id) {
      setHint('that is the source — pick a different node');
    } else {
      completeFlow(linkSource, d);
    }
  }
}

// Write the flow statement for a picked source→target pair, each end a
// stock, a faucet, or a canvas point (a new cloud, spelled `|`). Between
// stocks/clouds a fresh faucet is minted (`[a] =>flow1 [b]` — a flow IS a
// faucet); an existing faucet endpoint is re-mentioned instead — `[a] =>f`
// gives f another source, `[b] <=f` another target (the registry makes the
// name the same tap; both source-only and target-only mentions parse).
// Faucet-to-faucet has no pipe spelling — one end must hold the vessel.
// Fresh clouds pin at their clicked canvas points: their ids arrive in
// parser order, which is statement order, so the two lists zip.
function completeFlow(src: Node | CanvasEnd, tgt: Node | CanvasEnd): void {
  const srcFaucet = isNodeEnd(src) && src.type === 'faucet';
  const tgtFaucet = isNodeEnd(tgt) && tgt.type === 'faucet';
  if (srcFaucet && tgtFaucet) {
    setHint('a pipe cannot join two faucets — one end must be a stock or canvas');
    return;
  }
  const spell = (e: Node | CanvasEnd): string => (isNodeEnd(e) ? `[${e.label}]` : '|');
  const canvasPins: CanvasEnd[] = [];
  const pushCanvas = (e: Node | CanvasEnd) => { if (!isNodeEnd(e)) canvasPins.push(e); };
  let stmt: string;
  if (srcFaucet) {
    pushCanvas(tgt);
    stmt = `${spell(tgt)} <=${(src as Node).label}`;
  } else if (tgtFaucet) {
    pushCanvas(src);
    stmt = `${spell(src)} =>${(tgt as Node).label}`;
  } else {
    pushCanvas(src);
    pushCanvas(tgt);
    stmt = `${spell(src)} =>${mintName('flow')} ${spell(tgt)}`;
  }
  const before = new Set(simulation.nodes().filter(n => n.type === 'cloud').map(n => n.id));
  appendStatement(stmt);
  simulation.nodes()
    .filter(n => n.type === 'cloud' && !before.has(n.id))
    .sort((a, b) => parserId(a.id) - parserId(b.id))
    .forEach((c, i) => {
      const p = canvasPins[i];
      if (p) pinPlaced(c, p.x, p.y);
    });
  disarmTool();
}

// The select tool's running-count hint.
const selectHint = (): string =>
  selected.size
    ? `${selected.size} selected — click more, click canvas to clear, then arm delete`
    : 'click nodes to select; click canvas to clear';

// A node click while the select tool is armed toggles it in the selection
// (drag()'s no-move path routes here). Ports are structural — not selectable.
function toggleSelect(d: Node): void {
  if (d.type === 'port') {
    setHint('ports are drawn automatically — select a dot, stock, faucet, or cloud');
    return;
  }
  if (selected.has(d.id)) selected.delete(d.id);
  else selected.add(d.id);
  renderSelection();
  setHint(selectHint());
}

// Paint the current selection: the glow filter rides every node group whose
// id is in the set. Called on each toggle and at the end of update() (the
// joins rebind data, so recycled groups need the class reapplied). Ports
// carry no selection.
function renderSelection(): void {
  for (const sel of [nodeDot, nodeStock, nodeFaucet, nodeCloud]) {
    sel.classed('selected', (d: Node) => selected.has(d.id));
  }
}

// The loop tools (reinforcing/balancing) trace a feedback path: each node
// click appends to `loopChain`, and clicking a node already in the chain (or
// empty canvas, or Enter) closes it into an `R(...)`/`B(...)` annotation.
// Only named nodes carry a loop tag — clouds are anonymous, ports structural.
function pickLoopNode(d: Node): void {
  if (d.type !== 'dot' && d.type !== 'stock' && d.type !== 'faucet') {
    setHint('loops run through named nodes — pick a dot, a stock, or a faucet');
    return;
  }
  // Clicking a node already in the chain closes the loop there (the natural
  // "click back to the start" gesture), as long as there are ≥2 members.
  if (loopChain.includes(d.id)) {
    if (loopChain.length >= 2) commitLoop();
    else setHint('a loop needs at least two nodes — pick another');
    return;
  }
  loopChain.push(d.id);
  renderLoopChain();
  setHint(loopHint());
}

// The running hint for a loop tool: the chain so far, in the letter of the
// armed kind, with how to finish.
function loopHint(): string {
  const kind = armedTool === 'balancing' ? 'B' : 'R';
  const names = loopChain.map(id => labelById.get(id) ?? '?');
  if (names.length === 0) return `${kind} loop: click its nodes in order`;
  const chain = names.join(' → ');
  if (names.length < 2) return `${kind}(${chain} → …) — pick the next node`;
  return `${kind}(${chain}) — click a picked node, canvas, or Enter to close`;
}

// Paint the in-progress loop chain with the loop-pick glow (distinct from the
// select tool's). Called on each pick and at the end of update().
function renderLoopChain(): void {
  const picked = new Set(loopChain);
  for (const sel of [nodeDot, nodeStock, nodeFaucet]) {
    sel.classed('loop-pick', (d: Node) => picked.has(d.id));
  }
}

// Close the current loop chain into a statement. Needs ≥2 members; writes
// `R(a -> b -> c)` / `B(...)` with the members in click order (the info
// arrows it implies dedup against any already drawn), then disarms.
function commitLoop(): void {
  if (loopChain.length < 2) {
    setHint('a loop needs at least two nodes — keep picking, or Esc to cancel');
    return;
  }
  const kind = armedTool === 'balancing' ? 'B' : 'R';
  const names = loopChain.map(id => labelById.get(id)).filter((n): n is string => n != null);
  if (names.length < 2) { disarmTool(); return; }
  appendStatement(`${kind}(${names.join(' -> ')})`);
  disarmTool();
}

// A node click while the delete tool is armed. Clicking a member of the
// standing selection removes the WHOLE selection; clicking anything else
// removes just that node. Either way, removal is line-based (see
// linesNaming) and the tool disarms after — deletion is destructive, so it
// is one-shot (re-arm, or select-then-delete for a batch).
function deleteAt(d: Node): void {
  if (d.type === 'port') {
    setHint('ports are drawn automatically — delete the stock or the arrow instead');
    return;
  }
  const targets = selected.has(d.id) ? [...selected] : [d.id];
  deleteNodes(targets);
  disarmTool();
}

// Remove a set of nodes from the model by deleting every source LINE that
// names any of them, then dispatching the editor's own input event (so
// compile, diagram, accents, highlight, and chart all refresh through the
// typing path — the text stays the one source of truth). Line-based rather
// than token-surgical: it can never leave a half-statement that fails to
// parse. A named node's lines are found by compiling each line alone and
// matching its label (multi-word-safe, substring-proof — the lexer does the
// tokenizing); an anonymous cloud maps to the source `|` at its ordinal
// (cloud ids run in `|`-token order). Ports carry no text and are skipped.
function deleteNodes(ids: string[]): void {
  const ta = textInput.node();
  if (!ta) return;
  const lines = ta.value.split('\n');
  const nodes = simulation.nodes();
  const byId = new Map(nodes.map(n => [n.id, n] as [string, Node]));
  const cloudIds = nodes.filter(n => n.type === 'cloud').map(n => n.id)
    .sort((a, b) => parserId(a) - parserId(b));

  const labels = new Set<string>();
  const cloudRanks: number[] = [];
  for (const id of ids) {
    const n = byId.get(id);
    if (!n || n.type === 'port') continue;
    if (n.type === 'cloud') {
      const rank = cloudIds.indexOf(id);
      if (rank >= 0) cloudRanks.push(rank);
    } else if (n.label) {
      labels.add(n.label);
    }
  }

  const remove = new Set<number>();
  // Named nodes: a line names the target when its solo compilation yields a
  // node with that label. A line of a compiling model always parses alone
  // (statements are newline-independent); a stray non-compiling line just
  // matches nothing.
  if (labels.size) {
    lines.forEach((line, i) => {
      if (line.trim() === '') return;
      try {
        const r = JSON.parse(interpreter.go(line)) as unknown;
        if (r && typeof r === 'object' && Array.isArray((r as System).nodes) &&
            (r as System).nodes.some(nd => labels.has(nd.label))) {
          remove.add(i);
        }
      } catch { /* a line that won't parse names nothing */ }
    });
  }
  // Clouds: the k-th `|` character across the source (top-to-bottom) is the
  // k-th cloud by ascending id; remove the line it sits on.
  if (cloudRanks.length) {
    const lineOfPipe: number[] = [];
    lines.forEach((line, i) => { for (const ch of line) if (ch === '|') lineOfPipe.push(i); });
    for (const rank of cloudRanks) {
      const li = lineOfPipe[rank];
      if (li != null) remove.add(li);
    }
  }

  if (remove.size === 0) {
    setHint('nothing in the text to delete for that item');
    return;
  }
  selected.clear();
  textInput.property('value', lines.filter((_, i) => !remove.has(i)).join('\n'));
  ta.dispatchEvent(new Event('input'));
}

// A link click while the delete tool is armed (routed from the link-hit
// twin). Removes every source LINE that draws a link between the same
// logical endpoints (a stock resolved through its port), same direction and
// kind (flow vs arrow) — the same line-based, whole-statement removal as
// nodes. So a flow pipe takes its faucet's whole statement (a flow is a
// unit; a lone pipe can't be spelled), and an arrow that a formula or loop
// draws takes that statement (consistent with deleting a node the formula
// names). Matching by resolved LABELS keeps it robust across the per-line
// recompile's fresh ids. Then disarms (one-shot, like node delete).
function deleteLink(l: Link): void {
  const ta = textInput.node();
  if (!ta) return;
  const byId = new Map(simulation.nodes().map(n => [n.id, n] as [string, Node]));
  // A link's logical endpoint label: an info arrow's stock end is a port,
  // whose parent stock is the real endpoint.
  const endLabel = (e: Link["source"]): string | undefined => {
    const n = typeof e === "object" && e !== null ? e as Node : byId.get(String(e));
    if (!n) return undefined;
    return n.type === "port" && n.parent != null ? byId.get(n.parent)?.label : n.label;
  };
  const sL = endLabel(l.source), tL = endLabel(l.target), ty = l.type;
  if (sL == null || tL == null) { setHint("could not resolve that link"); return; }

  const lines = ta.value.split("\n");
  const remove = new Set<number>();
  lines.forEach((line, i) => {
    if (line.trim() === "") return;
    try {
      const r = JSON.parse(interpreter.go(line)) as System;
      if (!r || !Array.isArray(r.nodes) || !Array.isArray(r.links)) return;
      const m = new Map(r.nodes.map(n => [n.id, n] as [string, Node]));
      const lg = (id: string): string | undefined => {
        const n = m.get(id);
        return n && n.type === "port" && n.parent != null ? m.get(n.parent)?.label : n?.label;
      };
      if (r.links.some(k => k.type === ty
          && lg(k.source as string) === sL && lg(k.target as string) === tL)) {
        remove.add(i);
      }
    } catch { /* a non-parsing line draws nothing */ }
  });

  if (remove.size === 0) {
    setHint(ty === "flow"
      ? "that pipe belongs to a flow — delete its faucet to remove it"
      : "that arrow is only implied — edit its formula or loop to remove it");
    return;
  }
  selected.clear();
  textInput.property("value", lines.filter((_, i) => !remove.has(i)).join("\n"));
  ta.dispatchEvent(new Event("input"));
  disarmTool();
}

function loadExample(ex: { content: string; flows?: boolean }) {
  // A button load replaces the whole diagram, so don't recycle the previous
  // example's positions (ids like "stock#2" recur across examples, and nodes
  // migrating across the canvas jam on each other's collision discs) — start
  // every node fresh at its layout slot. Typing edits still recycle. An
  // armed palette tool (and any half-picked link source, about to go stale)
  // disarms with the model it belonged to, and the selection (ids about to
  // be replaced) clears.
  disarmTool();
  closeRename();
  selected.clear();
  simulation.nodes([]);
  // Each button lands on the view its figure shows: the flows toggle resets
  // to the entry's declared flag ("figure 31 & 33" presets it on, everything
  // else off — figure 32's chart is the bare inventory line). The horizon,
  // by contrast, is the user's and survives loads.
  showFlows = ex.flows ?? false;
  flowsInput.property('checked', showFlows);
  textInput.property('value', ex.content);
  textInput.node()?.dispatchEvent(new Event('input'));
}

// The open inline rename editor, if any (only one at a time). `cancel`
// discards it without renaming — used to tear it down on an example load.
let renameEditor: { input: HTMLInputElement; cancel: () => void } | null = null;
function closeRename(): void { renameEditor?.cancel(); }

// Is `name` usable as a node name? It must lex as exactly one identifier —
// compiling it alone yields a single node with that very label and no links
// (so brackets, operators, or a bare number are rejected) — and must not be
// a formula reserved word, which would silently change meaning inside a
// `: (…)` formula (a reference becoming the time variable, or a call).
function isValidName(name: string): boolean {
  if (["t", "pi", "cos", "sin", "min", "max"].includes(name)) return false;
  try {
    const r = JSON.parse(interpreter.go(name)) as System;
    return !!r && Array.isArray(r.nodes) && r.nodes.length === 1
      && r.nodes[0]?.label === name && (!Array.isArray(r.links) || r.links.length === 0);
  } catch { return false; }
}

// Rename every mention of `oldName` to `raw` in the source. Robust against
// multi-word names and substrings: `nameSpans` (the highlighter's scanner,
// which mirrors the lexer) tiles the text into spans tagged with their
// normalized name, so only whole-name identifier runs are replaced —
// operators, formula reserved words, and unrelated text pass through. Then
// the edit dispatches through the editor's own input path (compile, diagram,
// chart, highlight). Renaming leaves the token COUNT unchanged, so parser
// ids — and thus node ids and positions — survive.
function renameNode(oldName: string, raw: string): void {
  const ta = textInput.node();
  if (!ta) return;
  const cleaned = raw.trim().replace(/\s+/g, ' ');
  if (cleaned === '' || cleaned === oldName || !isValidName(cleaned)) return;
  const renamed = nameSpans(ta.value).map(s => (s.name === oldName ? cleaned : s.text)).join('');
  textInput.property('value', renamed);
  ta.dispatchEvent(new Event('input'));
}

// Open the inline rename box over a node's name label. An HTML <input>
// floats (position: fixed) at the label's screen rect, pre-filled with the
// bare name (not the ": value" suffix). Enter commits (keeping the box open
// with a red flag if the name is invalid); Escape discards; blur commits a
// valid change or discards. Committing routes through renameNode.
function startRename(d: Node, labelEl: SVGTextElement): void {
  closeRename();
  const input = document.createElement('input');
  input.type = 'text';
  input.value = d.label;
  input.className = 'rename-input';
  input.spellcheck = false;
  const rect = labelEl.getBoundingClientRect();
  const w = Math.max(rect.width + 20, 72);
  input.style.left = `${Math.round(rect.left + rect.width / 2 - w / 2)}px`;
  input.style.top = `${Math.round(rect.top - 3)}px`;
  input.style.width = `${w}px`;

  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    input.remove();
    if (renameEditor?.input === input) renameEditor = null;
  };
  // Enter: commit if valid/changed, keep open (flagged) if invalid. blur:
  // commit a valid change, else just discard (no nagging).
  const attempt = (keepOpenOnInvalid: boolean) => {
    if (done) return;
    const cleaned = input.value.trim().replace(/\s+/g, ' ');
    if (cleaned === '' || cleaned === d.label) { finish(); return; }
    if (!isValidName(cleaned)) { if (keepOpenOnInvalid) input.classList.add('invalid'); else finish(); return; }
    finish();
    renameNode(d.label, cleaned);
  };
  input.addEventListener('keydown', e => {
    e.stopPropagation(); // don't reach the global Escape/Enter tool handlers
    if (e.key === 'Enter') { e.preventDefault(); attempt(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finish(); }
  });
  input.addEventListener('input', () => input.classList.remove('invalid'));
  input.addEventListener('blur', () => attempt(false));

  renameEditor = { input, cancel: finish };
  document.body.appendChild(input);
  input.focus();
  input.select();
}

// Append a centered text label to a per-node <g>; the text moves with the
// shape (the group carries the transform). `y` shifts the label off the shape
// (negative = above); 0 keeps it vertically centered on the node. The label
// is `pointer-events auto` and tagged `node-label` so pressing it starts the
// node's own drag (a bigger grab target than a tiny dot), and a no-move
// click on it with no tool armed opens the rename editor (see drag()).
function appendLabel(g: d3.Selection<SVGGElement, Node, SVGGElement, unknown>, y = 0, fontSize = 10) {
  g.append("text")
    .attr("class", "node-label")
    .attr("text-anchor", "middle")
    .attr("y", y)
    .attr("dy", "0.32em")
    .attr("font-size", fontSize)
    .attr("font-family", "sans-serif")
    .attr("fill", "#000")
    .attr("pointer-events", "auto");
}

// Dragging a port slides it along its stock's inset boundary: the pointer's
// bearing from the stock's center becomes the port's angle, recorded as
// `portAngle` so hand placement sticks (ticked() prefers it over the
// automatic face-the-far-endpoint bearing, and auto ports yield to it in the
// spread). The port never leaves the boundary — there is nothing else to
// drag it to. Clicking a port is the same release gesture as clicking a
// node: the hand-set bearing clears and the port returns to its automatic
// placement.
function portDrag() {
  // Same client-pixel click test as drag(): phantom in-svg movement (a tick
  // easing the viewBox mid-press) must not read as a slide.
  let dist = 0;
  let pressAt = { x: 0, y: 0 };
  return d3.drag<any, Node>()
    .on("start", (event) => {
      dist = 0;
      pressAt = clientPoint(event.sourceEvent);
      if (!event.active) {
        simulation.alphaTarget(0.3).restart();
      }
    })
    .on("drag", (event, d) => {
      const cp = clientPoint(event.sourceEvent);
      dist = Math.max(dist, Math.hypot(cp.x - pressAt.x, cp.y - pressAt.y));
      const p = d.portParent;
      if (!p) return;
      d.portAngle = Math.atan2(event.y - (p.y ?? 0), event.x - (p.x ?? 0));
    })
    .on("end", (event, d) => {
      if (!event.active) {
        simulation.alphaTarget(0);
      }
      if (dist <= 3) delete d.portAngle;
    });
}

// Dragging a node PINS it: fx/fy keep the drop point, so hand placement
// holds exactly against the forces (which still layout everything else).
// A plain click releases the pin — fx/fy unset, the node rejoins the
// simulation. d3.drag fires start/end for clicks too, so the two gestures
// are told apart by whether any drag (movement) event landed between them.
// Screen-truth pointer position of a d3 gesture's source event (touch or
// mouse), for the click-vs-drag test below. Client pixels, deliberately NOT
// svg user coordinates: the press itself kicks the simulation, so a tick can
// ease the viewBox mid-gesture and shift what user coords a stationary
// pointer maps to — d3's event.dx/dy then report phantom movement (and
// browsers can slip a zero-distance mousemove inside a click, which d3
// forwards as a "drag" event even though nothing moved).
const clientPoint = (e: any): { x: number; y: number } => {
  const p = e?.changedTouches?.[0] ?? e?.touches?.[0] ?? e;
  return { x: p?.clientX ?? 0, y: p?.clientY ?? 0 };
};

function drag() {
  // Click vs drag is decided by real pointer travel in client pixels (d3's
  // own clickDistance idea — see clientPoint above), not by whether any
  // "drag" event fired.
  let dist = 0;
  let pressAt = { x: 0, y: 0 };
  let wasPinned = false;
  // The element the press landed on — a name label vs the shape — decides a
  // no-move, no-tool click: rename vs release the pin.
  let pressEl: EventTarget | null = null;
  return d3.drag<any, Node>()
    .on("start", (event, d) => {
      dist = 0;
      pressAt = clientPoint(event.sourceEvent);
      pressEl = event.sourceEvent?.target ?? null;
      wasPinned = d.fx != null;
      if (!event.active) {
        simulation.alphaTarget(0.3).restart();
      }
      d.fx = d.x;
      d.fy = d.y;
    })
    .on("drag", (event, d) => {
      const p = clientPoint(event.sourceEvent);
      dist = Math.max(dist, Math.hypot(p.x - pressAt.x, p.y - pressAt.y));
      d.fx = event.x;
      d.fy = event.y;
    })
    .on("end", (event, d) => {
      if (!event.active) {
        simulation.alphaTarget(0);
      }
      // A drag keeps the pin; a click (no meaningful movement) removes it.
      // The brief alphaTarget kick above doubles as the resettle that shows
      // a released node drifting back to where the forces want it. While an
      // edit tool (arrow/flow/loop/select/delete) is armed the click acts on
      // this node instead — undoing the pin the press just wrote (unless the
      // node was already hand-pinned), so acting never nails a free node down.
      if (dist <= 3) {
        const editTool = armedTool === "arrow" || armedTool === "flow"
          || armedTool === "reinforcing" || armedTool === "balancing"
          || armedTool === "select" || armedTool === "delete";
        if (editTool) {
          if (!wasPinned) {
            d.fx = null;
            d.fy = null;
          }
          if (armedTool === "arrow" || armedTool === "flow") pickLinkEnd(d);
          else if (armedTool === "reinforcing" || armedTool === "balancing") pickLoopNode(d);
          else if (armedTool === "select") toggleSelect(d);
          else deleteAt(d);
          return;
        }
        // No tool: a click on the node's NAME label opens the rename editor
        // (restoring the pre-press pin state first, so renaming never nails a
        // free node down); a click on its shape releases the pin.
        if (armedTool == null && pressEl instanceof SVGTextElement) {
          if (!wasPinned) { d.fx = null; d.fy = null; }
          startRename(d, pressEl);
          return;
        }
        d.fx = null;
        d.fy = null;
      }
    })
}
