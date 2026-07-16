# Aleron MD Product Design System: Agent Contract

## Authority

Start with `manifest.json`. The brand authority is `../brand-deck/index.html`. The human reference is `index.html`. Machine-applicable decisions live in `tokens.json`, `components.json`, and `acceptance.json`. If these artifacts disagree, stop and report the exact conflict. Do not silently choose one.

## Required load order

1. Read `manifest.json`.
2. Read this contract.
3. Read `tokens.json`, `components.json`, and `acceptance.json`.
4. Read the product specification for the surface.
5. Select the register and read its study. The member Cabin register is ratified. The physician flight-deck register remains provisional.
6. Read only the relevant visual sections of `index.html` for anatomy and worked examples.

## Build brief

Before implementation, state three sentences:

1. What the surface is for.
2. The one thing it must answer first.
3. The encoding plan: what shape, color, weight, and position each carry.

## Implementation contract

- New web prototypes import `tokens.css` and `components.css`.
- Select a register with `data-register="day"` or `data-register="flight-deck"` on the surface root.
- The legacy `.night` class remains supported only for existing surfaces.
- Use component IDs and selectors from `components.json`.
- Use semantic tokens in components. Do not write raw color or spacing literals at the point of use.
- Every clinical value includes its unit every time it appears.
- Do not use the audit face on product surfaces. It survives only in the wordmark tag.
- Do not use em dashes in user-facing prose.
- Data-bearing text comes from the data model. Example patient data belongs in a visible fixture object, not hardcoded in markup.
- AI-authored content requires a named feature, source line, and confidence basis.

## Missing pattern rule

If the required component, state, or surface family is absent or only provisional, label the work as design rather than application. Run the study loop: study, ratify, codify, derive. Add a proposed registry entry instead of inventing a silent one-off.

## Existing prototype rule

A legacy prototype may keep local variable names only if it declares an alias table mapping them to canonical tokens. New builds use canonical token and component names directly. Silent dialects are forbidden.

## Verification

Run `python3 validate-agent-kit.py` before building. After building, report T1 through T7 separately using `acceptance.json`. T2 and T7 use the supplied browser audit scripts. A source scan alone cannot pass a rendered acceptance test.
