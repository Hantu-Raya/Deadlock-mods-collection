# System Prompts Directory

Local prompt engineering corpus for Claude Code. This directory contains system prompts, agent instructions, skills, and reference data.

## File Naming Conventions

All files must follow these strict prefixes:

| Prefix | Purpose | Example |
|--------|---------|---------|
| `agent-prompt-*.md` | Specialized agent prompts for specific tasks | `agent-prompt-quick-git-commit.md` |
| `data-*.md` | Reference data and API documentation | `data-claude-api-reference-python.md` |
| `skill-*.md` | Skill definitions for slash-command workflows | `skill-init-claudemd-and-skill-setup-new-version.md` |
| `system-prompt-*.md` | Core system-level behavior instructions | `system-prompt-auto-mode.md` |
| `tool-description-*.md` | Tool descriptions and usage patterns | `tool-description-bash-overview.md` |

## File Format

All files must include YAML frontmatter:

```yaml
<!--
name: 'Descriptive Name'
description: Brief description of purpose
ccVersion: 2.1.84
-->
```

## Workflow

1. **Search before modifying** — Check existing prompts before creating new ones
2. **Use appropriate prefix** — Choose the right category for new files
3. **Keep skills actionable** — Skills should be invocable via `/skill-name`
4. **Reference, don't duplicate** — Use `@path/to/file.md` to include content instead of copying

## Categories

- **Agent prompts** (36 files): Git workflows, PR creation, code review, verification, summarization
- **Data** (33 files): Claude API refs, managed agents docs, HTTP codes, API references
- **Skills** (18 files): `/init`, `/verify`, `/debug`, `/simplify`, onboarding flows
- **System prompts** (70 files): Auto-mode, memory, task execution, security, tool usage
- **Tool descriptions** (~110 files): Bash, computer-use, MCP tools, sandbox guidelines

## Important Notes

- Treat this as a local prompt/reference corpus — search it before modifying
- Do not install prompt-engineering skills from search results without user approval
- Skills in `.agents/skills/` are separate from system-prompts skills — both are valid
- Files should be minimal and focused — only include what Claude would get wrong without it
