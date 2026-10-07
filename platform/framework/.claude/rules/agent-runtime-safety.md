# Agent Runtime Safety

These rules apply to every agent in `.claude/agents/` that starts, tests, or stops local processes (dev servers, e2e runners, API hosts). They exist because agents run **inside** the SDLC Studio platform, which is itself a Node process: killing processes broadly kills the platform and the agent's own run.

## Never mass-kill processes

An agent MUST NOT terminate processes by image/name. These commands are forbidden — they kill the platform server (`:4174`), the current run, and any other unrelated work on the machine:

- `taskkill /F /IM node.exe` (and any `taskkill … /IM <name>`)
- `killall node`, `pkill node`, `pkill -f vite`, or equivalents by process name
- Killing "all" of a runtime (node, dotnet, chrome) in any form

A run that self-terminated mid-task almost always did this. It is the single most damaging mistake in this environment.

## Clean up by PORT only

When a port is occupied (e.g. a stale Vite on `5173`), free **that port**, nothing else:

- Windows: `netstat -ano | findstr :<port>` → take the PID of the `LISTENING` line → `taskkill /F /PID <pid>`.
- Never expand the kill from one PID to a whole image name.

## Start servers cleanly

- Prefer a **dedicated, explicit port** and `--strictPort` (e.g. `vite --port <p> --strictPort`) so a run fails loudly on a conflict instead of silently landing on another port.
- Before starting a dev server, confirm the target port is free (by port, per above). Do not assume a running server is fresh: a server started **before** a config change (Tailwind/PostCSS, env, proxy) serves stale output. When in doubt, free the port and start fresh rather than reuse.
- Do not leave orphan servers running at the end of a task: stop the ones you started, by port.

## E2E / Playwright

- The front (Vite) web server for e2e MUST NOT reuse a possibly-stale existing server — start a fresh one so tests run against the current config (`reuseExistingServer: false` for the front). Reusing the slow .NET host (`:5000`) is fine.
- Screenshots and artifacts written under `playwright-report/` are wiped by the HTML reporter at end of run — write proof artifacts to a dedicated folder outside it.
