import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { BookingDialog, buildBooking } from '@/components/tutors-booking';
import { AppProvider, useApp } from '@/store';

/** Mounts the dialog the way Tutors does: from the store's `booking`, opened by a button that should get focus back. */
function Fixture() {
  const { booking, set } = useApp();
  return (
    <>
      <button type="button" onClick={() => set({ booking: buildBooking({ name: 'Paul' }) })}>
        Book Paul
      </button>
      {booking && <BookingDialog booking={booking} />}
    </>
  );
}
const open = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByRole('button', { name: 'Book Paul' }));
  return screen.getByRole('dialog', { name: 'Book Paul' });
};

describe('BookingDialog focus management (W5.2)', () => {
  it('focuses its first control on open, closes on Escape, and hands focus back to the trigger', async () => {
    const user = userEvent.setup();
    render(
      <AppProvider>
        <Fixture />
      </AppProvider>,
    );
    const dialog = await open(user);
    expect(within(dialog).getByRole('button', { name: 'Close' })).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Book Paul' })).toHaveFocus();
  });

  it('keeps Tab and Shift+Tab inside the dialog', async () => {
    const user = userEvent.setup();
    render(
      <AppProvider>
        <Fixture />
      </AppProvider>,
    );
    const dialog = await open(user);
    const first = within(dialog).getByRole('button', { name: 'Close' });
    const last = within(dialog).getByRole('button', { name: 'Cancel' });

    await user.tab({ shift: true });
    expect(last).toHaveFocus();
    await user.tab();
    expect(first).toHaveFocus();
  });

  it('returns focus to the trigger after Cancel too', async () => {
    const user = userEvent.setup();
    render(
      <AppProvider>
        <Fixture />
      </AppProvider>,
    );
    const dialog = await open(user);
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('button', { name: 'Book Paul' })).toHaveFocus();
  });
});
