# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`
- **Read an issue**: `gh issue view <number> --comments`, also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments` with appropriate label and state filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply or remove labels**: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`
- **Close an issue**: `gh issue close <number> --comment "..."`

Infer the repository from `git remote -v`; `gh` does this automatically when run inside the clone.

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub shares one number space across issues and pull requests. Resolve an ambiguous reference such as `#42` with `gh pr view 42`, falling back to `gh issue view 42`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.

## Wayfinding operations

Used by `/wayfinder`. The map is a single issue with child issues as tickets.

- **Map**: an issue labelled `wayfinder:map`, holding Notes, Decisions-so-far, and Fog.
- **Child ticket**: a GitHub sub-issue linked to the map. Where sub-issues are unavailable, add it to a task list in the map and place `Part of #<map>` at the top of the child body.
- **Ticket labels**: `wayfinder:research`, `wayfinder:prototype`, `wayfinder:grilling`, or `wayfinder:task`.
- **Blocking**: use GitHub native issue dependencies. Where unavailable, use a `Blocked by: #<n>` line in the child body.
- **Claim**: assign the ticket to the driving developer with `gh issue edit <n> --add-assignee @me`.
- **Resolve**: comment with the result, close the ticket, and add its context pointer to the map's Decisions-so-far.
