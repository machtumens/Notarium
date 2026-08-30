// Exam hall (redesign option 2e) — the one-question-at-a-time flow.
//
// These cover the behaviour the redesign introduced: the navigator strip, the
// flag toggle, Back/Next paging, and — most importantly — that the submit
// contract Phase 4 established still fires with an index-aligned answers array.
// The grading code downstream depends on that alignment, so it is the assertion
// that actually protects users.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import TestSimulatorPage from '../TestSimulatorPage';
import type { StructuredQuestion } from '../QuizBuilderPage';

const QUESTIONS: StructuredQuestion[] = [
  {
    type: 'mcq',
    question: 'Wavelength of a 340 m/s wave at 170 Hz?',
    options: ['0.5 m', '2 m', '20 m'],
    correct_answer: 1,
  },
  {
    type: 'true_false',
    question: 'Alkenes are saturated.',
    options: ['True', 'False'],
    correct_answer: 1,
  },
  { type: 'short_answer', question: 'Name the phases of mitosis.', model_answer: 'PMAT' },
];

function setup(onSubmit = vi.fn()) {
  render(<TestSimulatorPage questions={QUESTIONS} durationSec={600} onSubmit={onSubmit} />);
  return onSubmit;
}

describe('Exam hall — paging', () => {
  it('shows one question at a time, starting at the first', () => {
    setup();
    expect(screen.getByText(/Question 1 of 3/)).toBeTruthy();
    expect(screen.getByText(QUESTIONS[0].question)).toBeTruthy();
    expect(screen.queryByText(QUESTIONS[1].question)).toBeNull();
  });

  it('Next advances and Back returns', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText(QUESTIONS[1].question)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(screen.getByText(QUESTIONS[0].question)).toBeTruthy();
  });

  it('Back is disabled on the first question', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Back' }).hasAttribute('disabled')).toBe(true);
  });

  it('the navigator jumps straight to any question', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /^Question 3/ }));
    expect(screen.getByText(QUESTIONS[2].question)).toBeTruthy();
  });
});

describe('Exam hall — navigator state', () => {
  it('marks a question answered once an option is chosen', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Question 1, not answered' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /0\.5 m/ }));
    expect(screen.getByRole('button', { name: 'Question 1, answered' })).toBeTruthy();
  });

  it('counts a short answer as answered only when it has text', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: /^Question 3/ }));
    expect(screen.getByRole('button', { name: 'Question 3, not answered' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('answer 3'), { target: { value: 'PMAT' } });
    expect(screen.getByRole('button', { name: 'Question 3, answered' })).toBeTruthy();
  });

  it('flagging is reflected in the navigator and is reversible', () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Flag' }));
    expect(screen.getByRole('button', { name: 'Question 1, not answered, flagged' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Flagged' }));
    expect(screen.getByRole('button', { name: 'Question 1, not answered' })).toBeTruthy();
  });
});

describe('Exam hall — submit contract', () => {
  it('submits an index-aligned answers array, including unanswered slots', () => {
    const onSubmit = setup();
    fireEvent.click(screen.getByRole('button', { name: /2 m/ })); // q1 -> index 1
    fireEvent.click(screen.getByRole('button', { name: /^Question 3/ }));
    fireEvent.change(screen.getByLabelText('answer 3'), { target: { value: 'PMAT' } });
    // Q3 is the last question, so the primary pill reads "Submit test"; the
    // dashed "Submit test now" shortcut only renders on non-final questions.
    fireEvent.click(screen.getByRole('button', { name: 'Submit test' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const answers = onSubmit.mock.calls[0][0];
    expect(answers).toHaveLength(3);
    expect(answers[0].selectedIndex).toBe(1);
    expect(answers[1].selectedIndex).toBeNull(); // untouched, still present
    expect(answers[2].text).toBe('PMAT');
  });

  it('can be submitted from the last question', () => {
    const onSubmit = setup();
    fireEvent.click(screen.getByRole('button', { name: /^Question 3/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit test' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('submits only once even if the button is hit repeatedly', () => {
    const onSubmit = setup();
    const btn = screen.getByRole('button', { name: /Submit test now/ });
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
