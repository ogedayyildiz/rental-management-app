import { describe, expect, it } from 'vitest';
import { diffErrorCodes } from './errors.js';

describe('diffErrorCodes', () => {
  it('detects opened and cleared codes', () => {
    expect(diffErrorCodes(['E101', 'E202'], ['E202', 'E305'])).toEqual({
      opened: ['E305'],
      cleared: ['E101'],
    });
  });

  it('reports nothing when unchanged', () => {
    expect(diffErrorCodes(['E101'], ['E101'])).toEqual({ opened: [], cleared: [] });
  });
});
