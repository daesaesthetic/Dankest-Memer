import type { EconomyAccount } from "@workspace/db";

export const SHOP_ITEMS = [
  { id: "lucky-ticket", name: "Lucky Ticket", price: 420, description: "Adds a little luck to your next game." },
  { id: "neon-key", name: "Neon Key", price: 700, description: "Opens a mystery reward crate." },
  { id: "shield-token", name: "Shield Token", price: 950, description: "Protects one message from cleanup." },
  { id: "xp-booster", name: "XP Booster", price: 1250, description: "Doubles XP from your next activity." },
  { id: "mystery-box", name: "Mystery Box", price: 1800, description: "A surprise item with a surprise value." },
] as const;

export type ArcadeAction = "daily" | "work" | "beg" | "crime" | "hunt" | "fish";

export type EconomyIdentity = {
  guildId: string;
  userId: string;
  username: string;
};

export type EconomyActivity = {
  guildId: string;
  userId: string;
  type: "earn" | "spend";
  title: string;
  detail: string;
  amount: number;
};

export type EarningClaim = EconomyIdentity & {
  action: ArcadeAction;
  amount: number;
  xp: number;
  occurredAt: Date;
  eligibleBefore: Date;
  activity: EconomyActivity;
};

export interface EconomyMutationStore {
  ensureAccount(identity: EconomyIdentity): Promise<EconomyAccount>;
  claimEarning(claim: EarningClaim): Promise<EconomyAccount | null>;
  moveMoney(input: EconomyIdentity & {
    kind: "deposit" | "withdraw";
    amount: number;
    activity: EconomyActivity;
  }): Promise<EconomyAccount | null>;
  purchase(input: EconomyIdentity & {
    itemId: string;
    quantity: number;
    total: number;
    activity: EconomyActivity;
  }): Promise<EconomyAccount | null>;
  transfer(input: EconomyIdentity & {
    recipientId: string;
    amount: number;
  }): Promise<boolean>;
}

type ServiceOptions = {
  clock?: () => Date;
  random?: () => number;
};

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

const MAX_DATABASE_INTEGER = 2_147_483_647;

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

export function toPositiveDatabaseInteger(value: number): number | null {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAX_DATABASE_INTEGER) {
    return null;
  }
  return value;
}

export function cooldownRemaining(
  account: EconomyAccount,
  action: ArcadeAction,
  now: Date,
): number {
  const value = account[COOLDOWN_FIELDS[action]];
  if (!(value instanceof Date)) return 0;
  return Math.max(0, COOLDOWNS[action] - (now.getTime() - value.getTime()));
}

function earningAmount(action: ArcadeAction, random: () => number): number {
  const ranges: Record<ArcadeAction, [number, number]> = {
    daily: [250, 250],
    work: [180, 420],
    beg: [20, 120],
    crime: [100, 700],
    hunt: [120, 520],
    fish: [80, 360],
  };
  const [min, max] = ranges[action];
  const amount = min + Math.floor(random() * (max - min + 1));
  return action === "crime" && random() < 0.2
    ? -Math.max(50, Math.floor(amount * 0.65))
    : amount;
}

function earningMessage(
  action: ArcadeAction,
  amount: number,
  nextStreak: number,
): string {
  if (amount < 0) {
    return `The job went sideways. You lost **${formatCredits(Math.abs(amount))}**.`;
  }
  if (action === "daily") {
    return `Daily reward claimed. Your streak is now **${nextStreak}**.`;
  }
  const nouns: Record<Exclude<ArcadeAction, "daily">, string> = {
    work: "shift",
    beg: "kind stranger",
    crime: "heist",
    hunt: "hunt",
    fish: "fishing trip",
  };
  return `Your ${nouns[action]} paid out **${formatCredits(amount)}**.`;
}

export function createEconomyService(
  store: EconomyMutationStore,
  options: ServiceOptions = {},
) {
  const clock = options.clock ?? (() => new Date());
  const random = options.random ?? Math.random;

  return {
    async runEarningAction(input: EconomyIdentity & { action: ArcadeAction }) {
      const account = await store.ensureAccount(input);
      const now = clock();
      const remaining = cooldownRemaining(account, input.action, now);
      if (remaining > 0) {
        return {
          account,
          amount: 0,
          remaining,
          message: `You can use \`${input.action}\` again in **${formatDuration(remaining)}**.`,
        };
      }

      const amount = earningAmount(input.action, random);
      const nextStreak =
        input.action === "daily" ? account.dailyStreak + 1 : account.dailyStreak;
      const updated = await store.claimEarning({
        ...input,
        amount,
        xp: Math.round(Math.max(5, Math.abs(amount) / 10)),
        occurredAt: now,
        eligibleBefore: new Date(now.getTime() - COOLDOWNS[input.action]),
        activity: {
          guildId: input.guildId,
          userId: input.userId,
          type: amount >= 0 ? "earn" : "spend",
          title: `${input.action[0].toUpperCase()}${input.action.slice(1)} command`,
          detail: `${input.username} used ${input.action}`,
          amount,
        },
      });

      if (!updated) {
        const latest = await store.ensureAccount(input);
        const retryIn = cooldownRemaining(latest, input.action, clock());
        return {
          account: latest,
          amount: 0,
          remaining: retryIn,
          message: retryIn > 0
            ? `You can use \`${input.action}\` again in **${formatDuration(retryIn)}**.`
            : "That action could not be completed because your balance changed. Please try again.",
        };
      }

      return {
        account: updated,
        amount,
        message: earningMessage(input.action, amount, nextStreak),
      };
    },

    async moveMoney(input: EconomyIdentity & {
      kind: "deposit" | "withdraw";
      amount: number;
    }) {
      const amount = toPositiveDatabaseInteger(input.amount);
      if (!amount) {
        return { ok: false as const, message: "That amount is not available." };
      }
      await store.ensureAccount(input);
      const updated = await store.moveMoney({
        ...input,
        amount,
        activity: {
          guildId: input.guildId,
          userId: input.userId,
          type: input.kind === "deposit" ? "spend" : "earn",
          title: input.kind === "deposit" ? "Bank deposit" : "Bank withdrawal",
          detail: `${input.username} moved credits`,
          amount: input.kind === "deposit" ? -amount : amount,
        },
      });
      return updated
        ? { ok: true as const, account: updated, message: `Moved **${formatCredits(amount)}**.` }
        : { ok: false as const, message: "That amount is not available." };
    },

    async buyItem(input: EconomyIdentity & {
      itemId: string;
      quantity: number;
    }) {
      const item = SHOP_ITEMS.find((candidate) => candidate.id === input.itemId);
      if (!item) return { ok: false as const, message: "That item is not in the shop." };
      const quantity = toPositiveDatabaseInteger(input.quantity);
      if (!quantity || quantity > Math.floor(MAX_DATABASE_INTEGER / item.price)) {
        return { ok: false as const, message: "Choose a valid quantity." };
      }
      const total = item.price * quantity;
      const account = await store.ensureAccount(input);
      const updated = await store.purchase({
        ...input,
        quantity,
        total,
        activity: {
          guildId: input.guildId,
          userId: input.userId,
          type: "spend",
          title: `Bought ${item.name}`,
          detail: `${input.username} bought ${quantity} item${quantity === 1 ? "" : "s"}`,
          amount: -total,
        },
      });
      if (!updated) {
        return {
          ok: false as const,
          message: `You need **${formatCredits(total - account.wallet)}** more.`,
        };
      }
      return {
        ok: true as const,
        account: updated,
        message: `Bought **${quantity} × ${item.name}** for **${formatCredits(total)}**.`,
      };
    },

    async transferMoney(input: EconomyIdentity & {
      recipientId: string;
      recipientUsername: string;
      amount: number;
    }) {
      const amount = toPositiveDatabaseInteger(input.amount);
      if (!amount || input.recipientId === input.userId) {
        return { ok: false as const, message: "That amount is not available." };
      }
      await Promise.all([
        store.ensureAccount(input),
        store.ensureAccount({
          guildId: input.guildId,
          userId: input.recipientId,
          username: input.recipientUsername,
        }),
      ]);
      const transferred = await store.transfer({
        ...input,
        amount,
      });
      return transferred
        ? { ok: true as const, message: `Sent **${formatCredits(amount)}** to **${input.recipientUsername}**.` }
        : { ok: false as const, message: "You do not have enough in your wallet." };
    },
  };
}