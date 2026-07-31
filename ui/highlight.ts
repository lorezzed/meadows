// Surface scanner for the editor's color backdrop: split DSL source into
// spans whose concatenation is exactly the input, tagging each identifier
// run with its normalized NAME so the editor can color every mention of a
// node alike. Pure and dependency-free (no imports at all), mirroring
// simulate.ts, so node can run it headlessly (test/highlight.mjs).
//
// This mirrors Lexer.purs only as far as coloring needs:
// - a word is letter (letter | digit | _)* — Unicode classes, like the
//   lexer's isAlpha/isAlphaNum;
// - words joined by horizontal whitespace form ONE name, normalized to
//   single spaces exactly as the lexer's joinWith (`water   in   tub` IS
//   the node `water in tub`);
// - `R(`/`B(` at a token start is the loop-open lexeme, not a name. A
//   letter reached by the scan IS a token start (a letter inside a word was
//   consumed by the run below) — and the greedy run consumption reproduces
//   the lexer's precedence, where a trailing one-letter word joins a
//   preceding identifier first (`foo R(` is the name "foo R", then `(`);
// - inside a FORMULA — a paren group opened right after a `:` (nested
//   parens counted, the context reset at each newline) — the reserved
//   words stay plain: `t` and `pi` always (`orders(t - delivery delay)`,
//   `2 * pi * t / 10`), and cos/sin/min/max exactly when the next
//   non-blank character is `(` (a call, mirroring the parser's dispatch).
//   A bare `cos` inside a formula is an ordinary reference, and ANY of
//   these words outside a formula is an ordinary node name — including a
//   statement-level `t` (`t -> b` names a node t, and so does `R(t -> b)`:
//   a loop-open never opens a formula);
// - everything else — operators, numbers, brackets, clouds, newlines — is
//   plain. (A digit only joins a name after a leading letter: `a2` is one
//   name, but in `2x` the digit stays plain and `x` is the name, matching
//   the lexer's number-before-identifier ordering.)
export type Span = {
  /** Raw source slice; concatenating every span reproduces the input. */
  text: string;
  /** The normalized node name, present when this span is an identifier run. */
  name?: string;
};

const letter = /\p{L}/u;
const wordChar = /[\p{L}\p{N}_]/u;

export function nameSpans(input: string): Span[] {
  const spans: Span[] = [];
  let plain = "";
  const flushPlain = () => {
    if (plain !== "") {
      spans.push({ text: plain });
      plain = "";
    }
  };
  let i = 0;
  // Formula-context nesting: 0 = statement level; >0 = inside a paren
  // group opened right after a `:` (the `: (expr)` annotation form), with
  // nested parens counted. Formulas never span lines, so a newline resets.
  let depth = 0;
  while (i < input.length) {
    const ch = input[i]!;
    if (!letter.test(ch)) {
      if (ch === "\n") depth = 0;
      else if (ch === "(") {
        if (depth > 0) depth++;
        else {
          let k = i - 1;
          while (k >= 0 && (input[k] === " " || input[k] === "\t")) k--;
          if (k >= 0 && input[k] === ":") depth = 1;
        }
      } else if (ch === ")" && depth > 0) depth--;
      plain += ch;
      i++;
      continue;
    }
    if ((ch === "R" || ch === "B") && input[i + 1] === "(") {
      if (depth > 0) depth++; // scanner totality: count the paren anyway
      plain += ch + "(";
      i += 2;
      continue;
    }
    // Identifier run: word (spaces word)*, greedy like the lexer's
    // many(try spacedWord) — the spaces join only when a word follows.
    let raw = "";
    const words: string[] = [];
    let j = i;
    for (;;) {
      let w = "";
      while (j < input.length && wordChar.test(input[j]!)) {
        w += input[j]!;
        j++;
      }
      words.push(w);
      raw += w;
      let k = j;
      while (k < input.length && (input[k] === " " || input[k] === "\t")) k++;
      if (k > j && k < input.length && letter.test(input[k]!)) {
        raw += input.slice(j, k);
        j = k;
      } else break;
    }
    const name = words.join(" ");
    if (depth > 0) {
      // Reserved words are plain only INSIDE formulas: `t`/`pi` always,
      // function names exactly when a `(` follows (skip blanks forward the
      // way the lexer would — `cos (x)` still calls).
      if (name === "t" || name === "pi") {
        plain += raw;
        i = j;
        continue;
      }
      if (name === "cos" || name === "sin" || name === "min" || name === "max") {
        let k = j;
        while (k < input.length && (input[k] === " " || input[k] === "\t")) k++;
        if (k < input.length && input[k] === "(") {
          plain += raw;
          i = j;
          continue;
        }
      }
    }
    flushPlain();
    spans.push({ text: raw, name });
    i = j;
  }
  flushPlain();
  return spans;
}
