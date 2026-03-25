---
name: nsfwcli
description: |
  AI-powered NSFW content search. Tell the agent what you want to watch in natural language,
  and it searches SpankBang with alias expansion and code deduplication. Supports actress names
  (Japanese/English/Chinese), video codes, scene types, and action preferences.
  Use when: user asks to find adult content, mentions an actress name, a video code,
  or describes a scene they want to watch.
---

# NSFW Content Search

Search for adult video content using natural language.

## Prerequisites

- nsfwcli installed: `npm install -g nsfwcli`
- OpenAI API key set: `export OPENAI_API_KEY=sk-...`
- First run: `nsfwcli setup` (initializes database with actress data)

## Usage

### Search by natural language

```bash
nsfwcli search "三上悠亚最新的护士系列"
nsfwcli search "NTR with housewife"
nsfwcli search "Yua Mikami cosplay"
```

### Search by video code

```bash
nsfwcli search "SSNI-889"
```

### Options

```bash
nsfwcli search "query" --limit 20    # Show more results
nsfwcli search "query" --no-play     # Don't prompt to play, just list
```

## How It Works

1. User describes what they want in natural language
2. AI parses the intent into structured fields (actress, tags, code, etc.)
3. Alias engine expands the actress name into multiple search variants
4. Dual-engine search: local database + SpankBang (concurrent)
5. Results are deduplicated by video code
6. User selects a result → video plays in local player (mpv/iina/vlc) ad-free

## When to Use This Skill

- User asks "find me a video of..." or "I want to watch..."
- User mentions an AV actress name
- User mentions a video code (e.g., SSNI-889)
- User describes a scene type or category
