import assert from "node:assert/strict";
import test from "node:test";
import type { EconomyAccount } from "@workspace/db";
import {
  createEconomyService,
  toPositiveDatabaseInteger,
  type EconomyMutationStore,
} from "../src/lib/economy-service";

const now = new Date("2026-08-23T12:00:00.000Z");

function account(overrides: Partial<EconomyAccount> = {}): EconomyAccount {
  return {
    guildId: "guild-1",
    userId: "user-1",
    username: "Player",
    wallet: 1_000,
    bank: 0,
    xp: 0,
    achievementCount: 0,
    dailyStreak: 0,
    lastDailyAt: null,
    lastWorkAt: null,
    lastBegAt: null,
    lastCrimeAt: null,
    lastHuntAt: null,
    lastFishAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function mutationStore(overrides: Partial<EconomyMutationStore> = {}): EconomyMutationStore {
  const current = account();
  return {
    ensureAccount: async () => current,
    claimEarning: async (claim) => ({
      ...current,
      wallet: current.wallet + claim.amount,
      xp: current.xp + claim.xp,
      lastDailyAt: claim.action === "daily" ? claim.occurredAt : current.lastDailyAt,
    }),
    moveMoney: async () => current,
    purchase: async () => current,
    transfer: async () => true,
    ...overrides,
  };
}

test("rejects values that cannot be represented safely in PostgreSQL integers", () => {
  assert.equal(toPositiveDatabaseInteger(1), 1);
  assert.equal(toPositiveDatabaseInteger(0), null);
  assert.equal(toPositiveDatabaseInteger(1.5), null);
  assert.equal(toPositiveDatabaseInteger(Number.MAX_SAFE_INTEGER), null);
});

test("only awards one claim when two daily attempts race", async () => {
  let claimed = false;
  const current = account();
  const store = mutationStore({
    ensureAccount: async () => current,
    claimEarning: async (claim) => {
      if (claimed) return null;
      claimed = true;
      current.lastDailyAt = claim.occurredAt;
      current.wallet += claim.amount;
      return current;
    },
  });
  const economy = createEconomyService(store, {
    clock: () => now,
    random: () => 0.5,
  });

  const [first, second] = await Promise.all([
    economy.runEarningAction({
      guildId: "guild-1",
      userId: "user-1",
      username: "Player",
      action: "daily",
    }),
    economy.runEarningAction({
      guildId: "guild-1",
      userId: "user-1",
      username: "Player",
      action: "daily",
    }),
  ]);

  assert.equal(first.amount + second.amount, 250);
  assert.equal([first, second].filter((result) => result.remaining).length, 1);
  assert.equal(current.wallet, 1_250);
});

test("does not request a balance mutation for an invalid bank transfer", async () => {
  let attempted = false;
  const store = mutationStore({
    moveMoney: async () => {
      attempted = true;
      return account();
    },
  });
  const economy = createEconomyService(store);

  const result = await economy.moveMoney({
    guildId: "guild-1",
    userId: "user-1",
    username: "Player",
    kind: "deposit",
    amount: 0,
  });

  assert.equal(result.ok, false);
  assert.equal(attempted, false);
});

test("reports insufficient funds without crediting inventory", async () => {
  let purchaseAttempted = false;
  const economy = createEconomyService(mutationStore({
    ensureAccount: async () => account({ wallet: 100 }),
    purchase: async () => {
      purchaseAttempted = true;
      return null;
    },
  }));

  const result = await economy.buyItem({
    guildId: "guild-1",
    userId: "user-1",
    username: "Player",
    itemId: "lucky-ticket",
    quantity: 1,
  });

  assert.equal(result.ok, false);
  assert.equal(purchaseAttempted, true);
  assert.match(result.message, /320 credits/);
});

test("surfaces an atomic transfer rejection as the existing wallet error", async () => {
  const economy = createEconomyService(mutationStore({
    transfer: async () => false,
  }));

  const result = await economy.transferMoney({
    guildId: "guild-1",
    userId: "user-1",
    username: "Player",
    recipientId: "user-2",
    recipientUsername: "Recipient",
    amount: 100,
  });

  assert.deepEqual(result, {
    ok: false,
    message: "You do not have enough in your wallet.",
  });
});