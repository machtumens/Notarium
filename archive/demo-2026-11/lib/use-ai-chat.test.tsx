import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppProvider, AI_SEED, useApp } from '@/store';
import { useAiChat } from './use-ai-chat';

const useHarness = () => ({
  store: useApp(),
  ai: useAiChat('aiThread', (t) => `canned reply to ${t}`),
});
const mount = () => renderHook(useHarness, { wrapper: AppProvider });

describe('useAiChat (guest demo)', () => {
  it('answers with the canned reply and never calls the worker', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { result } = mount();
    await waitFor(() => expect(result.current.store.sessionChecked).toBe(true));
    act(() => result.current.ai.send('hello'));
    expect(result.current.ai.thread).toEqual([
      ...AI_SEED,
      { who: 'me', text: 'hello' },
      { who: 'ai', text: 'canned reply to hello' },
    ]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('a per-send canned reply wins over the default, and the thread keeps growing in the store', async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.store.sessionChecked).toBe(true));
    act(() => result.current.ai.send('quiz me', 'Three questions, then.'));
    act(() => result.current.ai.send('more'));
    expect(result.current.ai.thread.slice(-4)).toEqual([
      { who: 'me', text: 'quiz me' },
      { who: 'ai', text: 'Three questions, then.' },
      { who: 'me', text: 'more' },
      { who: 'ai', text: 'canned reply to more' },
    ]);
    expect(result.current.store.aiThread).toHaveLength(AI_SEED.length + 4);
  });
});
