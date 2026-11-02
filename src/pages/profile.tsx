import { useState } from 'react';
import { ProfileFields } from '@/components/profile-fields';
import { useApp } from '@/store';

/** Profile: who you are on Notarium. Name and photo come from Google; class and focus subjects are yours to set. */
export function Profile() {
  const { session } = useApp();
  const [saved, setSaved] = useState(false);
  const user = session?.kind === 'user' ? session.user : null;
  return (
    <div data-screen-label="Profile" className="flex flex-col gap-8 max-w-[680px]">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 border-t border-ink pt-4 text-[15px]">
        <dt className="meta self-center">Name</dt>
        <dd className="font-bold">{user?.name || '—'}</dd>
        <dt className="meta self-center">Email</dt>
        <dd className="truncate">{user?.email || '—'}</dd>
      </dl>
      <div className="border-t border-ink pt-5 flex flex-col gap-4">
        <ProfileFields saveLabel="Save profile" onSaved={() => setSaved(true)} />
        {saved && (
          <p role="status" className="text-[14px] font-bold">
            Saved.
          </p>
        )}
      </div>
    </div>
  );
}
