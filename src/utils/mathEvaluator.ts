// Inline math evaluator for Apple Notes-style calculations in notes.
//
// A line like `Params = 32×10^9` defines a variable; a line with a trailing
// `=` (e.g. `ModelSize =` or `2 + (3 × 4) =`) is a request to evaluate the
// expression before it. Lines that don't fully parse AND evaluate to a finite
// number are silently ignored (`Deadline = Friday` stays plain prose).
//
// Pure module: no CodeMirror, DOM, or Tauri imports. The editor integration
// lives in src/components/editor/mathPlugin.ts.

export interface MathSpan {
  /** Column offsets within the line's text. */
  from: number;
  to: number;
}

export type MathLineKind = 'definition' | 'evaluation' | 'definition-evaluation';

export interface MathLineResult {
  kind: MathLineKind;
  /** LHS variable name span; present for 'definition' and 'definition-evaluation'. */
  nameSpan?: MathSpan;
  /** Spans of variable references in the expression (all resolved, since the line evaluated). */
  refSpans: MathSpan[];
  /** Computed value (always finite). */
  value: number;
  /** Formatted result text; present for 'evaluation' and 'definition-evaluation'. */
  resultText?: string;
  /** Column just after the trailing '='; widget insertion point. */
  resultOffset?: number;
}

// --- Tokenizer ---------------------------------------------------------------

type OpChar = '+' | '-' | '*' | '/' | '^' | '%' | '(' | ')' | ',' | '=';

type Token =
  | { type: 'num'; value: number; from: number; to: number }
  | { type: 'ident'; name: string; from: number; to: number }
  | { type: 'op'; op: OpChar; from: number; to: number };

class MathError extends Error {}

// Unicode math operators are normalized to their ASCII equivalents.
const OP_NORMALIZE: Record<string, OpChar> = {
  '×': '*',
  '÷': '/',
  '−': '-',
  '+': '+',
  '-': '-',
  '*': '*',
  '/': '/',
  '^': '^',
  '%': '%',
  '(': '(',
  ')': ')',
  ',': ',',
  '=': '=',
};

// Suffixes are only recognized when not followed by an identifier character
// (so `8km` and `8k2` fall through to a parse error). Lowercase m/g/t are
// deliberately rejected: they read as milli/grams/tonnes in prose.
const SUFFIX_MULTIPLIER: Record<string, number> = {
  k: 1e3,
  K: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
};

const IDENT_START = /[A-Za-z_]/;
const IDENT_CHAR = /[A-Za-z0-9_]/;
const NUMBER_RE = /^(?:\d+(?:\.\d+)?|\.\d+)/;

/**
 * Tokenize expression text. Token positions are offset by `base` so they map
 * back to columns in the original (unstripped) line. Returns null on any
 * unrecognized character.
 */
function tokenize(text: string, base: number): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === ' ' || ch === '\t') {
      i++;
      continue;
    }
    const numMatch = NUMBER_RE.exec(text.slice(i));
    if (numMatch) {
      let end = i + numMatch[0].length;
      let value = Number(numMatch[0]);
      const suffix = text[end];
      if (
        suffix !== undefined &&
        SUFFIX_MULTIPLIER[suffix] !== undefined &&
        (end + 1 >= text.length || !IDENT_CHAR.test(text[end + 1]))
      ) {
        value *= SUFFIX_MULTIPLIER[suffix];
        end++;
      }
      tokens.push({ type: 'num', value, from: base + i, to: base + end });
      i = end;
      continue;
    }
    if (IDENT_START.test(ch)) {
      let end = i + 1;
      while (end < text.length && IDENT_CHAR.test(text[end])) end++;
      tokens.push({ type: 'ident', name: text.slice(i, end), from: base + i, to: base + end });
      i = end;
      continue;
    }
    const op = OP_NORMALIZE[ch];
    if (op !== undefined) {
      tokens.push({ type: 'op', op, from: base + i, to: base + i + 1 });
      i++;
      continue;
    }
    return null;
  }
  return tokens;
}

// --- Parser ------------------------------------------------------------------

type AstNode =
  | { kind: 'num'; value: number }
  | { kind: 'var'; name: string; span: MathSpan }
  | { kind: 'call'; name: string; args: AstNode[] }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/' | '^'; left: AstNode; right: AstNode }
  | { kind: 'neg'; operand: AstNode }
  // Percent of a number literal: evaluates to value/100. As the direct right
  // operand of + or - it triggers Apple-style relative math (X + 20% = X×1.2).
  | { kind: 'percent'; operand: AstNode }
  // Parenthesized expression; exists so parens launder percent-ness:
  // 100 + (20%) is plain addition of 0.2, not a 20% increase.
  | { kind: 'group'; operand: AstNode };

interface FunctionSpec {
  minArity: number;
  maxArity: number;
  apply: (args: number[]) => number;
}

const FUNCTIONS: Record<string, FunctionSpec> = {
  sqrt: { minArity: 1, maxArity: 1, apply: ([x]) => Math.sqrt(x) },
  abs: { minArity: 1, maxArity: 1, apply: ([x]) => Math.abs(x) },
  round: { minArity: 1, maxArity: 1, apply: ([x]) => Math.round(x) },
  floor: { minArity: 1, maxArity: 1, apply: ([x]) => Math.floor(x) },
  ceil: { minArity: 1, maxArity: 1, apply: ([x]) => Math.ceil(x) },
  log2: { minArity: 1, maxArity: 1, apply: ([x]) => Math.log2(x) },
  log10: { minArity: 1, maxArity: 1, apply: ([x]) => Math.log10(x) },
  min: { minArity: 1, maxArity: Infinity, apply: (args) => Math.min(...args) },
  max: { minArity: 1, maxArity: Infinity, apply: (args) => Math.max(...args) },
};

/**
 * Recursive-descent parser over a token slice. Grammar (precedence low→high):
 *
 *   expr           := additive
 *   additive       := multiplicative (("+"|"-") multiplicative)*   left-assoc
 *   multiplicative := unary (("*"|"/") unary)*                     left-assoc
 *   unary          := ("-"|"+") unary | power
 *   power          := postfix ("^" unary)?                         right-assoc
 *   postfix        := primary "%"?                                 % after number literals only
 *   primary        := NUMBER | IDENT | IDENT "(" expr ("," expr)* ")" | "(" expr ")"
 *
 * No implicit multiplication: adjacent operands are a parse error.
 */
type VarNode = Extract<AstNode, { kind: 'var' }>;
type IdentToken = Extract<Token, { type: 'ident' }>;

class Parser {
  private pos = 0;
  private readonly tokens: readonly Token[];
  readonly varNodes: VarNode[] = [];

  constructor(tokens: readonly Token[]) {
    this.tokens = tokens;
  }

  /** Parse the whole token slice as one expression; throws MathError on failure. */
  parse(): AstNode {
    if (this.tokens.length === 0) throw new MathError('empty expression');
    const node = this.parseAdditive();
    if (this.pos !== this.tokens.length) throw new MathError('unexpected trailing tokens');
    return node;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private peekOp(): OpChar | undefined {
    const token = this.peek();
    return token?.type === 'op' ? token.op : undefined;
  }

  private expectOp(op: OpChar): void {
    if (this.peekOp() !== op) throw new MathError(`expected '${op}'`);
    this.pos++;
  }

  private parseAdditive(): AstNode {
    let left = this.parseMultiplicative();
    for (;;) {
      const op = this.peekOp();
      if (op !== '+' && op !== '-') return left;
      this.pos++;
      left = { kind: 'binary', op, left, right: this.parseMultiplicative() };
    }
  }

  private parseMultiplicative(): AstNode {
    let left = this.parseUnary();
    for (;;) {
      const op = this.peekOp();
      if (op !== '*' && op !== '/') return left;
      this.pos++;
      left = { kind: 'binary', op, left, right: this.parseUnary() };
    }
  }

  private parseUnary(): AstNode {
    const op = this.peekOp();
    if (op === '-') {
      this.pos++;
      return { kind: 'neg', operand: this.parseUnary() };
    }
    if (op === '+') {
      this.pos++;
      return this.parseUnary();
    }
    return this.parsePower();
  }

  private parsePower(): AstNode {
    const base = this.parsePostfix();
    if (this.peekOp() !== '^') return base;
    this.pos++;
    // Right-assoc via unary recursion; also allows signed exponents (2^-1).
    return { kind: 'binary', op: '^', left: base, right: this.parseUnary() };
  }

  private parsePostfix(): AstNode {
    const node = this.parsePrimary();
    if (this.peekOp() === '%') {
      if (node.kind !== 'num') throw new MathError('% is only supported after a number');
      this.pos++;
      return { kind: 'percent', operand: node };
    }
    return node;
  }

  private parsePrimary(): AstNode {
    const token = this.peek();
    if (token === undefined) throw new MathError('unexpected end of expression');
    if (token.type === 'num') {
      this.pos++;
      return { kind: 'num', value: token.value };
    }
    if (token.type === 'ident') {
      this.pos++;
      if (this.peekOp() === '(') {
        this.pos++;
        const args: AstNode[] = [this.parseAdditive()];
        while (this.peekOp() === ',') {
          this.pos++;
          args.push(this.parseAdditive());
        }
        this.expectOp(')');
        return { kind: 'call', name: token.name, args };
      }
      const node: VarNode = {
        kind: 'var',
        name: token.name,
        span: { from: token.from, to: token.to },
      };
      this.varNodes.push(node);
      return node;
    }
    if (token.op === '(') {
      this.pos++;
      const operand = this.parseAdditive();
      this.expectOp(')');
      return { kind: 'group', operand };
    }
    throw new MathError(`unexpected '${token.op}'`);
  }
}

// --- Evaluator ---------------------------------------------------------------

function evalNode(node: AstNode, env: ReadonlyMap<string, number>): number {
  switch (node.kind) {
    case 'num':
      return node.value;
    case 'var': {
      const value = env.get(node.name);
      if (value === undefined) throw new MathError(`undefined variable '${node.name}'`);
      return value;
    }
    case 'percent':
      return evalNode(node.operand, env) / 100;
    case 'neg':
      return -evalNode(node.operand, env);
    case 'group':
      return evalNode(node.operand, env);
    case 'call': {
      const fn = FUNCTIONS[node.name];
      if (fn === undefined) throw new MathError(`unknown function '${node.name}'`);
      if (node.args.length < fn.minArity || node.args.length > fn.maxArity) {
        throw new MathError(`wrong arity for '${node.name}'`);
      }
      return fn.apply(node.args.map((arg) => evalNode(arg, env)));
    }
    case 'binary': {
      const left = evalNode(node.left, env);
      // Apple-style relative percent: X + 20% = X×1.2, X - 20% = X×0.8.
      // Only when the right operand is literally a percent node — products,
      // groups, and variables holding percent-derived values stay plain.
      if ((node.op === '+' || node.op === '-') && node.right.kind === 'percent') {
        const fraction = evalNode(node.right, env);
        return node.op === '+' ? left * (1 + fraction) : left * (1 - fraction);
      }
      const right = evalNode(node.right, env);
      switch (node.op) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          return left / right;
        case '^':
          return Math.pow(left, right);
      }
    }
  }
}

/**
 * Evaluate a standalone expression string against an environment.
 * Returns null if it doesn't fully parse and evaluate to a finite number.
 */
export function evaluateExpression(
  src: string,
  env: ReadonlyMap<string, number>
): number | null {
  const tokens = tokenize(src, 0);
  if (tokens === null || tokens.length === 0) return null;
  try {
    const value = evalNode(new Parser(tokens).parse(), env);
    return Number.isFinite(value) ? value : null;
  } catch (error) {
    if (error instanceof MathError) return null;
    throw error;
  }
}

// --- Result formatting -------------------------------------------------------

/**
 * Format a result like the Apple Notes reference: space-grouped thousands
 * (`62 914 560 000`), float noise removed (0.1+0.2 → "0.3"), locale-independent.
 * Extreme magnitudes fall back to JS exponential notation.
 */
export function formatResult(value: number): string {
  let v = Number(value.toPrecision(12));
  if (Object.is(v, -0)) v = 0;
  const str = String(v);
  if (str.includes('e') || str.includes('E')) return str;
  const negative = str.startsWith('-');
  const body = negative ? str.slice(1) : str;
  const [intPart, fracPart] = body.split('.');
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return (negative ? '-' : '') + grouped + (fracPart !== undefined ? '.' + fracPart : '');
}

// --- Document analysis -------------------------------------------------------

const LIST_MARKER_RE = /^\s*(?:[-*+]|\d+[.)])\s+/;

/**
 * Analyze a whole note body top-to-bottom with a single variable environment
 * (nearest definition above a line wins; forward references are undefined).
 * Returns one entry per input line: a MathLineResult for lines that fully
 * parse AND evaluate to a finite value, null otherwise (silent failure).
 * Skips YAML frontmatter, fenced code blocks, lines containing backticks,
 * and everything from the first '#' (comments; also excludes headings).
 */
export function analyzeDocument(lines: readonly string[]): Array<MathLineResult | null> {
  const results: Array<MathLineResult | null> = new Array(lines.length).fill(null);
  const env = new Map<string, number>();

  // Frontmatter: only a leading '---' with a matching closer counts
  // (same semantics as tagPlugin's isInFrontmatter).
  let skipThrough = -1;
  if (lines[0] === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i] === '---') {
        skipThrough = i;
        break;
      }
    }
  }

  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    if (i <= skipThrough) continue;
    const line = lines[i];
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence || line.includes('`')) continue;

    // Strip one leading list marker so math works inside lists; keep the
    // offset so spans map back to real columns. `- [ ] task` still fails
    // later because '[' doesn't tokenize.
    const markerMatch = LIST_MARKER_RE.exec(line);
    const base = markerMatch ? markerMatch[0].length : 0;
    // Everything from the first '#' is a comment. This also rejects headings
    // and comment-only lines (nothing remains before the '#').
    const hashIndex = line.indexOf('#', base);
    const text = line.slice(base, hashIndex === -1 ? line.length : hashIndex);
    if (!text.includes('=')) continue;

    const tokens = tokenize(text, base);
    if (tokens === null || tokens.length === 0) continue;

    // Trailing '=' means "show me the result".
    let resultOffset: number | undefined;
    const last = tokens[tokens.length - 1];
    if (last.type === 'op' && last.op === '=') {
      tokens.pop();
      resultOffset = last.to;
    }
    if (tokens.length === 0) continue;

    // `Name = expr...` is a definition; anything else must be a bare
    // expression on an evaluation line.
    let nameToken: IdentToken | undefined;
    let exprTokens: readonly Token[] = tokens;
    const [first, second] = tokens;
    if (
      tokens.length > 2 &&
      first.type === 'ident' &&
      second.type === 'op' &&
      second.op === '='
    ) {
      nameToken = first;
      exprTokens = tokens.slice(2);
    } else if (resultOffset === undefined) {
      continue;
    }

    const parser = new Parser(exprTokens);
    let value: number;
    try {
      value = evalNode(parser.parse(), env);
    } catch (error) {
      if (error instanceof MathError) continue;
      throw error;
    }
    if (!Number.isFinite(value)) continue;

    const result: MathLineResult = {
      kind: nameToken === undefined ? 'evaluation' : 'definition',
      refSpans: parser.varNodes.map((node) => node.span),
      value,
    };
    if (nameToken !== undefined) {
      env.set(nameToken.name, value);
      result.nameSpan = { from: nameToken.from, to: nameToken.to };
    }
    if (resultOffset !== undefined) {
      if (nameToken !== undefined) result.kind = 'definition-evaluation';
      result.resultText = formatResult(value);
      result.resultOffset = resultOffset;
    }
    results[i] = result;
  }

  return results;
}
