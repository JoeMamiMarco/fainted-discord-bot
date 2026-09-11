import { mkdirSync, cpSync, writeFileSync, readFileSync } from "node:fs";
import { commands } from "../src/commands.js";
import { templateThemes, preset } from "../src/templates.js";
mkdirSync("site-dist/assets", { recursive: true });
for (const name of ["index.html", "site.css", "site.js"])
  cpSync("site/" + name, "site-dist/" + name);
for (const name of ["seep-logo.png", "seep-cover-1024x576.png"])
  cpSync("assets/" + name, "site-dist/assets/" + name);
writeFileSync(
  "site-dist/catalog.json",
  JSON.stringify(
    {
      commands,
      templates: Object.fromEntries(
        Object.keys(templateThemes).map((t) => [t, preset(t)]),
      ),
    },
    null,
    2,
  ),
);
cpSync("site-dist/index.html", "site-dist/404.html");
writeFileSync("site-dist/.nojekyll", "");
for (const f of ["index.html", "site.js"]) {
  const content = readFileSync("site-dist/" + f, "utf8");
  if (/(?:DISCORD_TOKEN|CODE_AI_KEY)\s*[:=]\s*["'][^"']+["']/.test(content))
    throw Error("Unexpected credential assignment in site output.");
}
console.log(
  "Static site built in site-dist. No runtime secrets or private data included.",
);
