import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { SubjectsPage, LeaderboardPage, LibraryMapPage } from '../lazyPages';

// Thin route wrappers for the two shell pages that still own their loading state
// via props (SubjectsPage = Community grid, LeaderboardPage = Progress). Both
// pages self-fetch their own data
// inside their effects; these wrappers just supply the required isLoading/
// setIsLoading props (and, for Community, a navigate-based onSelectSubject) so the
// pages can mount as standalone routes without changing their signatures.
// Introduced in the Paperloop Phase 1 route migration.

export function CommunityRoute() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  // The constellation (redesign option 2c) is the default view; the original
  // card grid stays reachable at /community?view=grid so nothing is lost.
  if (params.get('view') !== 'grid') return <LibraryMapPage />;
  return (
    <SubjectsPage
      onSelectSubject={(subject) => navigate(`/community/${subject.id}`)}
      isLoading={isLoading}
      setIsLoading={setIsLoading}
    />
  );
}

export function ProgressRoute() {
  const [isLoading, setIsLoading] = useState(true);
  return <LeaderboardPage isLoading={isLoading} setIsLoading={setIsLoading} />;
}
