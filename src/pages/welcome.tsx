import { useNavigate } from 'react-router-dom';
import { ProfileFields } from '@/components/profile-fields';

/**
 * The one step between a brand-new Google account and the app: the class the
 * student is in, and the subjects they care about. Reached from /auth/callback
 * when the account has no class yet, and by RequireSession for anyone who left
 * before finishing it — a note written without a class is invisible to the
 * class-scoped feeds, so this is not skippable.
 */
export function Welcome() {
  const nav = useNavigate();
  return (
    <div data-screen-label="Welcome" className="px-6 md:px-10 pt-10 pb-16 flex justify-center">
      <div className="w-[min(100%,680px)] flex flex-col gap-7">
        <div className="flex flex-col gap-3">
          <span className="meta">Welcome to Notarium</span>
          <h1 className="text-[clamp(30px,4.4vw,56px)] [text-wrap:balance]">
            Two things, then you are in
          </h1>
          <p className="text-[15px] leading-[1.5] text-neutral-700 max-w-[56ch] [text-wrap:pretty]">
            Your name and photo came from your Google account. Tell us which class you are in so
            your notes reach the right people, and pick the subjects you want the app to lean
            towards.
          </p>
        </div>
        <div className="border-t-2 border-ink pt-8">
          <ProfileFields
            saveLabel="Enter Notarium"
            onSaved={() => nav('/app/home', { replace: true })}
          />
        </div>
      </div>
    </div>
  );
}
