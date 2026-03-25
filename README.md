# nsfwcli

AI-powered NSFW content search from your terminal. Describe what you want in natural language, get results, play ad-free.

## Features

- **Natural language search** — "三上悠亚的护士片" just works
- **Actress alias resolution** — one name, all variants searched automatically
- **Video code lookup** — search by code like SSNI-889
- **Ad-free playback** — extracts direct video links, plays in mpv/iina/vlc
- **Local database** — ships with actress data, grows with every search
- **Multi-site ready** — SpankBang first, extensible to any site via adapters

## Install

```bash
npm install -g nsfwcli
```

## Setup

```bash
# Set your OpenAI API key (for natural language understanding)
export OPENAI_API_KEY=sk-...

# Initialize database
nsfwcli setup
```

## Usage

```bash
# Search by natural language
nsfwcli search "三上悠亚 nurse cosplay"

# Search by video code
nsfwcli search "SSNI-889"

# More results
nsfwcli search "NTR housewife" --limit 20

# List only, don't play
nsfwcli search "Yua Mikami" --no-play
```

## How It Works

```
You say: "三上悠亚的护士片"
    ↓
AI parses: { actress: "三上悠亚", tags: ["nurse"] }
    ↓
Alias engine: ["三上悠亚", "Yua Mikami", "mikami yua"]
    ↓
Dual search: local DB + SpankBang (concurrent)
    ↓
Deduplicate by video code
    ↓
Pick one → mpv plays it ad-free
```

## Requirements

- Node.js >= 20
- One of: [mpv](https://mpv.io/), [IINA](https://iina.io/), [VLC](https://www.videolan.org/) (for ad-free playback)
- Optional: [OpenCLI](https://github.com/jackwener/opencli) (for better site access)
- Optional: OpenAI API key (for natural language search; without it, keyword search still works)

## For Openclaw Users

Copy the `openclaw/` directory to `~/.openclaw/skills/nsfwcli/` and your agent can search for you.

## Contributing

### Add a new site adapter

1. Create `src/adapters/yoursite.ts` implementing `SearchAdapter`
2. Add a row to the `sources` table
3. Submit a PR

### Contribute actress data

Edit `src/db/seed.json` and submit a PR. We need:
- 100-200 popular actresses with all name variants
- 5-10 representative works per actress

## License

MIT
