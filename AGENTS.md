# TagLingo

This file contains TagLingo-specific agent instructions. Global agent policy remains inherited from agent-dock. Provider-specific instruction files should reference this file rather than duplicate it.

## Agent skills

### Issue tracker

Issues and PRDs are tracked in this repository's GitHub Issues using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, and `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

This repository uses the single-context layout: `CONTEXT.md` and `docs/adr/` at the repository root. See `docs/agents/domain.md`.
