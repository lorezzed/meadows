import * as d3 from "d3";

import * as interpreter from '../output/Main/index'
import type { Node, Link, System } from "./type";
import faucetSvg from './shape/faucet.svg'
import cloudSvg from './shape/cloud.svg'

const container = d3.select('body')
  .append('div')
  .attr('class', 'container')
  .style('display', 'flex')
  .style('flex-direction', 'column')
const pre = container
  .append('pre')
  .attr('class', 'pre-output')
  .style('order', 9)
  .style('min-height', '2em')
  .style('border', '1px solid black')
  .style('white-space', 'pre-wrap')
  .style('word-wrap', 'break-word')
const examples = container
  .append('div')
  .style('order', 2)
examples.append('button')
  .text('a->b')
  .on('click', function () {
    loadExample(this.textContent);
  });
examples.append('button')
  .text('a->b=>c d')
  .on('click', function () {
    loadExample(this.textContent);
  });
examples.append('button')
  .text('[a]')
  .on('click', function () {
    loadExample(this.textContent);
  });
examples.append('button')
  .text('a->b->[c]')
  .on('click', function () {
    loadExample(this.textContent);
  });
examples.append('button')
  .text('a->b=>c [d]')
  .on('click', function () {
    loadExample(this.textContent);
  });
examples.append('button')
  .text('|->a->b=>c [d]=>e|')
  .on('click', function () {
    loadExample(this.textContent);
  });
examples.append('button')
  .text(`|=>investment[capital]=depreciation|
capital->profit->investment
[resource]=>extraction|
resource->yield per unit capital->extraction
yield per unit capital->price->profit
capital->depreciation`)
  .on('click', function () {
    loadExample(this.textContent);
  });


const svgWidth = 600
const svgHeight = 400
// Current viewBox, eased toward the auto-fit target each tick (zoom-out only).
let viewX = 0, viewY = 0, viewW = svgWidth, viewH = svgHeight;
const fitPad = 35; // node half-size (20) + label/arrowhead overhang

const svg: d3.Selection<SVGSVGElement, unknown, HTMLElement, any> = container
  .append('svg')
  .attr('class', 'svg')
  .style('order', 1)
  .style('width', svgWidth)
  .style('height', svgHeight)
  .attr("viewBox", `0 0 ${svgWidth} ${svgHeight}`)
  .style('border', '1px solid black')
  .on("click", click)
const textInput = container
  .append('textarea')
  .attr('class', 'text-input')
  .style('order', 2)
  .style('width', '80em')
  .style('height', '10em')
  .on('input', function (e: Event) {
    try {
      if (!(e.target instanceof HTMLTextAreaElement)) {
        throw new Error("Event target is not a HTMLTextAreaElement");
      }
      const input = e.target.value;
      const output = interpreter.go(input);
      const result = JSON.parse(output) as unknown;
      if (typeof result === 'string') {
        // Compile error: show it and keep the last good graph on screen.
        pre.style('color', '#b00020')
          .style('border', '1px solid #b00020')
          .text(result);
        return;
      }
      const parse = result as System;
      console.log('parse::', parse)

      pre.style('color', null)
        .style('border', '1px solid black')
        .text(JSON.stringify(parse, null, 2));
      update(parse)
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error("Error occurred while processing input:", error.message, error);
        console.error(error);
        return
      }
      console.error("An unknown error occurred:", error);
    }
  })

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
  .attr("fill", "#999");

let link = svg.append("g")
  .attr("stroke", "#00f")
  .attr("stroke-opacity", 0.6)
  .attr("fill", "none")
  .selectAll<SVGPathElement, Link>("path");

const dotRadius = 20;
const nodeEdge = 20; // every shape is ~40px, so its boundary sits ~20px from center
const stockWidth = 40;
const stockHeight = 40;
const faucetWidth = 40;
const faucetHeight = 40
const cloudWidth = 40;
const cloudHeight = 40;

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

const systemNodes: Node[] = [];
const systemLinks: Link[] = []
const system: System = { nodes: systemNodes, links: systemLinks }

const simulation = d3.forceSimulation<Node, Link>(systemNodes)
  .force("link", d3.forceLink<Node, Link>(systemLinks).id(d => d.id).distance(80))
  // Stocks are the diagram's anchors: they repel harder than other nodes...
  .force("charge", d3.forceManyBody<Node>().strength(d => d.type === "stock" ? -300 : -200))
  // ...and carry a bigger collision radius so they push clouds/faucets out of
  // their space instead of letting them overlap; other nodes just avoid touching.
  .force("collide", d3.forceCollide<Node>().radius(d => d.type === "stock" ? 42 : 24).strength(0.85))
  .force("center", d3.forceCenter<Node>(svgWidth / 2, svgHeight / 2))
  // Stocks pull hard to their slot x (evenly spaced per band, see update());
  // everything else gets only gentle x-centering — too strong crowds each band
  // inward, and collision then escapes vertically (waving the line).
  .force("x", d3.forceX<Node>(d => d.gx ?? svgWidth / 2).strength(d => d.gx != null ? 0.25 : 0.02))
  // Stocks pin to their band's y hardest, other band members strongly (forming
  // a horizontal line); floating nodes keep a gentle pull to center.
  .force("y", d3.forceY<Node>(d => d.gy ?? svgHeight / 2).strength(d => d.type === "stock" ? 1.0 : d.inFlow ? 0.9 : 0.05))
  .on("tick", ticked);

let nextId = systemNodes.length;

update(system);

function update(system: System) {
  // Make a shallow copy to protect against mutation, while recycling old nodes to preserve position and velocity.
  const old = new Map(simulation.nodes().map(d => [d.id, d] as [string, Node]));
  const nodes = system.nodes.map(d => {
    const prev = old.get(d.id);
    return prev ? Object.assign(prev, d) : { ...d };
  });
  const links = system.links.map(d => ({ ...d }));

  link = link
    .data(links)
    .join("path")
    .attr("fill", "none")
    .attr("stroke", "#999");
  nodeDot = nodeDot
    .data(nodes.filter(x => x.type === 'dot'), d => d.id)
    .join(enter => {
      const g = enter.append("g");
      g.append("circle")
        .attr("r", dotRadius)
        .attr("fill", "rgba(0, 0, 255, 0.5)")
        .attr("stroke", "#00f")
        .attr("stroke-width", 1.5);
      appendLabel(g);
      return g;
    })
    .call(sel => sel.select<SVGTextElement>("text").text(d => d.label))
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
        .attr("stroke", "#f00")
        .attr("stroke-width", 1.5)
        .attr("fill", "rgba(255, 0, 0, 0.5)");
      appendLabel(g);
      return g;
    })
    .call(sel => sel.select<SVGTextElement>("text").text(d => d.label))
    .call(drag(), undefined);
  nodeFaucet = nodeFaucet
    .data(nodes.filter(x => x.type === 'faucet'), d => d.id)
    .join(enter => {
      const g = enter.append("g");
      g.append("image")
        .attr("href", faucetSvg)
        .attr("x", -faucetWidth / 2)
        .attr("y", -faucetHeight / 2)
        .attr("width", faucetWidth)
        .attr("height", faucetHeight);
      appendLabel(g);
      return g;
    })
    .call(sel => sel.select<SVGTextElement>("text").text(d => d.label))
    .call(drag(), undefined);
  nodeCloud = nodeCloud
    .data(nodes.filter(x => x.type === 'cloud'), d => d.id)
    .join(enter => {
      const g = enter.append("g");
      g.append("image")
        .attr("href", cloudSvg)
        .attr("x", -cloudWidth / 2)
        .attr("y", -cloudHeight / 2)
        .attr("width", cloudWidth)
        .attr("height", cloudHeight);
      appendLabel(g);
      return g;
    })
    .call(sel => sel.select<SVGTextElement>("text").text(d => d.label))
    .call(drag(), undefined);

  // Lay nodes out in horizontal bands. The compiler assigns each node a `group`
  // (a flow-connected chain of stocks/faucets/clouds), numbered top to bottom;
  // dots and reservoir-less faucets have no group and float.
  const bandGap = 120;
  const gs = nodes.map(n => n.group).filter((g): g is number => g != null);
  const groupCount = gs.length ? Math.max(...gs) + 1 : 0;
  for (const d of nodes) {
    d.inFlow = d.group != null;
    d.gy = d.group == null
      ? svgHeight / 2
      : svgHeight / 2 + (d.group - (groupCount - 1) / 2) * bandGap;
  }

  // Stocks are the main elements: give each band's stocks evenly-spaced x
  // slots (in source order) that they anchor to; faucets/clouds arrange
  // themselves around the stocks via the link/collision forces.
  const parserId = (id: string) => {
    const n = parseInt(id.slice(id.indexOf("#") + 1), 10);
    return isNaN(n) ? 0 : n;
  };
  const stocksByBand = new Map<number, Node[]>();
  for (const d of nodes) {
    d.gx = undefined; // clear stale slots on recycled nodes
    if (d.type === "stock" && d.group != null) {
      const arr = stocksByBand.get(d.group) ?? [];
      arr.push(d);
      stocksByBand.set(d.group, arr);
    }
  }
  for (const arr of stocksByBand.values()) {
    arr.sort((a, b) => parserId(a.id) - parserId(b.id));
    arr.forEach((d, i) => { d.gx = svgWidth * (i + 1) / (arr.length + 1); });
  }

  // Clouds are a band's sources/sinks and float to its outside: a cloud that
  // feeds a flow (source) targets the left edge, one that receives (sink) the
  // right edge. (Links still hold string ids here — resolved by the link force
  // only further down.)
  const nodeById = new Map(nodes.map(n => [n.id, n]));
  const edgeMargin = 50;
  for (const l of links) {
    if (l.type !== "flow") continue;
    const s = nodeById.get(l.source as string);
    const t = nodeById.get(l.target as string);
    if (s?.type === "cloud") s.gx = edgeMargin;
    if (t?.type === "cloud") t.gx = svgWidth - edgeMargin;
  }

  // Flow links render as thick straight pipes (Meadows notation); the segment
  // entering a stock/cloud carries the big triangular arrowhead — none into a
  // faucet, where the pipe visually passes through. Info arrows stay thin
  // curved arcs with a small head.
  link
    .attr("stroke-width", d => d.type === "flow" ? 8 : 1.5)
    .attr("stroke-opacity", d => d.type === "flow" ? 1 : 0.6)
    .attr("marker-end", d => {
      if (d.type !== "flow") return "url(#info-arrow)";
      const t = nodeById.get(d.target as string);
      return t && t.type !== "faucet" ? "url(#flow-arrow)" : null;
    });

  simulation.nodes(nodes);

  const linkForce = simulation.force<d3.ForceLink<Node, Link>>("link");
  if (!linkForce) {
    throw new Error("Link force is not defined in the simulation.");
  }
  linkForce.links(links);
  simulation.alpha(0.5).restart();
}

// The info-link arc is the minor arc (sweep 1) of the circle with radius equal
// to the chord that passes through both endpoints. Back the endpoint up along
// that same circle by `margin` arc-pixels, so the shortened path still lies
// exactly on the original arc and the marker orients to its true tangent.
function trimArcEnd(sx: number, sy: number, tx: number, ty: number, margin: number): { x: number, y: number } {
  const dx = tx - sx, dy = ty - sy;
  const d = Math.hypot(dx, dy);
  if (d < margin + 4) return { x: tx, y: ty }; // too short to trim
  const r = d;
  const mx = (sx + tx) / 2, my = (sy + ty) / 2;
  const h = Math.sqrt(Math.max(0, r * r - (d / 2) * (d / 2)));
  const ux = dx / d, uy = dy / d;
  // Two candidate circle centers; sweep-flag 1 means the angle from center
  // increases (screen coords), so pick the center that yields a positive sweep.
  for (const w of [1, -1]) {
    const cx = mx - w * uy * h, cy = my + w * ux * h;
    const a0 = Math.atan2(sy - cy, sx - cx);
    const a1 = Math.atan2(ty - cy, tx - cx);
    let da = a1 - a0;
    while (da <= -Math.PI) da += 2 * Math.PI;
    while (da > Math.PI) da -= 2 * Math.PI;
    if (da > 0) {
      const a = a1 - margin / r; // arc length -> angle
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
    }
  }
  return { x: tx, y: ty };
}

function ticked() {
  nodeDot.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  nodeStock.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  nodeFaucet.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
  nodeCloud.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);

  link
    .attr("d", d => {
      const source = d.source as Node;
      const target = d.target as Node;
      const sx = source.x ?? 0, sy = source.y ?? 0;
      const tx = target.x ?? 0, ty = target.y ?? 0;
      const dx = tx - sx, dy = ty - sy;
      const dr = Math.hypot(dx, dy);
      if (dr === 0) return `M${sx},${sy}L${tx},${ty}`;
      if (d.type === "flow") {
        // Straight pipe. The line stops at the arrowhead's BASE (marker refX
        // 0), so reservoir targets are trimmed by node edge + head length and
        // the tip lands on the node's edge. Faucet ends stay untrimmed — the
        // faucet icon sits on top of the pipe.
        const st = source.type === "faucet" ? 0 : nodeEdge;
        const tt = target.type === "faucet" ? 0 : nodeEdge + flowArrowLength;
        const f = dr > st + tt + 6 ? 1 : dr / (st + tt + 6); // degenerate: scale down
        const ux = dx / dr, uy = dy / dr;
        return `M${sx + ux * st * f},${sy + uy * st * f}L${tx - ux * tt * f},${ty - uy * tt * f}`;
      }
      // Info arc: back the endpoint up along the arc's own circle so the small
      // head sits at the node's edge instead of buried under the shape.
      const e = trimArcEnd(sx, sy, tx, ty, nodeEdge + infoArrowLength);
      return `M${sx},${sy}A${dr},${dr} 0 0,1 ${e.x},${e.y}`;
    });

  // Zoom out (never in) so all nodes stay visible: target viewBox = union of
  // the nominal canvas and the padded node bbox, eased 20%/tick for smoothness.
  // The x-pad grows with the label so wide names ("yield per unit capital")
  // never clip — ~3px per char ≈ half the rendered width at font-size 10.
  let x0 = 0, y0 = 0, x1 = svgWidth, y1 = svgHeight;
  for (const d of simulation.nodes()) {
    if (d.x == null || d.y == null) continue;
    const padX = Math.max(fitPad, d.label.length * 3);
    x0 = Math.min(x0, d.x - padX); y0 = Math.min(y0, d.y - fitPad);
    x1 = Math.max(x1, d.x + padX); y1 = Math.max(y1, d.y + fitPad);
  }
  const ease = 0.2;
  viewX += (x0 - viewX) * ease;
  viewY += (y0 - viewY) * ease;
  viewW += ((x1 - x0) - viewW) * ease;
  viewH += ((y1 - y0) - viewH) * ease;
  svg.attr("viewBox", `${viewX} ${viewY} ${viewW} ${viewH}`);
}

function click(event: MouseEvent) {
  const [x, y] = d3.pointer(event);
  nextId++;
  const newNode: Node = { type: "dot", id: `${nextId}`, label: `${nextId}`, x, y };
  const nearest = systemNodes[systemNodes.length - 1];
  if (nearest) {
    systemLinks.push({ source: nearest.id, target: newNode.id, type: "arrow" });
  }
  systemNodes.push(newNode);
  update({ ...system });
}

function loadExample(text: string) {
  textInput.property('value', text);
  textInput.node()?.dispatchEvent(new Event('input'));
}

// Append a centered text label to a per-node <g>. The text is drawn on top of
// the node's shape and moves with it (the group carries the transform).
function appendLabel(g: d3.Selection<SVGGElement, Node, SVGGElement, unknown>) {
  g.append("text")
    .attr("text-anchor", "middle")
    .attr("dy", "0.32em")
    .attr("font-size", 10)
    .attr("font-family", "sans-serif")
    .attr("fill", "#000")
    .attr("pointer-events", "none");
}

function drag() {
  return d3.drag<any, Node>()
    .on("start", (event, d) => {
      if (!event.active) {
        simulation.alphaTarget(0.3).restart();
      }
      d.fx = d.x;
      d.fy = d.y;
    })
    .on("drag", (event, d) => {
      d.fx = event.x;
      d.fy = event.y;
    })
    .on("end", (event, d) => {
      if (!event.active) {
        simulation.alphaTarget(0);
      }
      d.fx = null;
      d.fy = null;
    })
}
