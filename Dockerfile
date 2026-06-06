# Minimal image for MCP-platform checks (Glama et al.): start the stdio MCP
# server and answer introspection (initialize / tools/list work without
# auth; tool CALLS require `timebook login` or TIMEBOOK_TOKEN).
FROM node:22-alpine

RUN npm install -g @squidcode/timebook

# Stdio MCP server. Auth is per-tool-call, so introspection succeeds
# out of the box; real usage needs a token (see README).
CMD ["timebook", "mcp"]
