require("dotenv").config();
const { Client, GatewayIntentBits, ActivityType, EmbedBuilder } = require("discord.js");
const http = require("http");

// Render requires a web service to bind a port — this satisfies that requirement
const PORT = process.env.PORT || 3000;
http.createServer((_, res) => res.end("Bot is running")).listen(PORT, () => {
  console.log(`🌐 Health check server listening on port ${PORT}`);
});

// ─── Validate config ──────────────────────────────────────────────────────────
if (!process.env.DISCORD_TOKEN) {
  console.error("❌  Missing DISCORD_TOKEN in .env — see README.md");
  process.exit(1);
}
if (!process.env.LOG_CHANNEL_ID) {
  console.error("❌  Missing LOG_CHANNEL_ID in .env — see README.md");
  process.exit(1);
}

// ─── Client ───────────────────────────────────────────────────────────────────
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCustomStatus(presence) {
  if (!presence?.activities) return null;
  const custom = presence.activities.find((a) => a.type === ActivityType.Custom);
  if (!custom) return null;
  const parts = [];
  if (custom.emoji) parts.push(custom.emoji.toString());
  if (custom.state) parts.push(custom.state);
  return parts.length ? parts.join(" ") : null;
}

async function getLogChannel() {
  try {
    const ch = await client.channels.fetch(process.env.LOG_CHANNEL_ID);
    return ch?.isTextBased() ? ch : null;
  } catch {
    return null;
  }
}

async function sendEmbed(embed) {
  console.log(`[${new Date().toISOString()}]`, embed.data.description ?? embed.data.title);
  const ch = await getLogChannel();
  if (ch) ch.send({ embeds: [embed] });
}

function makeEmbed(user, description) {
  return new EmbedBuilder()
    .setAuthor({ name: user.tag, iconURL: user.displayAvatarURL() })
    .setDescription(description)
    .setTimestamp()
    .setColor(0x5865f2);
}

// ─── Custom Status watcher ────────────────────────────────────────────────────

const WATCHED_USER_ID = "236560087789993985";

client.on("presenceUpdate", async (oldPresence, newPresence) => {
  const member = newPresence?.member;
  console.log(`[DEBUG] presenceUpdate fired for: ${member?.user?.tag} (${member?.user?.id})`);
  if (!member || member.user.id !== WATCHED_USER_ID) return;
  console.log(`[DEBUG] oldCustom: ${getCustomStatus(oldPresence)} | newCustom: ${getCustomStatus(newPresence)}`);

  // Ignore going offline or coming back online
  if (!newPresence || newPresence.status === "offline") return;
  if (!oldPresence || oldPresence.status === "offline") return;

  const oldCustom = getCustomStatus(oldPresence);
  const newCustom = getCustomStatus(newPresence);
  if (oldCustom === newCustom) return;

  const from = oldCustom ? `"${oldCustom}"` : "_none_";
  const to   = newCustom ? `"${newCustom}"` : "_none_";

  await sendEmbed(
    makeEmbed(member.user, `✏️ **Custom status changed**\n${from} → ${to}`)
  );
});

// ─── Ready ────────────────────────────────────────────────────────────────────

client.once("ready", async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`📢 Logging to channel: ${process.env.LOG_CHANNEL_ID}`);
});

client.login(process.env.DISCORD_TOKEN);