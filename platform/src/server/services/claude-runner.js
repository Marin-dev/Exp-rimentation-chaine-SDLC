import { spawn } from "node:child_process";

/**
 * Run Claude Code in print (non-interactive) mode.
 * The prompt is passed via STDIN, never via argv, so user-supplied text
 * cannot be interpreted by the shell (no command injection).
 * Returns { ok, output, error }.
 */
export function runClaudePrint(config, prompt, { timeoutMs = 150000, cwd } = {}) {
  return new Promise((resolve) => {
    const command = config.claudeCommand || "claude";
    let child;
    try {
      // shell:true lets Windows resolve `claude.cmd`; argv is constant ("-p").
      // windowsHide avoids allocating a console/conhost per spawn, which under
      // repeated launches exhausts the desktop heap and makes new processes fail
      // to init (Windows STATUS_DLL_INIT_FAILED, exit code 0xC0000142).
      child = spawn(command, ["-p"], { cwd, shell: true, windowsHide: true });
    } catch (e) {
      resolve({ ok: false, error: `Impossible de lancer Claude: ${e.message}` });
      return;
    }

    let out = "";
    let err = "";
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };

    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      finish({ ok: false, output: out, error: "Délai dépassé." });
    }, timeoutMs);

    child.stdout.on("data", (d) => (out += d.toString()));
    child.stderr.on("data", (d) => (err += d.toString()));
    child.on("error", (e) => finish({ ok: false, error: e.message }));
    child.on("close", (code) =>
      finish({
        ok: code === 0,
        output: out,
        error: code === 0 ? null : err.trim() || `Code de sortie ${code}.`
      })
    );

    try {
      child.stdin.write(prompt);
      child.stdin.end();
    } catch (e) {
      finish({ ok: false, error: `Écriture du prompt impossible: ${e.message}` });
    }
  });
}
