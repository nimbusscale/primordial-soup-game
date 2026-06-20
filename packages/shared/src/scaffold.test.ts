import { describe, expect, it } from 'vitest';
import { SHARED_PLACEHOLDER } from './index.js';

// Trivial smoke test so `npm test` reports a green run in M0.
// Replaced by the real config self-check tests in M1.
describe('M0 scaffold', () => {
  it('workspace imports resolve', () => {
    expect(SHARED_PLACEHOLDER).toBe(true);
  });
});
