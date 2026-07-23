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
  while (i < input.length) {
    const ch = input[i]!;
    if (!letter.test(ch)) {
      plain += ch;
      i++;
      continue;
    }
    if ((ch === "R" || ch === "B") && input[i + 1] === "(") {
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
    flushPlain();
    spans.push({ text: raw, name: words.join(" ") });
    i = j;
  }
  flushPlain();
  return spans;
}
