import { it, expect } from 'vitest';
import worker from '../index';

it('worker exports a fetch handler', () => {
  expect(typeof worker.fetch).toBe('function');
});
