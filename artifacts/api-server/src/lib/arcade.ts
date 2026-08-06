import { and, desc, eq, sql } from "drizzle-orm";
import {
  activityTable,
  db,
  economyAccountsTable,
  inventoryTable,
  serverSettingsTable,
  type EconomyAccount,
  type ServerSettings,
} from "@workspace/db";

export const SHOP_ITEMS = [
  { id: "lucky-ticket", name: "Lucky Ticket", price: 420, description: "Adds a little luck to your next game." },
  { id: "neon-key", name: "Neon Key", price: 700, description: "Opens a mystery reward crate." },
  { id: "shield-token", name: "Shield Token", price: 950, description: "Protects one message from cleanup." },
  { id: "xp-booster", name: "XP Booster", price: 1250, description: "Doubles XP from your next activity." },
  { id: "mystery-box", name: "Mystery Box", price: 1800, description: "A surprise item with a surprise value." },
] as const;

export type ArcadeAction = "daily" | "work" | "beg" | "crime" | "hunt" | "fish";

const COOLDOWNS: Record<ArcadeAction, number> = {
  daily: 24 * 60 * 60 * 1000,
  work: 60 * 60 * 1000,
  beg: 45 * 60 * 1000,
  crime: 30 * 60 * 1000,
  hunt: 20 * 60 * 1000,
  fish: 15 * 60 * 1000,
};

const COOLDOWN_FIELDS: Record<ArcadeAction, keyof EconomyAccount> = {
  daily: "lastDailyAt",
  work: "lastWorkAt",
  beg: "lastBegAt",
  crime: "lastCrimeAt",
  hunt: "lastHuntAt",
  fish: "lastFishAt",
};

export const formatCredits = (amount: number) =>
  `${Math.max(0, Math.round(amount)).toLocaleString()} credits`;

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(1, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

export async function getSettings(
  guildId: string,
  guildName?: string,
): Promise<ServerSettings> {
  const [existing] = await db
    .select()
    .from(serverSettingsTable)
    .where(eq(serverSettingsTable.guildId, guildId))
    .limit(1);

  if (existing) {
    if (guildName && existing.guildName !== guildName) {
      const [updated] = await db
        .update(serverSettingsTable)
        .set({ guildName })
        .where(eq(serverSettingsTable.guildId, guildId))
        .returning();
      return updated ?? existing;
    }
    return existing;
  }

  const [created] = await db
    .insert(serverSettingsTable)
    .values({ guildId, guildName: guildName ?? "Discord server" })
    .returning();
  return created;
}

export async function getAccount(
  guildId: string,
  userId: string,
  username: string,
): Promise<EconomyAccount> {
  const [account] = await db
    .insert(economyAccountsTable)
    .values({ guildId, userId, username })
    .onConflictDoUpdate({
      target: [economyAccountsTable.guildId, economyAccountsTable.userId],
      set: { username, updatedAt: new Date() },
    })
    .returning();
  return account;
}

export async function recordActivity(input: {
  guildId: string;
  userId?: string;
  type: string;
  title: string;
  detail: string;
  amount?: number;
}) {
  await db.insert(activityTable).values(input);
}

function cooldownFor(account: EconomyAccount, action: ArcadeAction): number {
  const value = account[COOLDOWN_FIELDS[action]];
  if (!(value instanceof Date)) return 0;
  return Math.max(0, COOLDOWNS[action] - (Date.now() - value.getTime()));
}

export async function runEarningAction(input: {
  guildId: string;
  guildName: string;
  userId: string;
  username: string;
  action: ArcadeAction;
}): Promise<{ account: EconomyAccount; amount: number; message: string; remaining?: number }> {
  const account = await getAccount(input.guildId, input.userId, input.username);
  const remaining = cooldownFor(account, input.action);
  if (remaining > 0) {
    return {
      account,
      amount: 0,
      remaining,
      message: `You can use \`${input.action}\` again in **${formatDuration(remaining)}**.`,
    };
  }

  const ranges: Record<ArcadeAction, [number, number]> = {
    daily: [250, 250],
    work: [180, 420],
    beg: [20, 120],
    crime: [100, 700],
    hunt: [120, 520],
    fish: [80, 360],
  };
  const [min, max] = ranges[input.action];
  let amount = min + Math.floor(Math.random() * (max - min + 1));
  let message = "";
  if (input.action === "crime" && Math.random() < 0.2) {
    amount = -Math.max(50, Math.floor(amount * 0.65));
    message = `The job went sideways. You lost **${formatCredits(Math.abs(amount))}**.`;
  } else {
    const nouns: Record<Exclude<ArcadeAction, "daily">, string> = {
      work: "shift",
      beg: "kind stranger",
      crime: "heist",
      hunt: "hunt",
      fish: "fishing trip",
    };
    message =
      input.action === "daily"
        ? `Daily reward claimed. Your streak is now **${account.dailyStreak + 1}**.`
        : `Your ${nouns[input.action]} paid out **${formatCredits(amount)}**.`;
  }

  const field = COOLDOWN_FIELDS[input.action];
  const nextStreak =
    input.action === "daily" ? account.dailyStreak + 1 : account.dailyStreak;
  const [updated] = await db
    .update(economyAccountsTable)
    .set({
      wallet: sql`${economyAccountsTable.wallet} + ${amount}`,
      xp: sql`${economyAccountsTable.xp} + ${Math.round(Math.max(5, Math.abs(amount) / 10))}`,
      dailyStreak: nextStreak,
      [field]: new Date(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(economyAccountsTable.guildId, input.guildId),
        eq(economyAccountsTable.userId, input.userId),
      ),
    )
    .returning();

  await recordActivity({
    guildId: input.guildId,
    userId: input.userId,
    type: amount >= 0 ? "earn" : "spend",
    title: `${input.action[0].toUpperCase()}${input.action.slice(1)} command`,
    detail: `${input.username} used ${input.action}`,
    amount,
  });

  return { account: updated ?? account, amount, message };
}

export async function getInventory(guildId: string, userId: string) {
  return db
    .select({
      itemId: inventoryTable.itemId,
      quantity: inventoryTable.quantity,
    })
    .from(inventoryTable)
    .where(
      and(
        eq(inventoryTable.guildId, guildId),
        eq(inventoryTable.userId, userId),
      ),
    );
}

export async function buyItem(input: {
  guildId: string;
  userId: string;
  username: string;
  itemId: string;
  quantity: number;
}) {
  const item = SHOP_ITEMS.find((candidate) => candidate.id === input.itemId);
  if (!item) return { ok: false as const, message: "That item is not in the shop." };
  const quantity = Math.max(1, Math.floor(input.quantity));
  const total = item.price * quantity;
  const account = await getAccount(input.guildId, input.userId, input.username);
  if (account.wallet < total) {
    return {
      ok: false as const,
      message: `You need **${formatCredits(total - account.wallet)}** more.`,
    };
  }

  await db
    .update(economyAccountsTable)
    .set({
      wallet: sql`${economyAccountsTable.wallet} - ${total}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(economyAccountsTable.guildId, input.guildId),
        eq(economyAccountsTable.userId, input.userId),
      ),
    );

  await db
    .insert(inventoryTable)
    .values({
      guildId: input.guildId,
      userId: input.userId,
      itemId: input.itemId,
      quantity,
    })
    .onConflictDoUpdate({
      target: [
        inventoryTable.guildId,
        inventoryTable.userId,
        inventoryTable.itemId,
      ],
      set: {
        quantity: sql`${inventoryTable.quantity} + ${quantity}`,
        updatedAt: new Date(),
      },
    });

  await recordActivity({
    guildId: input.guildId,
    userId: input.userId,
    type: "spend",
    title: `Bought ${item.name}`,
    detail: `${input.username} bought ${quantity} item${quantity === 1 ? "" : "s"}`,
    amount: -total,
  });
  return {
    ok: true as const,
    message: `Bought **${quantity} × ${item.name}** for **${formatCredits(total)}**.`,
  };
}

export async function getLeaderboard(guildId: string, limit = 10) {
  return db
    .select()
    .from(economyAccountsTable)
    .where(eq(economyAccountsTable.guildId, guildId))
    .orderBy(desc(economyAccountsTable.wallet), desc(economyAccountsTable.bank))
    .limit(limit);
}

export async function getRecentActivity(guildId: string, limit = 20) {
  return db
    .select()
    .from(activityTable)
    .where(eq(activityTable.guildId, guildId))
    .orderBy(desc(activityTable.createdAt))
    .limit(limit);
}

export async function moveMoney(input: {
  guildId: string;
  userId: string;
  username: string;
  kind: "deposit" | "withdraw";
  amount: number;
}) {
  const amount = Math.max(0, Math.floor(input.amount));
  const account = await getAccount(input.guildId, input.userId, input.username);
  const from = input.kind === "deposit" ? account.wallet : account.bank;
  if (amount === 0 || from < amount) {
    return { ok: false as const, message: "That amount is not available." };
  }
  const walletDelta = input.kind === "deposit" ? -amount : amount;
  const bankDelta = input.kind === "deposit" ? amount : -amount;
  const [updated] = await db
    .update(economyAccountsTable)
    .set({
      wallet: sql`${economyAccountsTable.wallet} + ${walletDelta}`,
      bank: sql`${economyAccountsTable.bank} + ${bankDelta}`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(economyAccountsTable.guildId, input.guildId),
        eq(economyAccountsTable.userId, input.userId),
      ),
    )
    .returning();
  await recordActivity({
    guildId: input.guildId,
    userId: input.userId,
    type: input.kind === "deposit" ? "spend" : "earn",
    title: input.kind === "deposit" ? "Bank deposit" : "Bank withdrawal",
    detail: `${input.username} moved credits`,
    amount: input.kind === "deposit" ? -amount : amount,
  });
  return { ok: true as const, account: updated ?? account, message: `Moved **${formatCredits(amount)}**.` };
}