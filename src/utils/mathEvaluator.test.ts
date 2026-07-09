import { describe, it, expect } from 'vitest';
import { analyzeDocument, formatResult } from './mathEvaluator';
import type { MathLineResult } from './mathEvaluator';

/** Analyze `line` with optional preceding lines; return the last line's result. */
function analyzeLine(line: string, prelude: string[] = []): MathLineResult | null {
  const results = analyzeDocument([...prelude, line]);
  return results[results.length - 1];
}

function valueOf(line: string, prelude: string[] = []): number | undefined {
  return analyzeLine(line, prelude)?.value;
}

describe('arithmetic', () => {
  it('adds', () => {
    const result = analyzeLine('2 + 2 =');
    expect(result?.kind).toBe('evaluation');
    expect(result?.resultText).toBe('4');
  });

  it('respects parentheses', () => {
    expect(valueOf('2 + (3 × 4) =')).toBe(14);
  });

  it('handles ascii and unicode operators', () => {
    expect(valueOf('2 + 3 * 4 =')).toBe(14);
    expect(valueOf('10 ÷ 4 =')).toBe(2.5);
    expect(valueOf('10 / 4 =')).toBe(2.5);
  });

  it('makes ^ right-associative', () => {
    expect(valueOf('2 ^ 3 ^ 2 =')).toBe(512);
  });

  it('binds unary minus looser than ^, exponents may be signed', () => {
    expect(valueOf('-2 ^ 2 =')).toBe(-4);
    expect(valueOf('2 ^ -1 =')).toBe(0.5);
  });

  it('supports scientific style via ^', () => {
    expect(analyzeLine('32×10^9 =')?.resultText).toBe('32 000 000 000');
  });
});

describe('definitions and scoping', () => {
  it('defines and evaluates a variable', () => {
    const result = analyzeLine('x =', ['x = -3']);
    expect(result?.kind).toBe('evaluation');
    expect(result?.value).toBe(-3);
  });

  it('works without spaces', () => {
    expect(analyzeLine('x=-3')?.kind).toBe('definition');
  });

  it('resolves references and reports their spans', () => {
    const result = analyzeLine('y = x + 1', ['x = 5']);
    expect(result?.value).toBe(6);
    expect(result?.refSpans).toEqual([{ from: 4, to: 5 }]);
  });

  it('lets the nearest definition above win', () => {
    expect(valueOf('x =', ['x = 1', 'x = 2'])).toBe(2);
  });

  it('leaves forward references undefined', () => {
    const results = analyzeDocument(['y = x + 1', 'x = 5', 'y =']);
    expect(results[0]).toBeNull();
    expect(results[2]).toBeNull();
  });

  it('handles definition-evaluation lines', () => {
    const result = analyzeLine('Total = 2 × 3 =');
    expect(result?.kind).toBe('definition-evaluation');
    expect(result?.resultText).toBe('6');
    expect(result?.nameSpan).toEqual({ from: 0, to: 5 });
    expect(valueOf('Total =', ['Total = 2 × 3 ='])).toBe(6);
  });

  it('evaluates a bare variable reference', () => {
    expect(valueOf('ModelSize =', ['ModelSize = 5'])).toBe(5);
  });

  it('is case-sensitive', () => {
    expect(analyzeLine('x =', ['X = 5'])).toBeNull();
  });
});

describe('prose rejection', () => {
  it('ignores prose-shaped assignments with undefined references', () => {
    expect(analyzeLine('Deadline = Friday')).toBeNull();
    expect(analyzeLine('a = b')).toBeNull();
  });

  it('rejects chained assignments', () => {
    expect(analyzeLine('a = b = c')).toBeNull();
  });

  it('accepts the same shape once the reference is defined', () => {
    expect(analyzeLine('Deadline = Friday', ['Friday = 5'])?.kind).toBe('definition');
  });
});

describe('percentages', () => {
  it('evaluates a bare percent literal', () => {
    expect(valueOf('20% =')).toBe(0.2);
  });

  it('applies Apple-style relative percent on + and -', () => {
    expect(valueOf('100 + 20% =')).toBe(120);
    expect(valueOf('100 - 20% =')).toBe(80);
  });

  it('treats percent as a plain scalar elsewhere', () => {
    expect(valueOf('100 × 20% =')).toBe(20);
    expect(valueOf('20% + 100 =')).toBe(100.2);
    expect(valueOf('100 + (20%) =')).toBe(100.2);
    expect(valueOf('100 + 20% × 2 =')).toBe(100.4);
  });

  it('chains relative percents left-associatively', () => {
    expect(valueOf('50 + 50% + 10% =')).toBe(82.5);
  });
});

describe('unit suffixes', () => {
  it('expands k/K/M/G/T', () => {
    expect(analyzeLine('8k =')?.resultText).toBe('8 000');
    expect(analyzeLine('8K =')?.resultText).toBe('8 000');
    expect(analyzeLine('32G =')?.resultText).toBe('32 000 000 000');
    expect(analyzeLine('1.5M =')?.resultText).toBe('1 500 000');
    expect(analyzeLine('2T =')?.resultText).toBe('2 000 000 000 000');
  });

  it('treats glued known-unit idents as quantities, rejects unknown ones', () => {
    expect(analyzeLine('8km =')?.resultText).toBe('8 km');
    expect(analyzeLine('32g =')?.resultText).toBe('32 g');
    expect(analyzeLine('8m =')?.resultText).toBe('8 m');
    expect(analyzeLine('8foo =')).toBeNull();
    expect(analyzeLine('8qB =')).toBeNull();
  });
});

describe('functions', () => {
  it('evaluates builtins', () => {
    expect(valueOf('min(3, 5) =')).toBe(3);
    expect(valueOf('max(1,2,3) =')).toBe(3);
    expect(valueOf('sqrt(9) =')).toBe(3);
    expect(valueOf('round(2.5) =')).toBe(3);
    expect(valueOf('log2(8) =')).toBe(3);
    expect(valueOf('floor(1.9) =')).toBe(1);
    expect(valueOf('ceil(1.1) =')).toBe(2);
    expect(valueOf('abs(-2) =')).toBe(2);
  });

  it('rejects unknown functions and wrong arity', () => {
    expect(analyzeLine('nope(3) =')).toBeNull();
    expect(analyzeLine('sqrt() =')).toBeNull();
  });

  it('allows function names as variables outside call position', () => {
    expect(analyzeLine('min = 5')?.kind).toBe('definition');
  });
});

describe('silent errors', () => {
  it('hides non-finite results', () => {
    expect(analyzeLine('1 ÷ 0 =')).toBeNull();
    expect(analyzeLine('0 ÷ 0 =')).toBeNull();
    expect(analyzeLine('sqrt(-1) =')).toBeNull();
  });
});

describe('document structure', () => {
  it('ignores headings', () => {
    expect(analyzeLine('# Heading')).toBeNull();
    expect(analyzeLine('## H2 =')).toBeNull();
  });

  it('ignores fenced code and keeps its definitions out of scope', () => {
    const results = analyzeDocument(['```', 'x = 5', '```', 'x =']);
    expect(results.every((r) => r === null)).toBe(true);
  });

  it('ignores frontmatter', () => {
    const results = analyzeDocument(['---', 'x = 5', '---', 'x =']);
    expect(results.every((r) => r === null)).toBe(true);
  });

  it('ignores lines containing backticks', () => {
    expect(analyzeLine('`x` = 5')).toBeNull();
  });

  it('ignores checkbox tasks', () => {
    expect(analyzeLine('- [ ] task = done')).toBeNull();
  });

  it('does math in list items with offset spans', () => {
    const result = analyzeLine('- Total = 2 × 3 =');
    expect(result?.kind).toBe('definition-evaluation');
    expect(result?.nameSpan).toEqual({ from: 2, to: 7 });
    expect(result?.value).toBe(6);
  });

  it('strips comments', () => {
    expect(valueOf('x =', ['x = 5 # AWQ 4-bit'])).toBe(5);
  });

  it('places the result before a trailing comment', () => {
    const result = analyzeLine('2 + 2 = # check');
    expect(result?.resultText).toBe('4');
    expect(result?.resultOffset).toBe(7);
  });

  it('ignores setext underlines, lone =, empty lines, and bare expressions', () => {
    expect(analyzeLine('===')).toBeNull();
    expect(analyzeLine('=')).toBeNull();
    expect(analyzeLine('')).toBeNull();
    expect(analyzeLine('2 + 2')).toBeNull();
  });
});

describe('formatResult', () => {
  it('groups thousands with spaces', () => {
    expect(formatResult(62914560000)).toBe('62 914 560 000');
    expect(formatResult(1234.5678)).toBe('1 234.5678');
  });

  it('removes float noise', () => {
    expect(formatResult(0.1 + 0.2)).toBe('0.3');
  });

  it('normalizes negative zero', () => {
    expect(formatResult(-0)).toBe('0');
  });

  it('handles large grouped values', () => {
    expect(formatResult(19.2e9)).toBe('19 200 000 000');
  });
});

describe('extended functions and constants', () => {
  it('evaluates ln/exp/pow', () => {
    expect(analyzeLine('ln(e) =')?.resultText).toBe('1');
    expect(valueOf('exp(1) =')).toBeCloseTo(Math.E, 10);
    expect(analyzeLine('pow(2, 10) =')?.resultText).toBe('1 024');
  });

  it('does trig in degrees', () => {
    expect(analyzeLine('sin(30) =')?.resultText).toBe('0.5');
    expect(analyzeLine('cos(60) =')?.resultText).toBe('0.5');
    expect(analyzeLine('tan(45) =')?.resultText).toBe('1');
    expect(analyzeLine('asin(1) =')?.resultText).toBe('90');
    expect(analyzeLine('atan(1) =')?.resultText).toBe('45');
  });

  it('provides pi and e, shadowable by definitions', () => {
    expect(analyzeLine('pi =')?.resultText).toBe('3.14159265359');
    expect(valueOf('pi =', ['pi = 3'])).toBe(3);
    expect(valueOf('e + 1 =')).toBeCloseTo(Math.E + 1, 10);
  });
});

describe('thousands-separated input', () => {
  it('merges space-grouped digits', () => {
    expect(analyzeLine('16 000 000 000 =')?.resultText).toBe('16 000 000 000');
    expect(valueOf('1 234.5678 =')).toBe(1234.5678);
    expect(valueOf('1 000k =')).toBe(1_000_000);
  });

  it('only merges groups of exactly three digits', () => {
    expect(analyzeLine('1 23 =')).toBeNull();
    expect(analyzeLine('1 0000 =')).toBeNull();
  });

  it('does not interfere with function arguments', () => {
    expect(valueOf('min(1 000, 2) =')).toBe(2);
  });
});

describe('hex and binary', () => {
  it('parses literals', () => {
    expect(analyzeLine('0xFF =')?.resultText).toBe('255');
    expect(valueOf('0xff + 1 =')).toBe(256);
    expect(analyzeLine('0b1010 =')?.resultText).toBe('10');
  });

  it('converts output with in hex / in bin', () => {
    expect(analyzeLine('255 in hex =')?.resultText).toBe('0xFF');
    expect(analyzeLine('256 in hex =')?.resultText).toBe('0x100');
    expect(analyzeLine('10 in bin =')?.resultText).toBe('0b1010');
    expect(analyzeLine('-255 in hex =')?.resultText).toBe('-0xFF');
  });

  it('rejects malformed literals and non-integer conversions', () => {
    expect(analyzeLine('0x =')).toBeNull();
    expect(analyzeLine('0b2 =')).toBeNull();
    expect(analyzeLine('2.5 in hex =')).toBeNull();
    expect(analyzeLine('8MB in hex =')).toBeNull();
  });
});

describe('units', () => {
  it('renders auto-scaled results', () => {
    expect(analyzeLine('8MB =')?.resultText).toBe('8 MB');
    expect(analyzeLine('6kJ/s =')?.resultText).toBe('6 kW');
    expect(analyzeLine('8MB + 200kB =')?.resultText).toBe('8.2 MB');
    expect(analyzeLine('8MB / 2s =')?.resultText).toBe('4 MB/s');
    expect(analyzeLine('0.25h =')?.resultText).toBe('15 min');
    expect(analyzeLine('0.5kB =')?.resultText).toBe('500 B');
    expect(analyzeLine('8bit =')?.resultText).toBe('1 B');
    expect(analyzeLine('2GHz × 0.5 =')?.resultText).toBe('1 GHz');
  });

  it('accepts one space between number and unit', () => {
    expect(analyzeLine('8 MB =')?.resultText).toBe('8 MB');
    expect(analyzeLine('90 min =')?.resultText).toBe('1.5 h');
  });

  it('converts with in', () => {
    expect(analyzeLine('8MB in KiB =')?.resultText).toBe('7 812.5 KiB');
    expect(analyzeLine('1GiB in MB =')?.resultText).toBe('1 073.741824 MB');
    expect(analyzeLine('90min in h =')?.resultText).toBe('1.5 h');
    expect(analyzeLine('Speed in km/h =', ['Speed = 100m / 10s'])?.resultText).toBe('36 km/h');
  });

  it('handles bits and IEC spelling variants', () => {
    expect(analyzeLine('8MiB in kiB =')?.resultText).toBe('8 192 kiB');
    expect(analyzeLine('8Mb in MB =')?.resultText).toBe('1 MB');
    expect(analyzeLine('8Mb =')?.resultText).toBe('1 MB');
    expect(analyzeLine('1Gb in Mb =')?.resultText).toBe('1 000 Mb');
    expect(analyzeLine('8b =')?.resultText).toBe('1 B');
  });

  it('does dimensional arithmetic through variables', () => {
    expect(analyzeLine('Speed =', ['Speed = 100m / 10s'])?.resultText).toBe('10 m/s');
    expect(analyzeLine('X + 2MB =', ['X = 8MB'])?.resultText).toBe('10 MB');
    expect(analyzeLine('X / 3s =', ['X = 2s × 3s'])?.resultText).toBe('2 s');
    expect(analyzeLine('2GHz × 3s =')?.resultText).toBe('6 000 000 000');
  });

  it('applies relative percent to quantities', () => {
    expect(analyzeLine('8MB + 20% =')?.resultText).toBe('9.6 MB');
  });

  it('silently rejects mismatched or unrenderable dimensions', () => {
    expect(analyzeLine('8MB + 2s =')).toBeNull();
    expect(analyzeLine('8MB + 5 =')).toBeNull();
    expect(analyzeLine('(2s)^2 =')).toBeNull();
    expect(analyzeLine('2s × 3s =')).toBeNull();
    expect(analyzeLine('8MB in s =')).toBeNull();
    expect(analyzeLine('sqrt(4s) =')).toBeNull();
  });

  it('keeps bare scale suffixes dimensionless', () => {
    expect(analyzeLine('8k =')?.resultText).toBe('8 000');
    expect(analyzeLine('8kB =')?.resultText).toBe('8 kB');
  });
});

describe('screenshot scenario', () => {
  it('reproduces the LLM-sizing note', () => {
    const results = analyzeDocument([
      'Params = 32×10^9',
      'Quantization = 0.5 # AWQ 4-bit',
      'ModelSize = Params × Quantization',
      'ModelSize =',
      '',
      'ContextSize = 8×10^3',
      'Users = 30',
      '',
      'Layers = 64',
      'kvHeads = 8',
      'headDim = 128',
      'Bytes = 2',
      'KV = 2 × Layers × kvHeads × headDim × Bytes',
      '',
      'perUser = ContextSize×KV',
      'perUser =',
      '',
      'KVTotal = Users × perUser',
      'KVTotal =',
      '',
      'TotalReq = KVTotal + ModelSize',
      'TotalReq =',
    ]);
    expect(results[3]?.resultText).toBe('16 000 000 000');
    expect(results[15]?.resultText).toBe('2 097 152 000');
    expect(results[18]?.resultText).toBe('62 914 560 000');
    expect(results[21]?.resultText).toBe('78 914 560 000');
  });
});
