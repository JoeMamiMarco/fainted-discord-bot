import { REST, Routes } from "discord.js";
import { commands } from "./commands.js";
import { checkEnv } from "./check.js";
import { report, explainError } from "./status.js";
try {
  checkEnv();
  await new REST({ version: "10" })
    .setToken(process.env.DISCORD_TOKEN)
    .put(
      Routes.applicationGuildCommands(
        process.env.DISCORD_CLIENT_ID,
        process.env.DISCORD_GUILD_ID,
      ),
      { body: commands },
    );
  console.log(
    `Registered ${commands.length} commands in your configured server.`,
  );
} catch (e) {
  report("error", { message: explainError(e) });
  process.exitCode = 1;
}
