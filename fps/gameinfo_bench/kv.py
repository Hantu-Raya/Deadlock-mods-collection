"""Span-preserving Source 2 KeyValues (gameinfo.gi) reader.

Edits are made on the original text by token offsets, so comments, ordering and
formatting survive. Taken from the r3 merge script (2026-10-11).
"""
from collections import defaultdict
from dataclasses import dataclass


@dataclass
class Token:
    value: str
    start: int
    end: int
    line: int
    quoted: bool = False
    brace: bool = False


def tokens(text):
    """Keep token spans; ignore comments only outside quoted strings."""
    i, line = 0, 0
    while i < len(text):
        if text[i].isspace() or (i == 0 and text[i] == "\ufeff"):
            line += text[i] == "\n"
            i += 1
        elif text.startswith("//", i):
            end = text.find("\n", i)
            i = len(text) if end < 0 else end
        elif text[i] in "{}":
            yield Token(text[i], i, i + 1, line, brace=True)
            i += 1
        elif text[i] == '"':
            start, start_line = i, line
            i += 1
            value = []
            while i < len(text) and text[i] != '"':
                if text[i] == "\\" and i + 1 < len(text) and text[i + 1] in ('"', "\\"):
                    i += 1
                value.append(text[i])
                line += text[i] == "\n"
                i += 1
            if i == len(text):
                raise ValueError(f"Unclosed quoted token at line {start_line + 1}")
            i += 1
            yield Token("".join(value), start, i, start_line, quoted=True)
        else:
            start = i
            while (i < len(text) and not text[i].isspace() and text[i] not in '{}"'
                   and not text.startswith("//", i)):
                i += 1
            yield Token(text[start:i], start, i, line)


def identity(section, key):
    return section.casefold(), key.casefold()


def parse(text):
    """Parse balanced key/value and key/block pairs; retain file order.

    Returns (entries, sections): entries maps (section path, key) casefolded to a list of
    {"key": Token, "value": Token}; sections maps a casefolded path to its blocks.
    """
    stream = iter(tokens(text))
    stack, entries, sections = [], defaultdict(list), defaultdict(list)
    for key in stream:
        if key.brace:
            if key.value != "}" or not stack:
                raise ValueError(f"Unexpected brace at line {key.line + 1}")
            section = stack.pop()
            section["close"] = key
            sections[section["path"].casefold()].append(section)
            continue
        value = next(stream, None)
        if value is None or (value.brace and value.value == "}"):
            raise ValueError(f"Missing value for {key.value} at line {key.line + 1}")
        path = "/".join(item["key"].value for item in stack)
        if value.brace:
            stack.append({"key": key, "open": value,
                          "path": "/".join(filter(None, (path, key.value)))})
        else:
            entries[identity(path, key.value)].append({"key": key, "value": value})
    if stack:
        raise ValueError(f"Unclosed section {stack[-1]['path']}")
    for blocks in sections.values():
        blocks.sort(key=lambda item: item["key"].start)
    return dict(entries), dict(sections)


def quote(value):
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'
