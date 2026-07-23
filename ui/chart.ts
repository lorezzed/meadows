// The behavior-over-time panel: the book's "figure 6" to the diagram's
// "figure 5". One 2px line per stock over the simulated horizon, real axes,
// each line named by a label in its own accent at its right end (the direct
// label, never color alone, is the identity mechanism); goal rules dash in
// their goal dot's accent. Rendered once per successful update — never per tick. The
// panel itself is always visible: while the model carries no numbers it
// shows a bare frame (the time axis and a unit-less y) with nothing plotted. A hover layer (also
// reachable by keyboard: focus the panel, arrows step, Escape dismisses)
// snaps a crosshair to the nearest sample and reads out every stock's level
// there in one tooltip — it only reads the already-rendered series, so the
// render-once contract holds.
import * as d3 from "d3";
import { DT, T_END, scheduleFn, type GoalRef, type StockSeries } from "./simulate";

// Fixed-order categorical accents: the base palette for the ONE per-node
// color assignment app.ts's update() builds for every view — stocks take
// the slots in parser-id order (chart lines, diagram rects), the other
// named nodes draw from the remaining entries (editor names, diagram dot
// circles and dot/faucet labels, goal rules here). The ordering is the
// CVD-safety mechanism (validated adjacent-pair separation on the white
// surface), so assign by slot and never cycle: past the palette app.ts
// MINTS fresh hues (a golden-angle walk at text-safe lightness) rather
// than reusing an entry — minted accents lack the validated separation,
// so the direct label stays each mark's identity. The
// sub-3:1 slots (aqua, yellow, magenta) never reach a view raw: app.ts
// clamps every assigned entry to text-safe lightness (LAB L <= 55), so all
// views share the same readable hex.
export const STOCK_PALETTE = [
  "#2a78d6", // blue
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
  "#e87ba4", // magenta
  "#eb6834", // orange
];

const chartWidth = 700; // matches the diagram svg, so the panels scale together
const chartHeight = 260;
// The right margin holds the line-end labels.
const margin = { top: 16, right: 130, bottom: 32, left: 48 };

// Recessive chrome: the series lines are the only dominant marks.
const axisInk = "#c3c2b7";
const tickInk = "#898781";
const labelInk = "#000";
const secondaryInk = "#52514e";
const font = 'system-ui, -apple-system, "Segoe UI", sans-serif';

// Tooltip numbers: thousands-comma'd, ≤2 decimals, trailing zeros trimmed.
const fmt = d3.format(",.2~f");

// Spread right-margin label anchors to a minimum rhythm inside [lo, hi],
// moving each as little as possible: sort, push down (forward pass), pull
// back up under the ceiling (backward pass). figure 11's curves all converge
// on one goal line — without this, every label piles onto the shared
// asymptote. Returns positions in the input's order; if the labels can't all
// fit, the gaps compress rather than spilling outside the plot.
const labelGap = 12;
function dodgeLabels(desired: number[], lo: number, hi: number): number[] {
  const order = desired.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const pos = order.map(o => o.y);
  for (let k = 0; k < pos.length; k++)
    pos[k] = Math.max(pos[k] ?? 0, k > 0 ? (pos[k - 1] ?? 0) + labelGap : lo);
  for (let k = pos.length - 1; k >= 0; k--)
    pos[k] = Math.min(pos[k] ?? 0, k < pos.length - 1 ? (pos[k + 1] ?? 0) - labelGap : hi);
  const out: number[] = new Array(desired.length);
  order.forEach((o, k) => { out[o.i] = pos[k] ?? o.y; });
  return out;
}

export type Chart = {
  render(series: StockSeries[], colorOf: (id: string) => string, goals?: GoalRef[], tEnd?: number): void;
  /** Clear to the value-less placeholder: axes only, nothing plotted. */
  empty(tEnd?: number): void;
};

export function createChart(container: d3.Selection<HTMLDivElement, unknown, HTMLElement, any>): Chart {
  // Order 9 bottoms the side column, below the order-2 examples and editor.
  // Panel chrome (size, border, background) comes from the stylesheet via the
  // class. The panel is never hidden — empty() draws the placeholder frame.
  const svg = container
    .append('svg')
    .attr('class', 'chart')
    .style('order', 9)
    .attr('viewBox', `0 0 ${chartWidth} ${chartHeight}`);

  // Goal rules render under the series lines (a reference, never a subject).
  const gGoals = svg.append("g");
  const gLines = svg.append("g");
  const gLabels = svg.append("g");
  const gxAxis = svg.append("g").attr("transform", `translate(0,${chartHeight - margin.bottom})`);
  const gyAxis = svg.append("g").attr("transform", `translate(${margin.left},0)`);

  // d3's axis generators paint their own chrome; re-ink it recessive after
  // every .call.
  const restyleAxis = (g: d3.Selection<SVGGElement, unknown, HTMLElement, any>) => {
    g.selectAll("path, line").attr("stroke", axisInk);
    g.selectAll<SVGTextElement, unknown>("text")
      .attr("fill", tickInk)
      .style("font", `10px ${font}`)
      .style("font-variant-numeric", "tabular-nums");
  };

  // ---- Hover layer: crosshair + one tooltip reading out every series ----
  // Drawn above the lines, never a pointer target itself (the whole svg is
  // the hit area — the crosshair snaps, so nobody has to aim at a 2px line).
  const gHover = svg.append("g")
    .attr("pointer-events", "none")
    .style("display", "none");
  const crosshair = gHover.append("line")
    .attr("stroke", axisInk)
    .attr("stroke-width", 1)
    .attr("y1", margin.top)
    .attr("y2", chartHeight - margin.bottom);
  const gMarkers = gHover.append("g");
  const gTip = gHover.append("g");
  const tipBg = gTip.append("rect")
    .attr("fill", "#fff")
    .attr("stroke", "rgba(11,11,11,0.15)")
    .attr("rx", 3);
  const gTipContent = gTip.append("g");
  const tipHead = gTipContent.append("text")
    .attr("fill", secondaryInk)
    .style("font", `10px ${font}`)
    .style("font-variant-numeric", "tabular-nums");
  const gTipRows = gTipContent.append("g");
  const rowH = 15; // vertical rhythm of tooltip rows

  // What the hover layer reads: the scales and series of the last render.
  // Null while the chart is hidden; hoverIdx is the shown sample or null.
  let cur: {
    series: StockSeries[];
    colorOf: (id: string) => string;
    x: d3.ScaleLinear<number, number>;
    y: d3.ScaleLinear<number, number>;
  } | null = null;
  let hoverIdx: number | null = null;

  const maxIdx = () => (cur?.series[0]?.levels.length ?? 1) - 1;
  const clampIdx = (i: number) => Math.max(0, Math.min(maxIdx(), i));

  function hideHover(): void {
    hoverIdx = null;
    gHover.style("display", "none");
  }

  // Place the crosshair + markers + tooltip at sample `idx`. `pointerY` (svg
  // user space) vertically follows the cursor; null (keyboard) parks the
  // tooltip at the top of the plot.
  function showAt(idx: number, pointerY: number | null): void {
    if (!cur || cur.series.length === 0) return;
    const { series, colorOf, x, y } = cur;
    hoverIdx = idx;
    gHover.style("display", null);

    const t = idx * DT;
    const px = x(t);
    crosshair.attr("x1", px).attr("x2", px);

    // A marker on every line at the snapped time, ringed in surface white so
    // it reads against its own line.
    gMarkers.selectAll<SVGCircleElement, StockSeries>("circle")
      .data(series, d => d.id)
      .join("circle")
      .attr("r", 3.5)
      .attr("stroke", "#fff")
      .attr("stroke-width", 2)
      .attr("fill", d => colorOf(d.id))
      .attr("cx", px)
      .attr("cy", d => y(d.levels[idx] ?? 0));

    // One tooltip, every series: value leads (strong ink), label follows
    // (secondary), each row keyed by a short stroke of its line's color.
    // All text lands via .text() → textContent, never markup.
    tipHead.text(`t = ${fmt(t)}`);
    const rows = gTipRows.selectAll<SVGGElement, StockSeries>("g")
      .data(series, d => d.id)
      .join(enter => {
        const g = enter.append("g");
        g.append("line").attr("class", "key")
          .attr("x1", 0).attr("x2", 12).attr("y1", -3.5).attr("y2", -3.5)
          .attr("stroke-width", 2);
        g.append("text").attr("class", "val")
          .attr("text-anchor", "end")
          .attr("fill", labelInk)
          .style("font", `600 11px ${font}`)
          .style("font-variant-numeric", "tabular-nums");
        g.append("text").attr("class", "lbl")
          .attr("fill", secondaryInk)
          .style("font", `11px ${font}`);
        return g;
      })
      .attr("transform", (_, i) => `translate(0,${rowH + i * rowH})`);
    rows.select<SVGLineElement>("line.key").attr("stroke", d => colorOf(d.id));
    const vals = rows.select<SVGTextElement>("text.val").text(d => fmt(d.levels[idx] ?? 0));
    rows.select<SVGTextElement>("text.lbl").text(d => d.label);

    // Column layout needs real text widths: right-align the values, then
    // start the labels one gutter after the widest value.
    let valW = 0;
    vals.each(function () { valW = Math.max(valW, this.getBBox().width); });
    vals.attr("x", 18 + valW);
    rows.select("text.lbl").attr("x", 18 + valW + 8);

    // Size the surface around the content, then keep the whole box inside
    // the panel — flipping to the crosshair's left near the right edge.
    const pad = 8;
    const box = gTipContent.node()!.getBBox();
    tipBg
      .attr("x", box.x - pad)
      .attr("y", box.y - pad)
      .attr("width", box.width + 2 * pad)
      .attr("height", box.height + 2 * pad);
    const boxW = box.width + 2 * pad;
    const boxH = box.height + 2 * pad;
    let tx = px + 12 - (box.x - pad);
    if (px + 12 + boxW > chartWidth - 4) tx = px - 12 - boxW - (box.x - pad);
    const anchorY = pointerY == null ? margin.top + 8 : pointerY - boxH / 2;
    const ty = Math.max(margin.top + 4, Math.min(chartHeight - margin.bottom - boxH - 4, anchorY)) - (box.y - pad);
    gTip.attr("transform", `translate(${tx},${ty})`);
  }

  // The pointer aims at a time anywhere in the panel; keyboard steps it
  // (Shift for coarse steps), Escape dismisses. Focus gets the same readout
  // as hover — tooltips enhance, they never gate.
  svg
    .attr("tabindex", 0)
    .attr("role", "img")
    .attr("aria-label", "stock levels over simulated time")
    .on("pointermove", (event: PointerEvent) => {
      if (!cur) return;
      const [px, py] = d3.pointer(event);
      showAt(clampIdx(Math.round(cur.x.invert(px) / DT)), py);
    })
    .on("pointerleave", () => hideHover())
    .on("focus", () => {
      if (cur && hoverIdx === null) showAt(clampIdx(Math.round(maxIdx() / 2)), null);
    })
    .on("blur", () => hideHover())
    .on("keydown", (event: KeyboardEvent) => {
      if (!cur) return;
      const step = event.shiftKey ? 10 : 1;
      const from = hoverIdx ?? Math.round(maxIdx() / 2);
      if (event.key === "ArrowLeft") {
        showAt(clampIdx(from - step), null);
        event.preventDefault();
      } else if (event.key === "ArrowRight") {
        showAt(clampIdx(from + step), null);
        event.preventDefault();
      } else if (event.key === "Escape") {
        hideHover();
      }
    });

  // tEnd is the horizon the series were simulated over — the x-domain and
  // every goal path/label extends exactly that far.
  function render(series: StockSeries[], colorOf: (id: string) => string, goals: GoalRef[] = [], tEnd: number = T_END): void {
    const x = d3.scaleLinear([0, tEnd], [margin.left, chartWidth - margin.right]);
    // The domain covers the goal rules too — every scheduled value of every
    // goal: a goal above every curve must not clip off the top, and figure
    // 19's outside temperature dips below zero, so the floor follows the
    // goals down (stock levels themselves never go negative).
    const goalValues = goals.flatMap(g => [g.value, ...(g.steps ?? []).map(s => s.value)]);
    const maxLevel = Math.max(
      d3.max(series, s => d3.max(s.levels)) ?? 0,
      d3.max(goalValues) ?? 0);
    const minLevel = Math.min(0, d3.min(goalValues) ?? 0);
    // max(1, ·) keeps an all-zero model from collapsing the scale.
    const y = d3.scaleLinear([minLevel, Math.max(1, maxLevel)], [chartHeight - margin.bottom, margin.top]).nice();

    gxAxis.call(d3.axisBottom(x));
    gyAxis.call(d3.axisLeft(y).ticks(5));
    restyleAxis(gxAxis);
    restyleAxis(gyAxis);

    const line = d3.line<number>()
      .x((_, i) => x(i * DT))
      .y(v => y(v));

    gLines.selectAll<SVGPathElement, StockSeries>("path")
      .data(series, d => d.id)
      .join("path")
      .attr("fill", "none")
      .attr("stroke", d => colorOf(d.id))
      .attr("stroke-width", 2)
      .attr("d", d => line(d.levels));

    // One dashed rule per goal constant (the book's "room temperature = 18°C"
    // line), full plot width, in its goal dot's accent — the same color the
    // dot wears in the editor and the diagram; the dash keeps it a
    // reference under the series lines. A
    // SCHEDULED goal (figure 19's outside temperature) draws as a dashed
    // path instead: `@` schedules step (holding each value until the next),
    // `~` schedules sample the simulator's own smooth interpolant at every
    // DT — either way the chart shows exactly what the run integrated.
    const goalPts = (g: GoalRef) => {
      if (g.smooth && g.steps?.length) {
        const fn = scheduleFn(g);
        return d3.range(0, tEnd + DT / 2, DT).map(at => ({ at, value: fn(at) }));
      }
      const pts = [{ at: 0, value: g.value }, ...(g.steps ?? []).filter(s => s.at <= tEnd)]
        .sort((a, b) => a.at - b.at);
      const lastPt = pts[pts.length - 1] ?? { at: 0, value: g.value };
      return [...pts, { at: tEnd, value: lastPt.value }];
    };
    const goalEndValue = (g: GoalRef) => {
      const pts = goalPts(g);
      return (pts[pts.length - 1] ?? { value: g.value }).value;
    };
    const stepLine = d3.line<{ at: number; value: number }>()
      .x(p => x(Math.max(0, p.at)))
      .y(p => y(p.value))
      .curve(d3.curveStepAfter);
    const smoothLine = d3.line<{ at: number; value: number }>()
      .x(p => x(p.at))
      .y(p => y(p.value));
    gGoals.selectAll<SVGPathElement, GoalRef>("path")
      .data(goals, d => d.id)
      .join("path")
      .attr("fill", "none")
      .attr("stroke", d => colorOf(d.id))
      .attr("stroke-width", 1.5)
      .attr("stroke-dasharray", "7 5")
      .attr("d", d => (d.smooth && d.steps?.length ? smoothLine : stepLine)(goalPts(d)));

    // Right-margin labels — series ends and goal rules together — dodge
    // vertically so converging lines stay individually named. A scheduled
    // goal's label anchors to its final value, where its path ends.
    const placed = dodgeLabels(
      [...series.map(s => y(s.levels[s.levels.length - 1] ?? 0)),
       ...goals.map(g => y(goalEndValue(g)))],
      margin.top, chartHeight - margin.bottom);

    gLabels.selectAll<SVGTextElement, StockSeries>("text")
      .data(series, d => d.id)
      .join("text")
      .attr("x", x(tEnd) + 8)
      .attr("y", (_, i) => placed[i] ?? 0)
      .attr("dy", "0.32em")
      .attr("fill", d => colorOf(d.id))
      .style("font", `11px ${font}`)
      .text(d => d.label);
    gGoals.selectAll<SVGTextElement, GoalRef>("text")
      .data(goals, d => d.id)
      .join("text")
      .attr("x", x(tEnd) + 8)
      .attr("y", (_, i) => placed[series.length + i] ?? 0)
      .attr("dy", "0.32em")
      .attr("fill", d => colorOf(d.id))
      .style("font", `11px ${font}`)
      .text(d => d.label);

    // Hand the fresh scales/series to the hover layer and drop any readout
    // from the previous model (its sample index no longer means anything).
    cur = { series, colorOf, x, y };
    hideHover();
  }

  // The value-less placeholder: the same recessive frame — the time axis with
  // its numbers (running to the current horizon) and a unit-less y (tick
  // marks, no numbers, the 0..1 domain is arbitrary and unlabeled) — with
  // nothing plotted, so the panel always shows where behavior-over-time will
  // appear. cur stays null: the hover/keyboard layer has nothing to read out.
  function empty(tEnd: number = T_END): void {
    const x = d3.scaleLinear([0, tEnd], [margin.left, chartWidth - margin.right]);
    const y = d3.scaleLinear([0, 1], [chartHeight - margin.bottom, margin.top]);
    gxAxis.call(d3.axisBottom(x));
    gyAxis.call(d3.axisLeft(y).ticks(5).tickFormat(() => ""));
    restyleAxis(gxAxis);
    restyleAxis(gyAxis);
    gLines.selectAll("path").remove();
    gGoals.selectAll("path").remove();
    gGoals.selectAll("text").remove();
    gLabels.selectAll("text").remove();
    cur = null;
    hideHover();
  }

  empty(); // the frame is on screen from first paint, before any input

  return { render, empty };
}
