import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import {
  activityTable,
  db,
  economyAccountsTable,
  inventoryTable,
  serverSettingsTable,
  type EconomyAccount,
  type ServerSettings,
} from "@workspace/db";
import {
  createEconomyService,
  formatCredits,
  formatDuration,
  SHOP_ITEMS,
  type ArcadeAction,
  type EconomyMutationStore,
} from "./economy-service";

export {
  formatCredits,
  formatDuration,
  SHOP_ITEMS,
};
export type { ArcadeAction };

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

function cooldownColumn(action: ArcadeAction) {
  switch (action) {
    case "daily":
      return economyAccountsTable.lastDailyAt;
    case "work":
      return economyAccountsTable.lastWorkAt;
    case "beg":
      return economyAccountsTable.lastBegAt;
    case "crime":
      return economyAccountsTable.lastCrimeAt;
    case "hunt":
      return economyAccountsTable.lastHuntAt;
    case "fish":
      return economyAccountsTable.lastFishAt;
  }
}

const cooldownFields: Record<ArcadeAction, "lastDailyAt" | "lastWorkAt" | "lastBegAt" | "lastCrimeAt" | "lastHuntAt" | "lastFishAt"> = {
  daily: "lastDailyAt",
  work: "lastWorkAt",
  beg: "lastBegAt",
  crime: "lastCrimeAt",
  hunt: "lastHuntAt",
  fish: "lastFishAt",
};

const economyStore: EconomyMutationStore = {
  ensureAccount: ({ guildId, userId, username }) => getAccount(guildId, userId, username),

  claimEarning: async (input) => db.transaction(async (tx) => {
    const conditions = [
      eq(economyAccountsTable.guildId, input.guildId),
      eq(economyAccountsTable.userId, input.userId),
      or(
        isNull(cooldownColumn(input.action)),
        lte(cooldownColumn(input.action), input.eligibleBefore),
      ),
    ];
    if (input.amount < 0) {
      conditions.push(gte(economyAccountsTable.wallet, Math.abs(input.amount)));
    }
    const [account] = await tx
      .update(economyAccountsTable)
      .set({
        wallet: sql`${economyAccountsTable.wallet} + ${input.amount}`,
        xp: sql`${economyAccountsTable.xp} + ${input.xp}`,
        dailyStreak: input.action === "daily"
          ? sql`${economyAccountsTable.dailyStreak} + 1`
          : undefined,
        [cooldownFields[input.action]]: input.occurredAt,
        updatedAt: input.occurredAt,
      })
      .where(and(...conditions))
      .returning();
    if (!account) return null;
    await tx.insert(activityTable).values(input.activity);
    return account;
  }),

  moveMoney: async (input) => db.transaction(async (tx) => {
    const sourceHasFunds = input.kind === "deposit"
      ? gte(economyAccountsTable.wallet, input.amount)
      : gte(economyAccountsTable.bank, input.amount);
    const [account] = await tx
      .update(economyAccountsTable)
      .set({
        wallet: input.kind === "deposit"
          ? sql`${economyAccountsTable.wallet} - ${input.amount}`
          : sql`${economyAccountsTable.wallet} + ${input.amount}`,
        bank: input.kind === "deposit"
          ? sql`${economyAccountsTable.bank} + ${input.amount}`
          : sql`${economyAccountsTable.bank} - ${input.amount}`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(economyAccountsTable.guildId, input.guildId),
        eq(economyAccountsTable.userId, input.userId),
        sourceHasFunds,
      ))
      .returning();
    if (!account) return null;
    await tx.insert(activityTable).values(input.activity);
    return account;
  }),

  purchase: async (input) => db.transaction(async (tx) => {
    const [account] = await tx
      .update(economyAccountsTable)
      .set({
        wallet: sql`${economyAccountsTable.wallet} - ${input.total}`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(economyAccountsTable.guildId, input.guildId),
        eq(economyAccountsTable.userId, input.userId),
        gte(economyAccountsTable.wallet, input.total),
      ))
      .returning();
    if (!account) return null;
    await tx
      .insert(inventoryTable)
      .values({
        guildId: input.guildId,
        userId: input.userId,
        itemId: input.itemId,
        quantity: input.quantity,
      })
      .onConflictDoUpdate({
        target: [inventoryTable.guildId, inventoryTable.userId, inventoryTable.itemId],
        set: {
          quantity: sql`${inventoryTable.quantity} + ${input.quantity}`,
          updatedAt: new Date(),
        },
      });
    await tx.insert(activityTable).values(input.activity);
    return account;
  }),

  transfer: async (input) => db.transaction(async (tx) => {
    const [sender] = await tx
      .update(economyAccountsTable)
      .set({
        wallet: sql`${economyAccountsTable.wallet} - ${input.amount}`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(economyAccountsTable.guildId, input.guildId),
        eq(economyAccountsTable.userId, input.userId),
        gte(economyAccountsTable.wallet, input.amount),
      ))
      .returning();
    if (!sender) return false;
    const [recipient] = await tx
      .update(economyAccountsTable)
      .set({
        wallet: sql`${economyAccountsTable.wallet} + ${input.amount}`,
        updatedAt: new Date(),
      })
      .where(and(
        eq(economyAccountsTable.guildId, input.guildId),
        eq(economyAccountsTable.userId, input.recipientId),
      ))
      .returning();
    if (!recipient) {
      throw new Error("Recipient account was not available for an atomic transfer.");
    }
    return true;
  }),
};

const economyService = createEconomyService(economyStore);

export const runEarningAction = economyService.runEarningAction;
export const moveMoney = economyService.moveMoney;
export const buyItem = economyService.buyItem;
export const transferMoney = economyService.transferMoney;