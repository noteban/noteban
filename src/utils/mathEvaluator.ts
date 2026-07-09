// Inline math evaluator for Apple Notes-style calculations in notes.
//
// A line like `Params = 32×10^9` defines a variable; a line with a trailing
// `=` (e.g. `ModelSize =` or `2 + (3 × 4) =`) is a request to evaluate the
// expression before it. Lines that don't fully parse AND evaluate are
// silently ignored (`Deadline = Friday` stays plain prose).
//
// Values are quantities: a magnitude plus a dimension vector, so unit math
// works dimensionally — `6kJ/s =` shows `6 kW`, `8MB / 2s =` shows `4 MB/s`,
// and `8MB + 2s` is a silent error. Also supported: thousands-separated
// input (`16 000 000 000`), hex/bin literals (0xFF, 0b1010), `in`
// conversions (`8MB in KiB =`, `255 in hex =`), percentages, k/M/G/T scale
// suffixes on bare numbers, functions (trig in degrees), and the constants
// pi and e (shadowable by user definitions).
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
  /** Computed magnitude in base units (B, s, J, m, g); always finite. */
  value: number;
  /** Formatted result text; present for 'evaluation' and 'definition-evaluation'. */
  resultText?: string;
  /** Column just after the trailing '='; widget insertion point. */
  resultOffset?: number;
}

// --- Dimensions and quantities -----------------------------------------------

interface Dim {
  data: number;
  time: number;
  energy: number;
  length: number;
  mass: number;
  currency: number;
}

interface Quantity {
  value: number;
  dim: Dim;
  /** ISO currency code; non-null iff dim.currency ≠ 0. There are no exchange
   * rates — mixing codes is a silent error, same-code ratios cancel. */
  code: string | null;
}

const DIMLESS: Dim = { data: 0, time: 0, energy: 0, length: 0, mass: 0, currency: 0 };

function dim(partial: Partial<Dim>): Dim {
  return { ...DIMLESS, ...partial };
}

function dimCombine(a: Dim, b: Dim, sign: 1 | -1): Dim {
  return {
    data: a.data + sign * b.data,
    time: a.time + sign * b.time,
    energy: a.energy + sign * b.energy,
    length: a.length + sign * b.length,
    mass: a.mass + sign * b.mass,
    currency: a.currency + sign * b.currency,
  };
}

function dimEq(a: Dim, b: Dim): boolean {
  return (
    a.data === b.data &&
    a.time === b.time &&
    a.energy === b.energy &&
    a.length === b.length &&
    a.mass === b.mass &&
    a.currency === b.currency
  );
}

function isDimless(d: Dim): boolean {
  return dimEq(d, DIMLESS);
}

function dimKey(d: Dim): string {
  return `${d.data},${d.time},${d.energy},${d.length},${d.mass},${d.currency}`;
}

/** Quantity constructor that keeps the code↔currency-exponent invariant. */
function qty(value: number, dimension: Dim, code: string | null): Quantity {
  return { value, dim: dimension, code: dimension.currency === 0 ? null : code };
}

function unifyCodes(a: string | null, b: string | null): string | null {
  if (a !== null && b !== null && a !== b) throw new MathError('mixed currencies');
  return a ?? b;
}

// --- Unit tables --------------------------------------------------------------

interface UnitSpec {
  /** Multiplier to the dimension's base unit (B, s, J, m, g). */
  factor: number;
  dim: Dim;
}

const DATA = dim({ data: 1 });
const TIME = dim({ time: 1 });
const ENERGY = dim({ energy: 1 });
const POWER = dim({ energy: 1, time: -1 });
const LENGTH = dim({ length: 1 });
const MASS = dim({ mass: 1 });
const FREQUENCY = dim({ time: -1 });
const MONEY = dim({ currency: 1 });

// Currencies attach after a number like units (`3200 NOK`, `320kr`), as a
// word prefix (`kr 320`, `USD 100`), or as a symbol prefix (`$320`, `€50`).
// The marker AS TYPED is the currency tag: $ only matches $, kr only kr,
// NOK only NOK — a $ is not assumed to be USD, and there are no exchange
// rates, so mixing tags is a silent error while same-tag ratios cancel.
// Accepted markers: any ISO-4217-shaped code (three uppercase letters),
// `kr`, and the symbols below.
const CURRENCY_CODE_RE = /^[A-Z]{3}$/;

function resolveCurrencyCode(name: string): string | null {
  if (name === 'kr') return 'kr';
  return CURRENCY_CODE_RE.test(name) ? name : null;
}

const CURRENCY_SYMBOLS = new Set(['$', '€', '£', '¥']);

// Flat table (no prefix parsing) so collisions stay explicit — e.g. `ms` is
// milliseconds, never meter·something; `min` is minutes here but still the
// function in call position and a plain variable on an LHS.
const UNITS: Record<string, UnitSpec> = {
  B: { factor: 1, dim: DATA },
  kB: { factor: 1e3, dim: DATA },
  KB: { factor: 1e3, dim: DATA },
  MB: { factor: 1e6, dim: DATA },
  GB: { factor: 1e9, dim: DATA },
  TB: { factor: 1e12, dim: DATA },
  KiB: { factor: 1024, dim: DATA },
  kiB: { factor: 1024, dim: DATA },
  MiB: { factor: 1024 ** 2, dim: DATA },
  GiB: { factor: 1024 ** 3, dim: DATA },
  TiB: { factor: 1024 ** 4, dim: DATA },
  // Lowercase b is bits, networking-style: 8Mb = 1 MB.
  b: { factor: 0.125, dim: DATA },
  kb: { factor: 125, dim: DATA },
  Kb: { factor: 125, dim: DATA },
  Mb: { factor: 125e3, dim: DATA },
  Gb: { factor: 125e6, dim: DATA },
  Tb: { factor: 125e9, dim: DATA },
  bit: { factor: 0.125, dim: DATA },
  kbit: { factor: 125, dim: DATA },
  Mbit: { factor: 125e3, dim: DATA },
  Gbit: { factor: 125e6, dim: DATA },
  ms: { factor: 1e-3, dim: TIME },
  s: { factor: 1, dim: TIME },
  min: { factor: 60, dim: TIME },
  h: { factor: 3600, dim: TIME },
  d: { factor: 86400, dim: TIME },
  J: { factor: 1, dim: ENERGY },
  kJ: { factor: 1e3, dim: ENERGY },
  MJ: { factor: 1e6, dim: ENERGY },
  GJ: { factor: 1e9, dim: ENERGY },
  Wh: { factor: 3600, dim: ENERGY },
  kWh: { factor: 3.6e6, dim: ENERGY },
  MWh: { factor: 3.6e9, dim: ENERGY },
  mW: { factor: 1e-3, dim: POWER },
  W: { factor: 1, dim: POWER },
  kW: { factor: 1e3, dim: POWER },
  MW: { factor: 1e6, dim: POWER },
  GW: { factor: 1e9, dim: POWER },
  mm: { factor: 1e-3, dim: LENGTH },
  cm: { factor: 1e-2, dim: LENGTH },
  m: { factor: 1, dim: LENGTH },
  km: { factor: 1e3, dim: LENGTH },
  mg: { factor: 1e-3, dim: MASS },
  g: { factor: 1, dim: MASS },
  kg: { factor: 1e3, dim: MASS },
  Hz: { factor: 1, dim: FREQUENCY },
  kHz: { factor: 1e3, dim: FREQUENCY },
  MHz: { factor: 1e6, dim: FREQUENCY },
  GHz: { factor: 1e9, dim: FREQUENCY },
};

// Auto-scaled display: for a result's dimension, pick the largest unit the
// magnitude reaches (ascending factors; falls back to the smallest).
// Dimensions without a family here render nothing (silent), unless the user
// converts explicitly with `in`.
const DISPLAY_FAMILIES = new Map<string, Array<[label: string, factor: number]>>([
  [dimKey(DATA), [['B', 1], ['kB', 1e3], ['MB', 1e6], ['GB', 1e9], ['TB', 1e12]]],
  [dimKey(TIME), [['ms', 1e-3], ['s', 1], ['min', 60], ['h', 3600], ['d', 86400]]],
  [dimKey(ENERGY), [['J', 1], ['kJ', 1e3], ['MJ', 1e6], ['GJ', 1e9]]],
  [dimKey(POWER), [['mW', 1e-3], ['W', 1], ['kW', 1e3], ['MW', 1e6], ['GW', 1e9]]],
  [dimKey(LENGTH), [['mm', 1e-3], ['m', 1], ['km', 1e3]]],
  [dimKey(MASS), [['mg', 1e-3], ['g', 1], ['kg', 1e3]]],
  [dimKey(FREQUENCY), [['Hz', 1], ['kHz', 1e3], ['MHz', 1e6], ['GHz', 1e9]]],
  [dimKey(dim({ data: 1, time: -1 })), [['B/s', 1], ['kB/s', 1e3], ['MB/s', 1e6], ['GB/s', 1e9], ['TB/s', 1e12]]],
  [dimKey(dim({ length: 1, time: -1 })), [['m/s', 1]]],
]);

// --- Tokenizer ---------------------------------------------------------------

type OpChar = '+' | '-' | '*' | '/' | '^' | '%' | '(' | ')' | ',' | '=';

type Token =
  | { type: 'num'; value: number; from: number; to: number }
  | { type: 'ident'; name: string; from: number; to: number }
  | { type: 'cursym'; code: string; from: number; to: number }
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

// Bare scale suffixes (`8k`, `32G`) apply only when the next char is not an
// identifier char — `8kB` falls through to the ident lexer and becomes a
// unit. Lowercase m/g/t are never scale suffixes (milli/grams/tonnes prose).
const SUFFIX_MULTIPLIER: Record<string, number> = {
  k: 1e3,
  K: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
};

// Spelled-out multipliers fold into a preceding number literal
// (`32 Billion` = 3.2e10), case-insensitively, before any unit attaches —
// so `3 Million MB` is 3 TB.
const WORD_MULTIPLIERS: Record<string, number> = {
  hundred: 100,
  thousand: 1e3,
  million: 1e6,
  billion: 1e9,
  trillion: 1e12,
};

const IDENT_START = /[A-Za-z_]/;
const IDENT_CHAR = /[A-Za-z0-9_]/;
const HEX_RE = /^0[xX][0-9a-fA-F]+/;
const BIN_RE = /^0[bB][01]+/;
const DIGIT_RE = /[0-9]/;

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
    if (DIGIT_RE.test(ch) || (ch === '.' && i + 1 < text.length && DIGIT_RE.test(text[i + 1]))) {
      const rest = text.slice(i);
      const radixMatch = HEX_RE.exec(rest) ?? BIN_RE.exec(rest);
      if (radixMatch) {
        tokens.push({
          type: 'num',
          value: Number(radixMatch[0]),
          from: base + i,
          to: base + i + radixMatch[0].length,
        });
        i += radixMatch[0].length;
        continue;
      }
      let end = i;
      let digits: string;
      if (ch === '.') {
        const fracMatch = /^\.\d+/.exec(rest)!;
        digits = fracMatch[0];
        end += fracMatch[0].length;
      } else {
        const intMatch = /^\d+/.exec(rest)!;
        digits = intMatch[0];
        end += intMatch[0].length;
        // Thousands-separated input: merge ` ddd` groups (single space,
        // exactly three digits, not followed by a fourth).
        let group;
        while (text[end] === ' ' && (group = /^\d{3}(?!\d)/.exec(text.slice(end + 1)))) {
          digits += group[0];
          end += 4;
        }
        const fracMatch = /^\.\d+/.exec(text.slice(end));
        if (fracMatch) {
          digits += fracMatch[0];
          end += fracMatch[0].length;
        }
      }
      let value = Number(digits);
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
    if (CURRENCY_SYMBOLS.has(ch)) {
      tokens.push({ type: 'cursym', code: ch, from: base + i, to: base + i + 1 });
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
  | { kind: 'quantity'; value: number; dim: Dim; code: string | null }
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

/** Display override requested with `expr in <target>`. */
type Conversion =
  | { type: 'unit'; text: string; factor: number; dim: Dim; code: string | null }
  | { type: 'radix'; radix: 16 | 2 };

interface FunctionSpec {
  minArity: number;
  maxArity: number;
  apply: (args: number[]) => number;
}

const DEG = Math.PI / 180;

const FUNCTIONS: Record<string, FunctionSpec> = {
  sqrt: { minArity: 1, maxArity: 1, apply: ([x]) => Math.sqrt(x) },
  abs: { minArity: 1, maxArity: 1, apply: ([x]) => Math.abs(x) },
  round: { minArity: 1, maxArity: 1, apply: ([x]) => Math.round(x) },
  floor: { minArity: 1, maxArity: 1, apply: ([x]) => Math.floor(x) },
  ceil: { minArity: 1, maxArity: 1, apply: ([x]) => Math.ceil(x) },
  log2: { minArity: 1, maxArity: 1, apply: ([x]) => Math.log2(x) },
  log10: { minArity: 1, maxArity: 1, apply: ([x]) => Math.log10(x) },
  ln: { minArity: 1, maxArity: 1, apply: ([x]) => Math.log(x) },
  exp: { minArity: 1, maxArity: 1, apply: ([x]) => Math.exp(x) },
  pow: { minArity: 2, maxArity: 2, apply: ([x, y]) => Math.pow(x, y) },
  // Trig works in degrees — sin(30) = 0.5, like calculator apps.
  sin: { minArity: 1, maxArity: 1, apply: ([x]) => Math.sin(x * DEG) },
  cos: { minArity: 1, maxArity: 1, apply: ([x]) => Math.cos(x * DEG) },
  tan: { minArity: 1, maxArity: 1, apply: ([x]) => Math.tan(x * DEG) },
  asin: { minArity: 1, maxArity: 1, apply: ([x]) => Math.asin(x) / DEG },
  acos: { minArity: 1, maxArity: 1, apply: ([x]) => Math.acos(x) / DEG },
  atan: { minArity: 1, maxArity: 1, apply: ([x]) => Math.atan(x) / DEG },
  min: { minArity: 1, maxArity: Infinity, apply: (args) => Math.min(...args) },
  max: { minArity: 1, maxArity: Infinity, apply: (args) => Math.max(...args) },
};

type VarNode = Extract<AstNode, { kind: 'var' }>;
type IdentToken = Extract<Token, { type: 'ident' }>;

/**
 * Recursive-descent parser over a token slice. Grammar (precedence low→high):
 *
 *   top            := additive ("in" (unit | "hex" | "bin"))?
 *   additive       := multiplicative (("+"|"-") multiplicative)*   left-assoc
 *   multiplicative := unary (("*"|"/") unary)*                     left-assoc
 *   unary          := ("-"|"+") unary | power
 *   power          := postfix ("^" unary)?                         right-assoc
 *   postfix        := primary "%"?                                 % after number literals only
 *   primary        := NUMBER word-mult? unit? | CURRENCY-SYMBOL NUMBER word-mult?
 *                   | IDENT | IDENT "(" args ")" | "(" expr ")"
 *   unit           := (UNIT | CURRENCY) ("/" (UNIT | CURRENCY))?   attached to the number
 *                                                                  (≤1 space; rate "/" must be tight)
 *
 * No implicit multiplication: adjacent operands are a parse error. In unit
 * position a known unit name wins over any same-named variable, so `6kJ/s`
 * stays a rate even if `s` is defined.
 */
const NO_ALIASES: ReadonlyMap<string, string> = new Map();

class Parser {
  private pos = 0;
  private readonly tokens: readonly Token[];
  private readonly currencyAliases: ReadonlyMap<string, string>;
  readonly varNodes: VarNode[] = [];

  constructor(tokens: readonly Token[], currencyAliases: ReadonlyMap<string, string> = NO_ALIASES) {
    this.tokens = tokens;
    this.currencyAliases = currencyAliases;
  }

  /** Apply `$ = USD`-style notation aliases to a currency marker. */
  private resolveTag(marker: string): string {
    return this.currencyAliases.get(marker) ?? marker;
  }

  /** Parse the whole token slice as one expression with an optional `in` conversion. */
  parseTop(): { node: AstNode; conversion: Conversion | null } {
    if (this.tokens.length === 0) throw new MathError('empty expression');
    const node = this.parseAdditive();
    let conversion: Conversion | null = null;
    const next = this.peek();
    if (next?.type === 'ident' && next.name === 'in') {
      this.pos++;
      conversion = this.parseConversionTarget();
    }
    if (this.pos !== this.tokens.length) throw new MathError('unexpected trailing tokens');
    return { node, conversion };
  }

  private parseConversionTarget(): Conversion {
    const token = this.peek();
    if (token?.type !== 'ident') throw new MathError('expected conversion target');
    this.pos++;
    if (token.name === 'hex') return { type: 'radix', radix: 16 };
    if (token.name === 'bin') return { type: 'radix', radix: 2 };
    const base = this.resolveUnitOrCurrency(token.name);
    if (base === null) throw new MathError(`unknown unit '${token.name}'`);
    const divisor = this.tryParseRateDivisor(token.to);
    if (divisor) {
      return {
        type: 'unit',
        text: `${token.name}/${divisor.name}`,
        factor: base.factor / divisor.factor,
        dim: dimCombine(base.dim, divisor.dim, -1),
        code: unifyCodes(base.code, divisor.code),
      };
    }
    return { type: 'unit', text: token.name, factor: base.factor, dim: base.dim, code: base.code };
  }

  private resolveUnitOrCurrency(
    name: string
  ): { factor: number; dim: Dim; code: string | null } | null {
    const unit = UNITS[name];
    if (unit !== undefined) return { factor: unit.factor, dim: unit.dim, code: null };
    const code = resolveCurrencyCode(name);
    if (code !== null) return { factor: 1, dim: MONEY, code: this.resolveTag(code) };
    return null;
  }

  /** Consume a tight `/unit` (as in `kJ/s` or `GB/NOK`) if present; never consumes on failure. */
  private tryParseRateDivisor(
    endOfPrev: number
  ): { name: string; factor: number; dim: Dim; code: string | null } | null {
    const slash = this.tokens[this.pos];
    const unitToken = this.tokens[this.pos + 1];
    if (
      slash?.type === 'op' &&
      slash.op === '/' &&
      slash.from === endOfPrev &&
      unitToken?.type === 'ident' &&
      unitToken.from === slash.to
    ) {
      const resolved = this.resolveUnitOrCurrency(unitToken.name);
      if (resolved !== null) {
        this.pos += 2;
        return { name: unitToken.name, ...resolved };
      }
    }
    return null;
  }

  /** Consume `NUMBER word-mult? ("/" unit)?` after a currency prefix ($, kr, USD). */
  private parseMoneyAmount(code: string, endOfPrefix: number): AstNode {
    const numToken = this.peek();
    if (numToken?.type !== 'num' || numToken.from - endOfPrefix > 1) {
      throw new MathError(`expected a number after '${code}'`);
    }
    this.pos++;
    let value = numToken.value;
    let end = numToken.to;
    const wordToken = this.peek();
    if (
      wordToken?.type === 'ident' &&
      wordToken.from - end <= 1 &&
      WORD_MULTIPLIERS[wordToken.name.toLowerCase()] !== undefined
    ) {
      this.pos++;
      value *= WORD_MULTIPLIERS[wordToken.name.toLowerCase()];
      end = wordToken.to;
    }
    const divisor = this.tryParseRateDivisor(end);
    if (divisor) {
      return {
        kind: 'quantity',
        value: value / divisor.factor,
        dim: dimCombine(MONEY, divisor.dim, -1),
        code: unifyCodes(code, divisor.code),
      };
    }
    return { kind: 'quantity', value, dim: MONEY, code };
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
      let value = token.value;
      let end = token.to;
      const wordToken = this.peek();
      if (
        wordToken?.type === 'ident' &&
        wordToken.from - end <= 1 &&
        WORD_MULTIPLIERS[wordToken.name.toLowerCase()] !== undefined
      ) {
        this.pos++;
        value *= WORD_MULTIPLIERS[wordToken.name.toLowerCase()];
        end = wordToken.to;
      }
      const unitToken = this.peek();
      const attached =
        unitToken?.type === 'ident' && unitToken.from - end <= 1
          ? this.resolveUnitOrCurrency(unitToken.name)
          : null;
      if (attached !== null && unitToken?.type === 'ident') {
        this.pos++;
        const divisor = this.tryParseRateDivisor(unitToken.to);
        if (divisor) {
          return {
            kind: 'quantity',
            value: (value * attached.factor) / divisor.factor,
            dim: dimCombine(attached.dim, divisor.dim, -1),
            code: unifyCodes(attached.code, divisor.code),
          };
        }
        return { kind: 'quantity', value: value * attached.factor, dim: attached.dim, code: attached.code };
      }
      return { kind: 'num', value };
    }
    if (token.type === 'cursym') {
      // Prefix symbol form: $320 (optionally $3 Billion).
      this.pos++;
      return this.parseMoneyAmount(this.resolveTag(token.code), token.to);
    }
    if (token.type === 'ident') {
      // Prefix code form: `kr 320`, `USD 100` — a currency name directly
      // before a number wins over a same-named variable, like unit position.
      const prefixCode = resolveCurrencyCode(token.name);
      const next = this.tokens[this.pos + 1];
      if (prefixCode !== null && next?.type === 'num' && next.from - token.to <= 1) {
        this.pos++;
        return this.parseMoneyAmount(this.resolveTag(prefixCode), token.to);
      }
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

function requireDimless(q: Quantity): number {
  if (!isDimless(q.dim)) throw new MathError('expected a dimensionless value');
  return q.value;
}

function evalNode(node: AstNode, env: ReadonlyMap<string, Quantity>): Quantity {
  switch (node.kind) {
    case 'num':
      return { value: node.value, dim: DIMLESS, code: null };
    case 'quantity':
      return { value: node.value, dim: node.dim, code: node.code };
    case 'var': {
      const value = env.get(node.name);
      if (value === undefined) throw new MathError(`undefined variable '${node.name}'`);
      return value;
    }
    case 'percent':
      return { value: evalNode(node.operand, env).value / 100, dim: DIMLESS, code: null };
    case 'neg': {
      const operand = evalNode(node.operand, env);
      return { value: -operand.value, dim: operand.dim, code: operand.code };
    }
    case 'group':
      return evalNode(node.operand, env);
    case 'call': {
      const fn = FUNCTIONS[node.name];
      if (fn === undefined) throw new MathError(`unknown function '${node.name}'`);
      if (node.args.length < fn.minArity || node.args.length > fn.maxArity) {
        throw new MathError(`wrong arity for '${node.name}'`);
      }
      const args = node.args.map((arg) => requireDimless(evalNode(arg, env)));
      return { value: fn.apply(args), dim: DIMLESS, code: null };
    }
    case 'binary': {
      const left = evalNode(node.left, env);
      // Apple-style relative percent: X + 20% = X×1.2, X - 20% = X×0.8.
      // Only when the right operand is literally a percent node — products,
      // groups, and variables holding percent-derived values stay plain.
      if ((node.op === '+' || node.op === '-') && node.right.kind === 'percent') {
        const fraction = evalNode(node.right, env).value;
        const scaled = node.op === '+' ? 1 + fraction : 1 - fraction;
        return { value: left.value * scaled, dim: left.dim, code: left.code };
      }
      const right = evalNode(node.right, env);
      switch (node.op) {
        case '+':
        case '-': {
          if (!dimEq(left.dim, right.dim)) throw new MathError('mismatched units');
          const code = unifyCodes(left.code, right.code);
          const value = node.op === '+' ? left.value + right.value : left.value - right.value;
          return { value, dim: left.dim, code };
        }
        case '*':
          return qty(
            left.value * right.value,
            dimCombine(left.dim, right.dim, 1),
            unifyCodes(left.code, right.code)
          );
        case '/':
          return qty(
            left.value / right.value,
            dimCombine(left.dim, right.dim, -1),
            unifyCodes(left.code, right.code)
          );
        case '^':
          return {
            value: Math.pow(requireDimless(left), requireDimless(right)),
            dim: DIMLESS,
            code: null,
          };
      }
    }
  }
}

/**
 * Evaluate a standalone expression string against an environment of plain
 * (dimensionless) numbers. Returns the magnitude in base units, or null if
 * the expression doesn't fully parse and evaluate to a finite number.
 */
export function evaluateExpression(
  src: string,
  env: ReadonlyMap<string, number>
): number | null {
  const tokens = tokenize(src, 0);
  if (tokens === null || tokens.length === 0) return null;
  const quantities = new Map<string, Quantity>();
  for (const [name, value] of env) quantities.set(name, { value, dim: DIMLESS, code: null });
  try {
    const { node } = new Parser(tokens).parseTop();
    const result = evalNode(node, quantities);
    return Number.isFinite(result.value) ? result.value : null;
  } catch (error) {
    if (error instanceof MathError) return null;
    throw error;
  }
}

// --- Result formatting -------------------------------------------------------

/**
 * Format a plain number like the Apple Notes reference: space-grouped
 * thousands (`62 914 560 000`), float noise removed (0.1+0.2 → "0.3"),
 * locale-independent. Extreme magnitudes fall back to JS exponential.
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

/** Money renders like its marker was typed: symbols prefix (`$320`, `-$5`),
 * word markers suffix (`320 kr`, `320 USD`). */
function formatMoney(value: number, tag: string): string {
  if (CURRENCY_SYMBOLS.has(tag)) {
    return `${value < 0 ? '-' : ''}${tag}${formatResult(Math.abs(value))}`;
  }
  return `${formatResult(value)} ${tag}`;
}

/** Largest unit the magnitude reaches (`8 200 000` data → MB). */
function pickByMagnitude(
  family: ReadonlyArray<[label: string, factor: number]>,
  value: number
): [label: string, factor: number] {
  const magnitude = Math.abs(value);
  let best = family[0];
  for (const entry of family) {
    if (magnitude >= entry[1]) best = entry;
  }
  return best;
}

/**
 * Format a quantity for display, honoring an `in` conversion if given.
 * Returns null when there is no meaningful rendering (unknown dimension
 * combination, conversion dimension or currency mismatch, hex/bin of a
 * non-integer).
 */
function formatQuantity(q: Quantity, conversion: Conversion | null): string | null {
  if (conversion?.type === 'radix') {
    if (!isDimless(q.dim)) return null;
    const v = Number(q.value.toPrecision(12));
    if (!Number.isSafeInteger(v)) return null;
    const digits = Math.abs(v).toString(conversion.radix).toUpperCase();
    const prefix = conversion.radix === 16 ? '0x' : '0b';
    return `${v < 0 ? '-' : ''}${prefix}${digits}`;
  }
  if (conversion?.type === 'unit') {
    if (!dimEq(q.dim, conversion.dim)) return null;
    try {
      unifyCodes(q.code, conversion.code);
    } catch {
      return null;
    }
    return `${formatResult(q.value / conversion.factor)} ${conversion.text}`;
  }
  if (isDimless(q.dim)) return formatResult(q.value);
  if (q.dim.currency === 0) {
    const family = DISPLAY_FAMILIES.get(dimKey(q.dim));
    if (family === undefined) return null;
    const best = pickByMagnitude(family, q.value);
    return `${formatResult(q.value / best[1])} ${best[0]}`;
  }
  const residual = { ...q.dim, currency: 0 };
  if (q.dim.currency === 1) {
    // Plain money, rendered like the marker was typed: `$320`, `320 kr`.
    if (isDimless(residual)) return formatMoney(q.value, q.code!);
    // Price per something: scale the denominator so the number reads well —
    // 1e-7 NOK per byte becomes `100 NOK/GB`.
    const family = DISPLAY_FAMILIES.get(dimKey(dimCombine(DIMLESS, residual, -1)));
    if (family === undefined) return null;
    let best = family[0];
    for (const entry of family) {
      if (Math.abs(q.value) * entry[1] < 1000) best = entry;
    }
    return `${formatMoney(q.value * best[1], q.code!)}/${best[0]}`;
  }
  if (q.dim.currency === -1) {
    // Something per money: `32GB / 3200 NOK` becomes `10 MB/NOK`.
    const family = DISPLAY_FAMILIES.get(dimKey(residual));
    if (family === undefined) return null;
    const best = pickByMagnitude(family, q.value);
    return `${formatResult(q.value / best[1])} ${best[0]}/${q.code}`;
  }
  return null;
}

// --- Document analysis -------------------------------------------------------

const LIST_MARKER_RE = /^\s*(?:[-*+]|\d+[.)])\s+/;

/** Built-in constants, seeded into scope; user definitions shadow them. */
const CONSTANTS: ReadonlyArray<[string, number]> = [
  ['pi', Math.PI],
  ['e', Math.E],
];

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
  const env = new Map<string, Quantity>();
  for (const [name, value] of CONSTANTS) env.set(name, { value, dim: DIMLESS, code: null });
  // `$ = USD`-style notation aliases; scoped top-to-bottom like variables.
  const currencyAliases = new Map<string, string>();

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

    // `$ = USD` assigns a currency notation: from here down the marker
    // ($, €, £, ¥, kr) means that ISO code. Overridable further down.
    if (tokens.length === 3) {
      const [markerToken, eqToken, codeToken] = tokens;
      const marker =
        markerToken.type === 'cursym'
          ? markerToken.code
          : markerToken.type === 'ident' && markerToken.name === 'kr'
            ? 'kr'
            : null;
      if (
        marker !== null &&
        eqToken.type === 'op' &&
        eqToken.op === '=' &&
        codeToken.type === 'ident' &&
        CURRENCY_CODE_RE.test(codeToken.name)
      ) {
        currencyAliases.set(marker, codeToken.name);
        results[i] = {
          kind: 'definition',
          nameSpan: { from: markerToken.from, to: markerToken.to },
          refSpans: [{ from: codeToken.from, to: codeToken.to }],
          value: 0,
        };
        continue;
      }
    }

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

    const parser = new Parser(exprTokens, currencyAliases);
    let quantity: Quantity;
    let conversion: Conversion | null;
    try {
      const parsed = parser.parseTop();
      conversion = parsed.conversion;
      quantity = evalNode(parsed.node, env);
    } catch (error) {
      if (error instanceof MathError) continue;
      throw error;
    }
    if (!Number.isFinite(quantity.value)) continue;

    const resultText = resultOffset === undefined ? null : formatQuantity(quantity, conversion);
    // An evaluation request we can't render meaningfully stays inert; a
    // definition still defines (its dimension may only combine usefully
    // later), it just shows no ghost result.
    if (nameToken === undefined && resultText === null) continue;

    const result: MathLineResult = {
      kind: nameToken === undefined ? 'evaluation' : 'definition',
      refSpans: parser.varNodes.map((node) => node.span),
      value: quantity.value,
    };
    if (nameToken !== undefined) {
      env.set(nameToken.name, quantity);
      result.nameSpan = { from: nameToken.from, to: nameToken.to };
    }
    if (resultText !== null && resultOffset !== undefined) {
      if (nameToken !== undefined) result.kind = 'definition-evaluation';
      result.resultText = resultText;
      result.resultOffset = resultOffset;
    }
    results[i] = result;
  }

  return results;
}
