import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useAsync } from './use-async';

/** A promise the test settles by hand, so it can control the order results arrive in. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('useAsync', () => {
  it('starts loading and lands the data', async () => {
    const { result } = renderHook(() => useAsync(() => Promise.resolve('notes'), []));
    expect(result.current).toMatchObject({ loading: true, data: null, error: null });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current).toMatchObject({ data: 'notes', error: null });
  });

  it('does nothing while disabled (guest mode)', () => {
    const fn = vi.fn(() => Promise.resolve('never'));
    const { result } = renderHook(() => useAsync(fn, [], false));
    expect(result.current).toMatchObject({ loading: false, data: null, error: null });
    expect(fn).not.toHaveBeenCalled();
  });

  it('surfaces the error message, and retry() clears it and runs the loader again', async () => {
    const fn = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('second try');
    const { result } = renderHook(() => useAsync(fn, []));
    await waitFor(() => expect(result.current.error).toBe('boom'));
    expect(result.current).toMatchObject({ loading: false, data: null });

    act(() => result.current.retry());
    expect(result.current).toMatchObject({ loading: true, error: null });
    await waitFor(() => expect(result.current.data).toBe('second try'));
    expect(result.current).toMatchObject({ loading: false, error: null });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('ignores a slower earlier call once the deps have moved on', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const { result, rerender } = renderHook(
      ({ id }) => useAsync(() => (id === 1 ? first.promise : second.promise), [id]),
      { initialProps: { id: 1 } },
    );

    rerender({ id: 2 });
    await act(async () => {
      second.resolve('two');
      await second.promise;
    });
    expect(result.current).toMatchObject({ data: 'two', loading: false });

    await act(async () => {
      first.resolve('one');
      await first.promise;
    });
    expect(result.current.data).toBe('two');
  });

  it('ignores a rejection from a call that was already superseded', async () => {
    const first = deferred<string>();
    const second = deferred<string>();
    const { result, rerender } = renderHook(
      ({ id }) => useAsync(() => (id === 1 ? first.promise : second.promise), [id]),
      { initialProps: { id: 1 } },
    );

    rerender({ id: 2 });
    await act(async () => {
      second.resolve('two');
      await second.promise;
    });
    await act(async () => {
      first.reject(new Error('late failure'));
      await first.promise.catch(() => undefined);
    });
    expect(result.current).toMatchObject({ data: 'two', error: null });
  });
});
