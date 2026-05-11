# System Prompt Maintenance

## Background

The merge workflow uses an LLM to filter raw POI search results into precise map candidates. The map UI agent uses an LLM with narrow tools to preview point and route edits before the user applies them.

Both workflows need system prompts, but those prompts should stay maintainable and not encode temporary assumptions too deeply.

## Decision

System prompts are now maintained as Markdown files under `src/prompts/`:

- `src/prompts/poi-candidate-selection.md`
- `src/prompts/map-editing-agent.md`

The code loads these files at runtime through `src/shared/prompts.ts`.

## POI Merge Prompt Principles

The POI candidate selection prompt should describe stable decision principles, not provider-specific or schema-specific implementation details.

It should:

- Treat candidates as generic search-provider POI results, not only AMap results.
- Focus on whether a candidate represents the requested entity itself or a real branch/location of that entity.
- Avoid fixed category bans, because the same category can be correct or incorrect depending on the seed item.
- Prefer precision over recall when candidates are ambiguous.
- Forbid invented locations, names, coordinates, ids, categories, or branches.
- Require structured JSON only.

It should not:

- Hardcode one provider such as AMap in the prompt text.
- Hardcode the current JSON key names in the prompt text.
- Special-case one current bug with a narrow category-specific rule.
- Treat nearby places, entrances, facilities, or contained businesses as valid unless the requested seed item specifically refers to them.

## Runtime Output Contract

The system prompt intentionally does not include the exact JSON shape.

The current program still needs a machine-checkable response, so `merge-points.ts` passes a runtime `output_contract` in the user message and validates the result with Zod. If the JSON shape changes later, the code can update the runtime contract and parser without rewriting the stable prompt.

## Agent Prompt Principles

The map editing agent prompt controls tool choice and edit scope. It should keep the LLM from over-editing while avoiding hard-coded backend scope guards.

The key behavior is:

- Route-only requests should use only route tools.
- Point filtering requests should use point tools.
- `data/places/*.json` is not part of the interactive editing surface.
- Filtering should default to the smallest explicit target.
- If a request says to keep one candidate near a reference place, the reference place is only context; the target group is the entity being filtered.
- The agent must preview edits first. Final persistence only happens after the user clicks apply.

## Follow-up Guideline

When a future provider or output schema is added, update the runtime data contract and parser first. Only change the system prompt if the decision principle itself changes.
