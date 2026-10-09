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
  run([...psql, "-f", "/workspace/tests/bootstrap.sql"]);
  const migrations = readdirSync("supabase/migrations").filter((name) => name.endsWith(".sql")).sort();
  if (migrations.length === 0) throw new Error("No SQL migration found");
  for (const migration of migrations) {
    run([...psql, "-f", `/workspace/migrations/${migration}`]);
  }
  run([...psql, "-f", "/workspace/tests/tenant_isolation.sql"]);
} finally {
  const result = spawnSync("docker", [...compose, "down"], { stdio: "inherit", shell: false });
  if (result.error || result.status !== 0) {
    process.stderr.write("Could not stop the isolated test container.\n");
    process.exitCode = 1;
  }
}
