import { EmbedBuilder } from "discord.js";

export function card(title, description, color = 0xffffff) {
  return new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: "SEEP" })
    .setTitle(String(title).slice(0, 256))
    .setDescription(String(description || " ").slice(0, 4000))
    .setFooter({ text: "seep • Your community, connected" })
    .setTimestamp();
}
export function validateEmbed(data) {
  if (!data || typeof data !== "object")
    throw new Error("Enter an embed title and message.");
  const title = String(data.title || "").trim(),
    description = String(data.description || "").trim();
  if (!title || title.length > 256 || description.length > 4000)
    throw new Error(
      "Use a title up to 256 characters and a message up to 4,000.",
    );
  const color = /^#[0-9a-f]{6}$/i.test(data.color || "")
    ? parseInt(data.color.slice(1), 16)
    : 0xffffff;
  const embed = card(title, description, color);
  for (const [key, method] of [
    ["image", "setImage"],
    ["thumbnail", "setThumbnail"],
  ]) {
    if (!data[key]) continue;
    const url = new URL(data[key]);
    if (url.protocol !== "https:" || url.username || url.password)
      throw new Error("Images must use public HTTPS URLs.");
    embed[method](url.href);
  }
  if (data.footer) embed.setFooter({ text: String(data.footer).slice(0, 300) });
  return embed;
}
