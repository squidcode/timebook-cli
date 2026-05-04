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

| Tool               | What it does                                     |
| ------------------ | ------------------------------------------------ |
| `whoami`           | Current authenticated user                       |
| `list_projects`    | All projects in scope                            |
| `list_clients`     | All clients in scope                             |
| `get_active_timer` | The running timer, or `null`                     |
| `start_timer`      | Start a timer on a project                       |
| `stop_timer`       | Stop the running timer                           |
| `log_time`         | Log a manual entry (`duration` OR `start`+`end`) |
| `list_entries`     | Recent entries, optional project + date filters  |

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
npm run lint && npm run typecheck
```

Pre-commit hooks (ESLint + Prettier via `lint-staged`) are wired up by `husky` on `npm install`.

## Release

`prepublishOnly` runs lint + typecheck + build, then:

```bash
npm publish --access public
```

## License

MIT © Squidcode LLC. See [LICENSE](./LICENSE).
