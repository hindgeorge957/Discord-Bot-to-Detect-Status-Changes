require("dotenv").config();
const { Client, GatewayIntentBits, ActivityType, EmbedBuilder } = require("discord.js");
const http = require("http");

const PORT = process.env.PORT || 3000;
http.createServer((_, res) => res.end("Bot is running")).listen(PORT, () => {
  console.log(`🌐 Health check server listening on port ${PORT}`);
});

if (!process.env.DISCORD_TOKEN) {
  console.error("❌  Missing DISCORD_TOKEN in .env — see README.md");
  process.exit(1);
}
if (!process.env.LOG_CHANNEL_ID) {
  console.error("❌  Missing LOG_CHANNEL_ID in .env — see README.md");
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
  ],
});

const WATCHED_USER_ID = "236560087789993985";
const DEBOUNCE_MS = 5000; // wait 5s to confirm the change sticks before alerting

let lastKnownCustomStatus = undefined; // undefined = never seen
let pendingTimeout = null;

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

client.on("presenceUpdate", async (oldPresence, newPresence) => {
  const member = newPresence?.member ?? oldPresence?.member;
  if (!member || member.user.id !== WATCHED_USER_ID) return;

  // If user is offline, don't touch the cache — wait for them to come back
  if (!newPresence || newPresence.status === "offline") return;

  const newCustom = getCustomStatus(newPresence);

  // First time we've seen them — just cache, don't alert
  if (lastKnownCustomStatus === undefined) {
    lastKnownCustomStatus = newCustom;
    return;
  }

  // Already matches what we last confirmed — nothing to do
  if (newCustom === lastKnownCustomStatus) {
    // A pending change reverted back — cancel it
    if (pendingTimeout) {
      clearTimeout(pendingTimeout);
      pendingTimeout = null;
    }
    return;
  }

  // Value differs from confirmed state — wait to see if it sticks (debounce flicker)
  if (pendingTimeout) clearTimeout(pendingTimeout);

  pendingTimeout = setTimeout(async () => {
    pendingTimeout = null;

    // Re-check live presence after the wait, in case it changed again
    const freshMember = await member.guild.members.fetch(WATCHED_USER_ID).catch(() => null);
    const livePresence = freshMember?.presence;
    const liveCustom = getCustomStatus(livePresence);

    if (liveCustom === lastKnownCustomStatus) return; // reverted, ignore

    const from = lastKnownCustomStatus ? `"${lastKnownCustomStatus}"` : "_none_";
    const to   = liveCustom ? `"${liveCustom}"` : "_none_";
    lastKnownCustomStatus = liveCustom;

    console.log(`[DEBUG] Confirmed custom status change: ${from} → ${to}`);

    await sendEmbed(
      makeEmbed(member.user, `✏️ **Custom status changed**\n${from} → ${to}`)
    );
  }, DEBOUNCE_MS);
});

client.once("ready", () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  console.log(`📢 Logging to channel: ${process.env.LOG_CHANNEL_ID}`);
});

client.login(process.env.DISCORD_TOKEN);