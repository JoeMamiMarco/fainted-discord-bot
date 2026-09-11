import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(dir + "/" + e.name) : [dir + "/" + e.name],
  );
}
let count = 0;
for (const file of ["src", "dashboard", "site", "scripts", "test"]
  .flatMap(files)
  .filter((f) => f.endsWith(".js"))) {
  const r = spawnSync(process.execPath, ["--check", file], {
    encoding: "utf8",
  });
  if (r.status !== 0) {
    console.error(r.stderr);
    process.exit(1);
  }
  count++;
}
console.log(`Syntax validation passed for ${count} JavaScript files.`);
