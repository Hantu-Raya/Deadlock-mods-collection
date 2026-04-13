<!--
name: 'Skill: Build Claude API and SDK apps'
description: Trigger rules for activating guidance when users are building applications with the Claude API, Anthropic SDKs, or Managed Agents
ccVersion: 2.1.97
-->
Build Claude API / Anthropic SDK apps.
TRIGGER when: code imports `anthropic`/`@anthropic-ai/sdk`; user asks to use the Claude API, Anthropic SDKs, or Managed Agents (`/v1/agents`, `/v1/sessions`); or asks to add a Claude feature (prompt caching, adaptive thinking, compaction, code_execution, batch, files API, citations, memory tool) or a Claude model (Opus/Sonnet/Haiku) to a Claude file.
DO NOT TRIGGER when: file imports `openai`/non-Anthropic SDK, filename signals another provider (`agent-openai.py`, `*-generic.py`), code is provider-neutral, or task is general programming/ML.
