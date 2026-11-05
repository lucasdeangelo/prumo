import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const project = `prumo_phase2_${process.pid}`;
const compose = ["compose", "-f", "tests/database/compose.yaml", "-p", project];
const psql = ["exec", "-T", "postgres", "psql", "-U", "postgres", "-d", "prumo_test", "-v", "ON_ERROR_STOP=1"];

function run(args) {
  const result = spawnSync("docker", [...compose, ...args], { stdio: "inherit", shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Docker command failed with exit code ${result.status}`);
}

try {
  run(["up", "-d", "--wait"]);
  // The official image restarts once after init; wait until queries really succeed.
  for (let attempt = 0; ; attempt += 1) {
    const probe = spawnSync("docker", [...compose, ...psql, "-c", "select 1"], { stdio: "ignore", shell: false });
    if (probe.status === 0) break;
    if (attempt >= 30) throw new Error("Test database did not accept connections");
    spawnSync(process.execPath, ["-e", "setTimeout(() => {}, 1000)"]);
  }
  run([...psql, "-f", "/workspace/tests/bootstrap.sql"]);
  const migrations = readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql")).sort();
  if (migrations.length === 0) throw new Error("No SQL migration found");
  for (const migration of migrations) {
    run([...psql, "-f", `/workspace/migrations/${migration}`]);
  }
  const suites = readdirSync("tests/database").filter((name) => name.endsWith(".sql") && name !== "bootstrap.sql").sort();
  for (const suite of suites) {
    run([...psql, "-f", `/workspace/tests/${suite}`]);
  }
} finally {
  const result = spawnSync("docker", [...compose, "down"], { stdio: "inherit", shell: false });
  if (result.error || result.status !== 0) {
    process.stderr.write("Could not stop the isolated test container.\n");
    process.exitCode = 1;
  }
}
