import { Router, type IRouter } from "express";
import { GetDiscordStatusResponse } from "@workspace/api-zod";

type DiscordUser = {
  username?: string;
  discriminator?: string;
  global_name?: string | null;
};

type DiscordGuild = {
  id: string;
  name?: string;
};

type CachedStatus = {
  expiresAt: number;
  data: ReturnType<typeof GetDiscordStatusResponse.parse>;
};

const router: IRouter = Router();
let cachedStatus: CachedStatus | undefined;

async function fetchDiscordStatus() {
  const token = process.env["DISCORD_BOT_TOKEN"];

  if (!token) {
    return GetDiscordStatusResponse.parse({
      connected: false,
      botName: null,
      botTag: null,
      guildCount: 0,
      message: "Add a Discord bot token to connect your server.",
      primaryGuildId: null,
      primaryGuildName: null,
    });
  }

  const headers = {
    Authorization: `Bot ${token}`,
    Accept: "application/json",
  };

  try {
    const [userResponse, guildsResponse] = await Promise.all([
      fetch("https://discord.com/api/v10/users/@me", { headers }),
      fetch("https://discord.com/api/v10/users/@me/guilds", { headers }),
    ]);

    if (!userResponse.ok || !guildsResponse.ok) {
      return GetDiscordStatusResponse.parse({
        connected: false,
        botName: null,
        botTag: null,
        guildCount: 0,
        message: "Discord did not accept the bot token.",
        primaryGuildId: null,
        primaryGuildName: null,
      });
    }

    const user = (await userResponse.json()) as DiscordUser;
    const guilds = (await guildsResponse.json()) as DiscordGuild[];
    const botName = user.global_name || user.username || null;
    const botTag =
      user.username && user.discriminator && user.discriminator !== "0"
        ? `${user.username}#${user.discriminator}`
        : user.username || null;

    return GetDiscordStatusResponse.parse({
      connected: true,
      botName,
      botTag,
      guildCount: guilds.length,
      message: "Discord bot is connected and ready.",
      primaryGuildId: guilds[0]?.id ?? null,
      primaryGuildName: guilds[0]?.name ?? null,
    });
  } catch {
    return GetDiscordStatusResponse.parse({
      connected: false,
      botName: null,
      botTag: null,
      guildCount: 0,
      message: "Discord could not be reached right now.",
      primaryGuildId: null,
      primaryGuildName: null,
    });
  }
}

router.get("/discord/status", async (_req, res) => {
  const now = Date.now();

  if (cachedStatus && cachedStatus.expiresAt > now) {
    res.json(cachedStatus.data);
    return;
  }

  const data = await fetchDiscordStatus();
  cachedStatus = { data, expiresAt: now + 30_000 };
  res.json(data);
});

export default router;