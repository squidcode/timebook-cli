<!-- mcp-name: io.github.squidcode/timebook -->

# Timebook CLI

Command-line client and **MCP server** for [Timebook](https://usetimebook.com) — track time, manage timers, and expose your Timebook account to AI agents (Claude, Codex, Cursor, …) over the [Model Context Protocol](https://modelcontextprotocol.io).

[![npm](https://img.shields.io/npm/v/%40squidcode%2Ftimebook.svg)](https://www.npmjs.com/package/@squidcode/timebook)
[![license](https://img.shields.io/npm/l/%40squidcode%2Ftimebook.svg)](./LICENSE)

## Install

```bash
# one-off
npx @squidcode/timebook login

# globally
npm install -g @squidcode/timebook
timebook --help
```

Requires Node.js **18.17+**.

## Authenticate

`timebook login` opens your browser, you log into Timebook (or use an existing session) and pick a scope (which clients/projects this token can touch). The browser delivers the token back to a short-lived loopback HTTP listener, which the CLI then writes to a config file with `0600` permissions.

```bash
timebook login
```

The token is stored at:

- macOS: `~/Library/Preferences/timebook/config.json`
- Linux: `~/.config/timebook/config.json`
- Windows: `%APPDATA%\timebook\Config\config.json`

The token never leaves your machine after login. To revoke it server-side, visit `https://usetimebook.com/settings/api-tokens`.

## Use it as a CLI

```bash
timebook whoami
timebook projects                         # list projects
timebook clients                          # list clients

timebook start -p "Acme website" -d "Wireframes"
timebook status                           # show running timer
timebook stop

# manual entries
timebook log -p "Acme website" -t 1h30m -d "Code review"
timebook log -p PROJ_ID --start 2026-05-04T09:00 --end 2026-05-04T10:30

timebook entries --project "Acme website" -n 10
```

Duration formats accepted: `1h`, `45m`, `1h30m`, `1.5h`, `1:30`, or a bare number (interpreted as minutes — e.g. `90` → 1h 30m).

## Use it as an MCP server

The same binary speaks MCP over stdio when invoked with `timebook mcp`. Drop it into any MCP-aware host (Claude Code, Claude Desktop, Codex, Cursor, …):

### Claude Code / Claude Desktop

```json
{
  "mcpServers": {
    "timebook": {
      "command": "npx",
      "args": ["-y", "@squidcode/timebook", "mcp"]
    }
  }
}
```

Or, if installed globally:

```json
{
  "mcpServers": {
    "timebook": {
      "command": "timebook",
      "args": ["mcp"]
    }
  }
}
```

The MCP server reuses the token saved by `timebook login` — run `timebook login` once in a terminal before starting the agent.

### Tools exposed to the model

| Tool               | What it does                                                 |
| ------------------ | ------------------------------------------------------------ |
| `whoami`           | Current authenticated user (read-only)                       |
| `list_projects`    | All projects in scope (read-only)                            |
| `list_clients`     | All clients in scope (read-only)                             |
| `get_active_timer` | The running timer, or `null` (read-only)                     |
| `start_timer`      | Start a timer on a project                                   |
| `stop_timer`       | Stop the running timer                                       |
| `log_time`         | Log a manual entry (`duration` OR `startTime`+`endTime`)     |
| `list_entries`     | Recent entries (default 50, max 500), project + date filters |

### Try it with prompts

Once the MCP server is connected, ask the model in plain English:

- _"Start a timer on my Acme website project for landing-page wireframes."_
- _"How much time did I log on the Recycler project last week?"_
- _"Log 1 hour 30 minutes against ChatNexus from 9am this morning at the Software Development rate, with description 'code review of the auth refactor'."_
- _"What am I currently working on?"_ — invokes `get_active_timer`.
- _"Stop my timer."_

The model picks the right tool, asks `list_projects` first if it needs to disambiguate a name, and writes through `start_timer` / `log_time` / `stop_timer`.

## Privacy

Timebook CLI runs on your machine and only talks to your Timebook account.

- **Authentication**: `timebook login` mints a personal API token via Timebook's OAuth-style consent screen. The token is stored locally with `0600` permissions (`~/Library/Preferences/timebook/config.json` on macOS, `~/.config/timebook/config.json` on Linux, `%APPDATA%\timebook\Config\config.json` on Windows). It is never transmitted anywhere except `https://usetimebook.com` (or your override) on outgoing API calls.
- **Telemetry**: none. Neither the CLI nor the MCP server reports usage, errors, or analytics anywhere.
- **MCP host data**: when you use `timebook mcp` from inside Claude / Cursor / etc., the MCP host (not Timebook) controls what the model sees. Tool inputs and outputs flow through the host's normal model-context pipeline.
- **Revoking access**: visit https://usetimebook.com/settings/api-tokens to revoke the token at any time.

For Timebook's product-level privacy policy, see https://usetimebook.com/privacy.

## Configuration

Override the API/web hosts (useful for self-hosted Timebook or local dev):

```bash
TIMEBOOK_API_URL=https://api.example.com \
TIMEBOOK_WEB_URL=https://example.com \
timebook login
```

You can also pass `--api-url` and `--web-url` to `timebook login` once; subsequent commands re-use the saved values.

If `timebook login` errors with `State mismatch` or you want to see exactly which requests reach the loopback callback, run with `--debug`:

```bash
timebook login --debug
```

## Develop

```bash
git clone https://github.com/squidcode/timebook-cli
cd timebook-cli
npm install
npm run dev -- --help        # tsx-powered hot-loop
npm run build                # emits dist/
npm run lint && npm run typecheck && npm run test
```

Pre-commit hooks (ESLint + Prettier via `lint-staged`) are wired up by `husky` on `npm install`.

## Release

`prepublishOnly` runs lint + typecheck + tests + build, then:

```bash
npm publish --access public
```

## License

MIT © Squidcode LLC. See [LICENSE](./LICENSE).
