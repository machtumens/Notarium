# Feature Folders

This directory holds feature-scoped storage for large feature clusters.

## When to Create a Feature Folder

Create a feature folder when:

- The feature has 5+ related artifacts (plans, reports, references)
- The work is a new multi-phase project (3+ planned phases)
- The user explicitly names it as a substantial product area
- General-plan artifacts for a single topic reach the 5+ threshold

Do NOT create a feature folder when:

- The work is a single plan with no backlog
- The scope is unclear or cross-cutting
- The work is a small bug fix or trivial enhancement

## Folder Structure

Each feature folder has these subdirectories:

```
process/features/{feature-name}/
  active/       -- in-progress plans
  completed/    -- archived completed plans
  backlog/      -- deferred/future plans
  reports/      -- feature-specific operational reports
  references/   -- feature-specific research and reference docs
```

## Lifecycle

1. Create the folder when the feature qualifies (see above)
2. Store all feature-scoped artifacts in the appropriate subdirectory
3. When the feature is complete, archive plans to `completed/`
4. Keep the folder even after completion for historical reference
5. Remove only if explicitly cleaning up and no references point to it

## Naming

Use kebab-case for feature folder names: `user-authentication`, `dashboard-redesign`, `api-v2`
