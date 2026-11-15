import { describe, expect, it } from 'vitest';
import * as E from '../src/core/engine.js';

describe('saved loops', () => {
  it('ignore fields they do not know (a speed saved by a build that had one)', () => {
    const back = E.loopsFromSaved({ loops: [{ a: 1, b: 5, rate: 0.75 }] }, { count: 2, infinite: false });
    expect(back).toHaveLength(1);
    expect(back[0]).not.toHaveProperty('rate');
    expect(E.serializeLoops(back)[0]).not.toHaveProperty('rate');
  });
});
