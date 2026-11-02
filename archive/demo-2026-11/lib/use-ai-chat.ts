import { useApp, type Msg } from '@/store';

/**
 * One demo AI thread for guests: the design's canned reply, so the demo reads well. The thread
 * itself stays in the global store (`chat` for the note companion, `aiThread` for the AI surface)
 * so it survives navigation. Guest-only by design — main has no `/api/chat/*` routes (removed on
 * purpose), so accounts never see the surfaces that call this.
 */
export function useAiChat(key: 'chat' | 'aiThread', cannedReply: (text: string) => string) {
  const store = useApp();
  const thread = store[key];
  const append = (...msgs: Msg[]) => store.set((s) => ({ [key]: s[key].concat(msgs) }));
  const send = (text: string, canned?: string) =>
    append({ who: 'me', text }, { who: 'ai', text: canned ?? cannedReply(text) });
  return { thread, send };
}
