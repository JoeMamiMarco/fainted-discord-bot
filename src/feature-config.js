export const featureDefaults = {
  aiMentions: true,
  aiPersonality: "friendly",
  aiMood: "cheerful",
  aiHumor: "light",
  aiEmoji: "occasional",
  aiLength: "balanced",
  aiModeration: false,
  aiChannels: [],
  welcomeDM: false,
  goodbyeDM: false,
  raidProtection: false,
  raidThreshold: 8,
  raidWindow: 15,
  lockdownMinutes: 5,
  altDetection: false,
  minAccountDays: 7,
  altAction: "log",
  antiNuke: false,
  nukeThreshold: 5,
  voiceXP: false,
  xpMultiplier: 1,
  xpDecay: 0,
  levelRewards: [],
  inviteRewards: [],
  joinToCreate: null,
  voiceCategory: null,
  voiceLimit: 0,
  inactiveAuto: false,
  inactiveDays: 30,
  autoBackups: false,
  autoResponses: [],
  welcomeTitle: "Welcome to {server}!",
  goodbyeTitle: "See you again, {name}",
  welcomeImage: "",
  goodbyeImage: "",
  embedColor: "#ffffff",
  rankColor: "#ffffff",
};
const booleans = new Set([
  "aiMentions",
  "aiModeration",
  "welcomeDM",
  "goodbyeDM",
  "raidProtection",
  "altDetection",
  "antiNuke",
  "voiceXP",
  "inactiveAuto",
  "autoBackups",
  "automod",
  "blockInvites",
  "leveling",
]);
const ranges = {
  raidThreshold: [3, 50],
  raidWindow: [5, 120],
  lockdownMinutes: [1, 30],
  minAccountDays: [1, 365],
  nukeThreshold: [3, 20],
  xpMultiplier: [0.1, 5],
  xpDecay: [0, 100],
  voiceLimit: [0, 99],
  inactiveDays: [7, 365],
  mentionLimit: [2, 30],
  spamLimit: [3, 30],
};
export const channelKeys = [
  "welcomeChannel",
  "goodbyeChannel",
  "logChannel",
  "joinToCreate",
  "voiceCategory",
];
export const roleKeys = ["autoRole", "supportRole"];
export function validatePatch(patch) {
  if (
    !patch ||
    Array.isArray(patch) ||
    typeof patch !== "object" ||
    Object.keys(patch).length > 45
  )
    throw new Error("Invalid settings.");
  const clean = {};
  for (const [key, value] of Object.entries(patch)) {
    const styles = {aiPersonality:["friendly","professional","witty","nerdy","sarcastic"],aiMood:["cheerful","calm","energetic","serious"],aiHumor:["off","light","playful"],aiEmoji:["none","occasional","expressive"],aiLength:["brief","balanced","detailed"]};
    if (styles[key]) {
      if (!styles[key].includes(value)) throw new Error("Choose a valid " + key + " option.");
    } else if (booleans.has(key)) {
      if (typeof value !== "boolean")
        throw new Error(`${key} must be on or off.`);
    } else if (ranges[key]) {
      const [min, max] = ranges[key];
      if (
        typeof value !== "number" ||
        !Number.isFinite(value) ||
        value < min ||
        value > max
      )
        throw new Error(`${key} must be between ${min} and ${max}.`);
    } else if ([...channelKeys, ...roleKeys].includes(key)) {
      if (value !== null && !/^\d{17,20}$/.test(value))
        throw new Error("Choose a channel or role from this server.");
    } else if (
      ["welcome", "goodbye", "welcomeTitle", "goodbyeTitle"].includes(key)
    ) {
      if (typeof value !== "string" || value.length > 1900)
        throw new Error("Messages must be under 1,900 characters.");
    } else if (["welcomeImage", "goodbyeImage"].includes(key)) {
      if (
        typeof value !== "string" ||
        value.length > 1200 ||
        (value && !/^https:\/\//.test(value))
      )
        throw new Error("Use an HTTPS image URL.");
    } else if (["embedColor", "rankColor"].includes(key)) {
      if (!/^#[0-9a-f]{6}$/i.test(value))
        throw new Error("Use a hex color such as #ffffff.");
    } else if (key === "altAction") {
      if (!["log", "kick"].includes(value))
        throw new Error("Choose log or kick.");
    } else if (key === "blockedWords") {
      if (
        !Array.isArray(value) ||
        value.length > 100 ||
        value.some((x) => typeof x !== "string" || !x.trim() || x.length > 80)
      )
        throw new Error("Use up to 100 nonempty blocked words.");
    } else if (key === "aiChannels") {
      if (
        !Array.isArray(value) ||
        value.length > 25 ||
        value.some((x) => !/^\d{17,20}$/.test(x))
      )
        throw new Error("Choose up to 25 AI moderation channels.");
    } else if (["levelRewards", "inviteRewards"].includes(key)) {
      if (
        !Array.isArray(value) ||
        value.length > 20 ||
        value.some(
          (x) =>
            !Number.isInteger(x.at) ||
            x.at < 1 ||
            x.at > 10000 ||
            !/^\d{17,20}$/.test(x.role),
        )
      )
        throw new Error("Use reward entries with at (1–10,000) and role ID.");
    } else if (key === "autoResponses") {
      if (
        !Array.isArray(value) ||
        value.length > 30 ||
        value.some(
          (x) =>
            typeof x.trigger !== "string" ||
            !x.trigger.trim() ||
            x.trigger.length > 80 ||
            typeof x.reply !== "string" ||
            !x.reply.trim() ||
            x.reply.length > 1500,
        )
      )
        throw new Error("Use up to 30 trigger/reply pairs.");
    } else throw new Error(`Unknown setting: ${key}`);
    clean[key] = value;
  }
  return clean;
}
