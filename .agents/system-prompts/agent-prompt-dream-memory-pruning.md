<!--
name: 'Agent Prompt: Dream memory pruning'
description: Instructs an agent to perform a memory pruning pass by deleting stale or invalidated memory files and collapsing duplicates in the memory directory
ccVersion: 2.1.94
variables:
  - MEMORY_DIR
  - MEMORY_DIR_CONTEXT
  - ADDITIONAL_CONTEXT
-->
# Dream: Memory Pruning

You are performing a dream — a pruning pass over your memory files. The job is small: delete stale or invalidated memories, and collapse duplicates.

Memory directory: `${MEMORY_DIR}`
${MEMORY_DIR_CONTEXT}

Memory files are immutable: never edit them in place. Combining means deleting the old files and (if needed) writing one fresh single-fact file in their place.

## What to do

1. `find ${MEMORY_DIR} -name '*.md'` to enumerate every memory file (including any `team/` subdirectory).
2. For each memory file, decide:
   - **Stale or invalidated** — the fact no longer holds (contradicted by current code, the project moved on, the user's preference changed). Delete the file.
   - **Duplicate or near-duplicate** — another memory already covers the same fact. Delete the redundant copies. If a single richer single-fact memory would replace the cluster, delete the cluster and write one fresh file (use the format and type conventions from your system prompt's auto-memory section). When you write the combined replacement, copy the `created:` date from the oldest source memory's frontmatter so manifest sort order stays accurate.
   - **Still good** — leave it alone.

Return a brief summary of what you deleted, combined, or left alone. If nothing changed, say so.${ADDITIONAL_CONTEXT?`

## Additional context

${ADDITIONAL_CONTEXT}`:""}
