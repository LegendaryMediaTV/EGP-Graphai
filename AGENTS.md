# Chat Commands

Treat any listed commands in the user's message as part of the prompt and act on them; multiple commands may appear.

- `:prd` – Use the structured workflow in `./_specs/create-prd.md` to help me create a PRD for a new feature.
- `:tasks` – Please generate tasks from the PRD using `./_specs/generate-tasks.md`. If not explicitly told which PRD to use, generate a list of PRDs under `./_specs/ai-tasks` (e.g., `0001-prd-[name].md`) and **always** ask the user to select/confirm the PRD file name before proceeding. Make sure to provide options in number lists so I can respond easily (if multiple options).
- `:execute` – Please process the task list using `./_specs/process-task-list.md`.
- `:test` – Analyze the attached file, list important unit tests, create Vitest tests in the nearest `./__tests__` folder, and run them. Optionally inspect existing tests for style/patterns.
- `:think` – Think hard about the request before answering, as it is critical to be thorough and get it correct.
- `:uncertainty` – What parts of this prompt are unclear or ambiguous? What assumptions are you making? What other information would be most critical for executing this accurately? Do not make code changes.

# Package Commands (Whitelisted)

Use these instead of underlying commands to avoid approval prompts:

- `npm run validate` - Validate JSON schemas and data integrity.
- `npx vitest --run` – Run unit tests with an optional filename.
- `npm run export` - Export Bible JSON to text/markdown formats.
