import {
  Client,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type Guild,
  type GuildMember,
  type Message,
} from "discord.js";
import { and, eq, sql } from "drizzle-orm";
import {
  db,
  economyAccountsTable,
  serverSettingsTable,
} from "@workspace/db";
import {
  SHOP_ITEMS,
  buyItem,
  formatCredits,
  formatDuration,
  getAccount,
  getInventory,
  getLeaderboard,
  getSettings,
  moveMoney,
  runEarningAction,
} from "./arcade";
import { logger } from "./logger";

const prefixCommands = new Set([
  "help",
  "balance",
  "bank",
  "deposit",
  "withdraw",
  "daily",
  "work",
  "beg",
  "crime",
  "hunt",
  "fish",
  "shop",
  "buy",
  "inventory",
  "leaderboard",
  "flip",
  "slots",
  "trivia",
  "meme",
  "give",
  "setprefix",
  "setinterest",
  "lock",
  "unlock",
  "kick",
  "ban",
]);

const slashCommands = [
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Browse Arcade Command's commands"),
  new SlashCommandBuilder()
    .setName("balance")
    .setDescription("Check your wallet and bank"),
  new SlashCommandBuilder()
    .setName("bank")
    .setDescription("Check your bank balance and interest rate"),
  new SlashCommandBuilder()
    .setName("deposit")
    .setDescription("Move credits into your bank")
    .addIntegerOption((option) =>
      option.setName("amount").setDescription("Credits to deposit").setRequired(true).setMinValue(1),
    ),
  new SlashCommandBuilder()
    .setName("withdraw")
    .setDescription("Move credits out of your bank")
    .addIntegerOption((option) =>
      option.setName("amount").setDescription("Credits to withdraw").setRequired(true).setMinValue(1),
    ),
  new SlashCommandBuilder().setName("daily").setDescription("Claim your daily reward"),
  new SlashCommandBuilder().setName("work").setDescription("Work for a random payout"),
  new SlashCommandBuilder().setName("beg").setDescription("Ask the community for credits"),
  new SlashCommandBuilder().setName("crime").setDescription("Take a risky job"),
  new SlashCommandBuilder().setName("hunt").setDescription("Go on a hunting trip"),
  new SlashCommandBuilder().setName("fish").setDescription("Try your luck fishing"),
  new SlashCommandBuilder().setName("shop").setDescription("Browse the community shop"),
  new SlashCommandBuilder()
    .setName("buy")
    .setDescription("Buy an item from the shop")
    .addStringOption((option) =>
      option.setName("item").setDescription("Item id").setRequired(true),
    )
    .addIntegerOption((option) =>
      option.setName("quantity").setDescription("How many").setMinValue(1),
    ),
  new SlashCommandBuilder().setName("inventory").setDescription("View your inventory"),
  new SlashCommandBuilder()
    .setName("leaderboard")
    .setDescription("See the richest members"),
  new SlashCommandBuilder()
    .setName("flip")
    .setDescription("Flip a coin")
    .addStringOption((option) =>
      option
        .setName("call")
        .setDescription("Heads or tails")
        .setRequired(true)
        .addChoices({ name: "Heads", value: "heads" }, { name: "Tails", value: "tails" }),
    ),
  new SlashCommandBuilder().setName("slots").setDescription("Play the slot machine"),
  new SlashCommandBuilder().setName("trivia").setDescription("Answer a quick trivia question"),
  new SlashCommandBuilder().setName("meme").setDescription("Get a meme prompt for the server"),
  new SlashCommandBuilder()
    .setName("give")
    .setDescription("Give credits to another member")
    .addUserOption((option) =>
      option.setName("member").setDescription("Member to pay").setRequired(true),
    )
    .addIntegerOption((option) =>
      option.setName("amount").setDescription("Credits to give").setRequired(true).setMinValue(1),
    ),
  new SlashCommandBuilder()
    .setName("setprefix")
    .setDescription("Change the server prefix")
    .addStringOption((option) =>
      option.setName("prefix").setDescription("Prefix such as ! or pls").setRequired(true),
    ),
  new SlashCommandBuilder()
    .setName("setinterest")
    .setDescription("Set the bank interest rate")
    .addNumberOption((option) =>
      option.setName("percent").setDescription("Daily percentage").setRequired(true).setMinValue(0).setMaxValue(25),
    ),
  new SlashCommandBuilder()
    .setName("lock")
    .setDescription("Lock the current channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder()
    .setName("unlock")
    .setDescription("Unlock the current channel")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),
  new SlashCommandBuilder()
    .setName("kick")
    .setDescription("Kick a member")
    .addUserOption((option) =>
      option.setName("member").setDescription("Member to kick").setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),
  new SlashCommandBuilder()
    .setName("ban")
    .setDescription("Ban a member")
    .addUserOption((option) =>
      option.setName("member").setDescription("Member to ban").setRequired(true),
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),
].map((command) => command.toJSON());

const commandHelp = [
  "**Economy**: `daily`, `work`, `beg`, `crime`, `hunt`, `fish`, `balance`, `bank`, `deposit`, `withdraw`",
  "**Shop**: `shop`, `buy <item>`, `inventory`, `give @member <amount>`",
  "**Games**: `flip heads`, `slots`, `trivia`, `meme`",
  "**Community**: `leaderboard`",
  "**Server**: `setprefix`, `setinterest`, `lock`, `unlock`, `kick`, `ban`",
];

function guildContext(guild: Guild, user: { id: string; username: string }) {
  return {
    guildId: guild.id,
    guildName: guild.name,
    userId: user.id,
    username: user.username,
  };
}

function memberCan(
  interaction: ChatInputCommandInteraction,
  permission: bigint,
): boolean {
  return Boolean(
    interaction.memberPermissions?.has(new PermissionsBitField(permission)),
  );
}

function messageMemberCan(message: Message, permission: bigint): boolean {
  return Boolean(
    message.member?.permissions.has(new PermissionsBitField(permission)),
  );
}

async function economyResponse(
  interaction: ChatInputCommandInteraction,
  action: Parameters<typeof runEarningAction>[0]["action"],
) {
  const result = await runEarningAction({
    ...guildContext(interaction.guild!, interaction.user),
    action,
  });
  await interaction.reply(
    result.amount === 0
      ? result.message
      : `${result.message}\nYour wallet is now **${formatCredits(result.account.wallet)}**.`,
  );
}

async function handleSlash(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply("This command only works inside a server.");
    return;
  }

  const context = guildContext(interaction.guild, interaction.user);
  const command = interaction.commandName;

  if (["daily", "work", "beg", "crime", "hunt", "fish"].includes(command)) {
    await economyResponse(interaction, command as Parameters<typeof runEarningAction>[0]["action"]);
    return;
  }

  if (command === "help") {
    await interaction.reply(commandHelp.join("\n"));
    return;
  }

  if (command === "balance" || command === "bank") {
    const [account, settings] = await Promise.all([
      getAccount(context.guildId, context.userId, context.username),
      getSettings(context.guildId, context.guildName),
    ]);
    const message =
      command === "bank"
        ? `Bank: **${formatCredits(account.bank)}**\nDaily interest: **${(settings.interestBps / 100).toFixed(2)}%**`
        : `Wallet: **${formatCredits(account.wallet)}**\nBank: **${formatCredits(account.bank)}**\nNet worth: **${formatCredits(account.wallet + account.bank)}**`;
    await interaction.reply(message);
    return;
  }

  if (command === "deposit" || command === "withdraw") {
    const result = await moveMoney({
      ...context,
      kind: command,
      amount: interaction.options.getInteger("amount", true),
    });
    await interaction.reply(result.message);
    return;
  }

  if (command === "shop") {
    await interaction.reply(
      SHOP_ITEMS.map((item) => `\`${item.id}\` — **${item.name}** · ${formatCredits(item.price)}\n${item.description}`).join("\n\n"),
    );
    return;
  }

  if (command === "buy") {
    const result = await buyItem({
      ...context,
      itemId: interaction.options.getString("item", true),
      quantity: interaction.options.getInteger("quantity") ?? 1,
    });
    await interaction.reply(result.message);
    return;
  }

  if (command === "inventory") {
    const inventory = await getInventory(context.guildId, context.userId);
    const lines = inventory
      .map((entry) => {
        const item = SHOP_ITEMS.find((candidate) => candidate.id === entry.itemId);
        return item ? `**${item.name}** × ${entry.quantity}` : `**${entry.itemId}** × ${entry.quantity}`;
      });
    await interaction.reply(lines.length ? lines.join("\n") : "Your inventory is empty. Try `/shop`.");
    return;
  }

  if (command === "leaderboard") {
    const rows = await getLeaderboard(context.guildId, 10);
    await interaction.reply(
      rows.length
        ? rows.map((row, index) => `**${index + 1}.** ${row.username} — ${formatCredits(row.wallet + row.bank)}`).join("\n")
        : "Nobody has a balance yet. Use `/daily` to start the season.",
    );
    return;
  }

  if (command === "flip") {
    const call = interaction.options.getString("call", true);
    const outcome = Math.random() > 0.5 ? "heads" : "tails";
    await interaction.reply(
      `The coin landed on **${outcome}**. ${call === outcome ? "You called it." : "Not this time."}`,
    );
    return;
  }

  if (command === "slots") {
    const symbols = ["star", "seven", "bell", "bar"];
    const roll = [0, 1, 2].map(() => symbols[Math.floor(Math.random() * symbols.length)]);
    const won = roll[0] === roll[1] && roll[1] === roll[2];
    if (won) {
      const result = await runEarningAction({ ...context, action: "work" });
      await interaction.reply(`${roll.join(" | ")}\nJackpot energy. ${result.message}`);
    } else {
      await interaction.reply(`${roll.join(" | ")}\nNo match. Try again when your luck is back.`);
    }
    return;
  }

  if (command === "trivia") {
    await interaction.reply("Trivia: Which command claims your daily reward?\nA. `/work`  B. `/daily`  C. `/bank`\nAnswer with A, B, or C.");
    return;
  }

  if (command === "meme") {
    await interaction.reply("Meme prompt: `WHEN THE SERVER SAYS ONE MORE GAME` / `AND IT IS 3 AM`");
    return;
  }

  if (command === "give") {
    const target = interaction.options.getUser("member", true);
    const amount = interaction.options.getInteger("amount", true);
    const sender = await getAccount(context.guildId, context.userId, context.username);
    if (sender.wallet < amount) {
      await interaction.reply("You do not have enough in your wallet.");
      return;
    }
    const recipient = await getAccount(context.guildId, target.id, target.username);
    await moveMoney({ ...context, kind: "withdraw", amount: 0 });
    await dbTransfer(context.guildId, sender.userId, recipient.userId, amount);
    await interaction.reply(`Sent **${formatCredits(amount)}** to **${target.username}**.`);
    return;
  }

  if (command === "setprefix" || command === "setinterest") {
    if (!memberCan(interaction, PermissionFlagsBits.ManageGuild)) {
      await interaction.reply("You need Manage Server permission to change Arcade settings.");
      return;
    }
    if (command === "setprefix") {
      const prefix = interaction.options.getString("prefix", true).slice(0, 8);
      await db
        .update(serverSettingsTable)
        .set({ prefix })
        .where(eq(serverSettingsTable.guildId, context.guildId));
      await interaction.reply(`Saved. Your server now uses **${prefix}**.`);
    } else {
      const interestBps = Math.round(
        interaction.options.getNumber("percent", true) * 100,
      );
      await db
        .update(serverSettingsTable)
        .set({ interestBps })
        .where(eq(serverSettingsTable.guildId, context.guildId));
      await interaction.reply(
        `Saved. Daily bank interest is now **${(interestBps / 100).toFixed(2)}%**.`,
      );
    }
    return;
  }

  if (["lock", "unlock"].includes(command)) {
    if (!memberCan(interaction, PermissionFlagsBits.ManageChannels)) {
      await interaction.reply("You need Manage Channels permission for that.");
      return;
    }
    const channel = interaction.channel;
    if (!channel || !("permissionOverwrites" in channel)) {
      await interaction.reply("That channel cannot be locked by the bot.");
      return;
    }
    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
      SendMessages: command === "unlock",
    });
    await interaction.reply(`${command === "lock" ? "Locked" : "Unlocked"} <#${channel.id}>.`);
    return;
  }

  if (command === "kick" || command === "ban") {
    const permission = command === "kick" ? PermissionFlagsBits.KickMembers : PermissionFlagsBits.BanMembers;
    if (!memberCan(interaction, permission)) {
      await interaction.reply(`You need ${command === "kick" ? "Kick Members" : "Ban Members"} permission for that.`);
      return;
    }
    const target = interaction.options.getMember("member");
    if (!target || !("kick" in target)) {
      await interaction.reply("That member is not available to moderate.");
      return;
    }
    if (command === "kick") await target.kick("Arcade Command moderation action");
    else if ("ban" in target) await target.ban({ reason: "Arcade Command moderation action" });
    await interaction.reply(`${command === "kick" ? "Kicked" : "Banned"} **${interaction.options.getUser("member", true).username}**.`);
  }
}

async function handlePrefix(message: Message): Promise<void> {
  if (!message.guild || message.author.bot) return;
  const settings = await getSettings(message.guild.id, message.guild.name);
  const content = message.content.trim();
  const startsWithPrefix = content.startsWith(settings.prefix);
  const startsWithPls = /^pls(?:\s|$)/i.test(content);
  if (!startsWithPrefix && !startsWithPls) return;

  const raw = startsWithPrefix
    ? content.slice(settings.prefix.length).trim()
    : content.replace(/^pls\s*/i, "");
  const [command, ...args] = raw.split(/\s+/);
  if (!command || !prefixCommands.has(command.toLowerCase())) return;
  const commandName = command.toLowerCase();
  const context = {
    guildId: message.guild.id,
    guildName: message.guild.name,
    userId: message.author.id,
    username: message.author.username,
  };

  if (["daily", "work", "beg", "crime", "hunt", "fish"].includes(commandName)) {
    const result = await runEarningAction({ ...context, action: commandName as Parameters<typeof runEarningAction>[0]["action"] });
    await message.reply(result.amount === 0 ? result.message : `${result.message}\nWallet: **${formatCredits(result.account.wallet)}**`);
  } else if (commandName === "help") {
    await message.reply(commandHelp.join("\n"));
  } else if (commandName === "balance" || commandName === "bank") {
    const account = await getAccount(context.guildId, context.userId, context.username);
    await message.reply(commandName === "bank" ? `Bank: **${formatCredits(account.bank)}**` : `Wallet: **${formatCredits(account.wallet)}** · Bank: **${formatCredits(account.bank)}**`);
  } else if (commandName === "shop") {
    await message.reply(SHOP_ITEMS.map((item) => `\`${item.id}\` — ${item.name}: ${formatCredits(item.price)}`).join("\n"));
  } else if (commandName === "buy") {
    const result = await buyItem({ ...context, itemId: args[0] ?? "", quantity: Number(args[1]) || 1 });
    await message.reply(result.message);
  } else if (commandName === "inventory") {
    const inventory = await getInventory(context.guildId, context.userId);
    await message.reply(inventory.length ? inventory.map((entry) => `${entry.itemId} × ${entry.quantity}`).join("\n") : "Your inventory is empty.");
  } else if (commandName === "leaderboard") {
    const rows = await getLeaderboard(context.guildId);
    await message.reply(rows.length ? rows.map((row, index) => `${index + 1}. ${row.username} — ${formatCredits(row.wallet + row.bank)}`).join("\n") : "No balances yet.");
  } else if (commandName === "flip") {
    const outcome = Math.random() > 0.5 ? "heads" : "tails";
    await message.reply(`The coin landed on **${outcome}**.`);
  } else if (commandName === "meme") {
    await message.reply("Meme prompt: `WHEN THE SERVER SAYS ONE MORE GAME` / `AND IT IS 3 AM`");
  } else if (commandName === "setprefix") {
    if (!messageMemberCan(message, PermissionFlagsBits.ManageGuild)) {
      await message.reply("You need Manage Server permission to change the prefix.");
      return;
    }
    const prefix = (args[0] ?? "!").slice(0, 8);
    await db
      .update(serverSettingsTable)
      .set({ prefix })
      .where(eq(serverSettingsTable.guildId, message.guild.id));
    await message.reply(`Prefix updated to **${args[0] ?? "!"}**.`);
  } else if (["lock", "unlock"].includes(commandName)) {
    if (!messageMemberCan(message, PermissionFlagsBits.ManageChannels)) {
      await message.reply("You need Manage Channels permission for that.");
      return;
    }
    if (!("permissionOverwrites" in message.channel)) {
      await message.reply("That channel cannot be locked by the bot.");
      return;
    }
    await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, { SendMessages: commandName === "unlock" });
    await message.reply(`${commandName === "lock" ? "Locked" : "Unlocked"} this channel.`);
  }
}

async function dbTransfer(guildId: string, senderId: string, recipientId: string, amount: number) {
  await db.update(economyAccountsTable).set({ wallet: sql`${economyAccountsTable.wallet} - ${amount}` }).where(and(eq(economyAccountsTable.guildId, guildId), eq(economyAccountsTable.userId, senderId)));
  await db.update(economyAccountsTable).set({ wallet: sql`${economyAccountsTable.wallet} + ${amount}` }).where(and(eq(economyAccountsTable.guildId, guildId), eq(economyAccountsTable.userId, recipientId)));
}

export async function startDiscordBot(): Promise<Client | null> {
  const token = process.env["DISCORD_BOT_TOKEN"];
  if (!token) {
    logger.warn("DISCORD_BOT_TOKEN is not configured; Discord bot runtime is disabled");
    return null;
  }

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once(Events.ClientReady, async (readyClient) => {
    logger.info({ user: readyClient.user.tag, guilds: readyClient.guilds.cache.size }, "Discord bot ready");
    for (const guild of readyClient.guilds.cache.values()) {
      try {
        const rest = new REST({ version: "10" }).setToken(token);
        await rest.put(Routes.applicationGuildCommands(readyClient.user.id, guild.id), { body: slashCommands });
        await getSettings(guild.id, guild.name);
        logger.info({ guildId: guild.id, guildName: guild.name }, "Registered Arcade commands");
      } catch (error) {
        logger.error({ err: error, guildId: guild.id }, "Failed to register Arcade commands");
      }
    }
  });

  client.on(Events.GuildCreate, async (guild) => {
    try {
      if (!client.user) return;
      const rest = new REST({ version: "10" }).setToken(token);
      await rest.put(Routes.applicationGuildCommands(client.user.id, guild.id), { body: slashCommands });
      await getSettings(guild.id, guild.name);
    } catch (error) {
      logger.error({ err: error, guildId: guild.id }, "Failed to register commands for new guild");
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    try {
      await handleSlash(interaction);
    } catch (error) {
      logger.error({ err: error, command: interaction.commandName }, "Discord slash command failed");
      const content = "Something went wrong while running that command.";
      if (interaction.replied || interaction.deferred) await interaction.followUp(content);
      else await interaction.reply(content);
    }
  });

  client.on(Events.MessageCreate, async (message) => {
    try {
      await handlePrefix(message);
    } catch (error) {
      logger.error({ err: error, guildId: message.guildId }, "Discord prefix command failed");
    }
  });

  client.login(token).catch((error) => {
    logger.error({ err: error }, "Discord bot login failed");
  });
  return client;
}