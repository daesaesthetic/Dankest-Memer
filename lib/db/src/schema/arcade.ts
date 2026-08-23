import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import {
  check,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const serverSettingsTable = pgTable("arcade_server_settings", {
  guildId: text("guild_id").primaryKey(),
  guildName: text("guild_name").notNull().default("Discord server"),
  prefix: text("prefix").notNull().default("!"),
  interestBps: integer("interest_bps").notNull().default(240),
  dailyAmount: integer("daily_amount").notNull().default(250),
  toggles: jsonb("toggles").$type<Record<string, boolean>>().notNull().default({
    daily: true,
    games: true,
    shop: true,
    memes: true,
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const economyAccountsTable = pgTable(
  "arcade_economy_accounts",
  {
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    username: text("username").notNull(),
    wallet: integer("wallet").notNull().default(500),
    bank: integer("bank").notNull().default(0),
    xp: integer("xp").notNull().default(0),
    achievementCount: integer("achievement_count").notNull().default(0),
    dailyStreak: integer("daily_streak").notNull().default(0),
    lastDailyAt: timestamp("last_daily_at", { withTimezone: true }),
    lastWorkAt: timestamp("last_work_at", { withTimezone: true }),
    lastBegAt: timestamp("last_beg_at", { withTimezone: true }),
    lastCrimeAt: timestamp("last_crime_at", { withTimezone: true }),
    lastHuntAt: timestamp("last_hunt_at", { withTimezone: true }),
    lastFishAt: timestamp("last_fish_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.guildId, table.userId] }),
    walletIsNonNegative: check(
      "arcade_economy_wallet_nonnegative",
      sql`${table.wallet} >= 0`,
    ),
    bankIsNonNegative: check(
      "arcade_economy_bank_nonnegative",
      sql`${table.bank} >= 0`,
    ),
    xpIsNonNegative: check(
      "arcade_economy_xp_nonnegative",
      sql`${table.xp} >= 0`,
    ),
    achievementCountIsNonNegative: check(
      "arcade_economy_achievement_count_nonnegative",
      sql`${table.achievementCount} >= 0`,
    ),
    dailyStreakIsNonNegative: check(
      "arcade_economy_daily_streak_nonnegative",
      sql`${table.dailyStreak} >= 0`,
    ),
  }),
);

export const inventoryTable = pgTable(
  "arcade_inventory",
  {
    guildId: text("guild_id").notNull(),
    userId: text("user_id").notNull(),
    itemId: text("item_id").notNull(),
    quantity: integer("quantity").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.guildId, table.userId, table.itemId] }),
    quantityIsPositive: check(
      "arcade_inventory_quantity_positive",
      sql`${table.quantity} > 0`,
    ),
  }),
);

export const activityTable = pgTable("arcade_activity", {
  id: serial("id").primaryKey(),
  guildId: text("guild_id").notNull(),
  userId: text("user_id"),
  type: text("type").notNull(),
  title: text("title").notNull(),
  detail: text("detail").notNull(),
  amount: integer("amount"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertServerSettingsSchema = createInsertSchema(serverSettingsTable);
export const insertEconomyAccountSchema = createInsertSchema(economyAccountsTable);
export type ServerSettings = typeof serverSettingsTable.$inferSelect;
export type EconomyAccount = typeof economyAccountsTable.$inferSelect;
export type InventoryItem = typeof inventoryTable.$inferSelect;
export type ActivityItem = typeof activityTable.$inferSelect;
export type InsertServerSettings = z.infer<typeof insertServerSettingsSchema>;