import type { KeyboardEvent } from 'react';

/**
 * Props that make a non-button element behave like one.
 *
 * A bare `<div onClick>` is invisible to a keyboard and announced as nothing by
 * a screen reader — the card looks clickable to a mouse and does not exist to
 * anyone else. Spreading this adds the role, the tab stop, and the Enter/Space
 * handling that a real <button> would have given for free.
 *
 *   <div {...activatable(() => open(note), `Open ${note.title}`)}>
 *
 * Prefer an actual <button> or <a> when the element's styling allows it; this
 * is for cards whose layout a button element would fight.
 */
export function activatable(onActivate: () => void, label: string) {
  return {
    role: 'button',
    tabIndex: 0,
    'aria-label': label,
    onClick: onActivate,
    onKeyDown: (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      // Space scrolls the page by default; Enter can submit an enclosing form.
      event.preventDefault();
      onActivate();
    },
  };
}
