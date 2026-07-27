import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SubjectsPage, LeaderboardPage } from '../lazyPages';

// Thin route wrappers for the two shell pages that still own their loading state
// via props (SubjectsPage, LeaderboardPage). Both pages self-fetch their own data
// inside their effects; these wrappers just supply the required isLoading/
// setIsLoading props (and, for Subjects, a navigate-based onSelectSubject) so the
// pages can mount as standalone routes without changing their signatures.
// Introduced in the Paperloop Phase 1 route migration.

export function CommunityRoute() {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
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
