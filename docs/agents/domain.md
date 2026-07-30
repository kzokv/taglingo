# Domain Docs

How engineering skills should consume TagLingo's domain documentation.

## Before exploring, read these

- `CONTEXT.md` at the repository root.
- `docs/adr/` entries relevant to the area being changed.

If these files do not exist, proceed silently. Domain-modeling skills create them when terminology or decisions are resolved.

## File structure

TagLingo uses a single-context layout:

/
├── CONTEXT.md
├── docs/
│   └── adr/
└── src/

## Use the glossary's vocabulary

When naming a domain concept in issues, proposals, tests, or code, use the terminology defined in `CONTEXT.md`.

If a needed concept is absent, reconsider whether it is project terminology or record the gap for domain modeling.

## Flag ADR conflicts

If proposed work contradicts an existing ADR, surface that conflict explicitly rather than silently overriding the decision.
