// Stand-in for the `claude` CLI in tests: reads the prompt on stdin, emits stream-json
// events, and behaves according to markers found in the prompt.
//  - writes one question into the run's own pending-input file (unless it is a resume, or
//    the scenario file says noQuestions);
//  - "SLEEP" in the prompt: hangs until killed (cancellation / timeout tests);
//  - request desk: for each `agent-io/request-REQ-NNN-<step>.json` the prompt names, writes
//    the output given by fake-claude-script.json (in the cwd) for <step>, plus the files it
//    lists (what the agent would have changed in the product).
import fs from "node:fs";
import path from "node:path";

const SESSION = "11111111-2222-4333-8444-555555555555";
const out = (evt) => process.stdout.write(JSON.stringify(evt) + "\n");

function scenario() {
  try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), "fake-claude-script.json"), "utf8")); } catch { return {}; }
}

function write(rel, content) {
  const file = path.join(process.cwd(), rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof content === "string" ? content : JSON.stringify(content));
}

let prompt = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (d) => (prompt += d));
process.stdin.on("end", () => {
  const args = process.argv.slice(2);
  const script = scenario();
  fs.appendFileSync(path.join(process.cwd(), "fake-claude-calls.jsonl"), JSON.stringify({ args, prompt }) + "\n");
  out({ type: "system", subtype: "init", session_id: SESSION, model: "claude-test" });
  out({ type: "assistant", message: { id: "m1", usage: { input_tokens: 1000, output_tokens: 100 }, content: [{ type: "text", text: "Je travaille." }] } });

  if (prompt.includes("SLEEP")) {
    setInterval(() => {}, 1000);
    return;
  }
  const seen = new Set();
  for (const m of prompt.matchAll(/livrables\/_governance\/agent-io\/request-(REQ-\d+)-([a-z]+)\.json/g)) {
    const step = m[2];
    if (seen.has(step) || !script[step]) continue;
    seen.add(step);
    const conf = script[step];
    for (const [rel, content] of Object.entries(conf.files || {})) write(rel, content);
    write(m[0], conf.output || {});
  }
  const pending = prompt.match(/livrables\/_governance\/agent-io\/(pending-input-[\w.-]+\.json)/);
  if (pending && !args.includes("--resume") && !script.noQuestions) {
    write(`livrables/_governance/agent-io/${pending[1]}`, {
      summary: "test",
      items: [{ ref: "q1", type: "question", profile: "sponsor", title: "Quel périmètre ?", context: "Test." }]
    });
  }
  out({ type: "result", subtype: "success", is_error: false, session_id: SESSION, total_cost_usd: 0.42, usage: { input_tokens: 1000, output_tokens: 100 } });
});
