import { Router, type IRouter } from "express";
import {
  BuyArcadeItemBody,
  BuyArcadeItemParams,
  ClaimArcadeDailyBody,
  ClaimArcadeDailyParams,
  GetArcadeOverviewQueryParams,
  MoveArcadeMoneyBody,
  MoveArcadeMoneyParams,
  UpdateArcadeSettingsBody,
  UpdateArcadeSettingsParams,
  GetArcadeOverviewResponse,
  UpdateArcadeSettingsResponse,
  MoveArcadeMoneyResponse,
  ClaimArcadeDailyResponse,
  BuyArcadeItemResponse,
} from "@workspace/api-zod";
import {
  db,
  economyAccountsTable,
  serverSettingsTable,
} from "@workspace/db";
import { and, eq, sql } from "drizzle-orm";
import {
  SHOP_ITEMS,
  buyItem,
  getAccount,
  getInventory,
  getLeaderboard,
  getRecentActivity,
  getSettings,
  moveMoney,
  runEarningAction,
} from "../lib/arcade";

const router: IRouter = Router();

function serializeAccount(account: typeof economyAccountsTable.$inferSelect) {
  return {
    ...account,
    lastDailyAt: account.lastDailyAt?.toISOString() ?? null,
  };
}

function serializeActivity(activity: Awaited<ReturnType<typeof getRecentActivity>>[number]) {
  return {
    ...activity,
    createdAt: activity.createdAt.toISOString(),
  };
}

function serializeSettings(settings: Awaited<ReturnType<typeof getSettings>>) {
  return {
    ...settings,
    interestBps: settings.interestBps,
    dailyAmount: settings.dailyAmount,
  };
}

router.get("/arcade/overview", async (req, res): Promise<void> => {
  const parsed = GetArcadeOverviewQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const guildId = parsed.data.guildId;
  const settings = await getSettings(guildId);
  const [account, inventory, leaderboard, activity] = await Promise.all([
    parsed.data.userId && parsed.data.username
      ? getAccount(guildId, parsed.data.userId, parsed.data.username)
      : Promise.resolve(null),
    parsed.data.userId ? getInventory(guildId, parsed.data.userId) : Promise.resolve([]),
    getLeaderboard(guildId),
    getRecentActivity(guildId),
  ]);

  const response = {
    settings: serializeSettings(settings),
    account: account ? serializeAccount(account) : null,
    inventory,
    shop: SHOP_ITEMS,
    leaderboard: leaderboard.map(serializeAccount),
    activity: activity.map(serializeActivity),
    memberCount: leaderboard.length,
  };
  res.json(GetArcadeOverviewResponse.parse(response));
});

router.patch("/arcade/settings/:guildId", async (req, res): Promise<void> => {
  const params = UpdateArcadeSettingsParams.safeParse(req.params);
  const body = UpdateArcadeSettingsBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: !params.success ? params.error.message : "Invalid request body",
    });
    return;
  }

  const updates = {
    ...(body.data.prefix === undefined ? {} : { prefix: body.data.prefix.slice(0, 8) }),
    ...(body.data.interestBps === undefined ? {} : { interestBps: Math.max(0, Math.min(2500, Math.round(body.data.interestBps))) }),
    ...(body.data.dailyAmount === undefined ? {} : { dailyAmount: Math.max(1, Math.round(body.data.dailyAmount)) }),
    ...(body.data.toggles === undefined ? {} : { toggles: body.data.toggles }),
  };
  const [settings] = await db
    .update(serverSettingsTable)
    .set(updates)
    .where(eq(serverSettingsTable.guildId, params.data.guildId))
    .returning();
  const result = settings ?? await getSettings(params.data.guildId);
  res.json(UpdateArcadeSettingsResponse.parse(serializeSettings(result)));
});

router.post("/arcade/accounts/:guildId/:userId/bank", async (req, res): Promise<void> => {
  const params = MoveArcadeMoneyParams.safeParse(req.params);
  const body = MoveArcadeMoneyBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: !params.success ? params.error.message : "Invalid request body",
    });
    return;
  }
  const result = await moveMoney({
    guildId: params.data.guildId,
    userId: params.data.userId,
    username: body.data.username,
    kind: body.data.kind,
    amount: body.data.amount,
  });
  if (!result.ok) {
    res.status(400).json({ error: result.message });
    return;
  }
  res.json(MoveArcadeMoneyResponse.parse(serializeAccount(result.account)));
});

router.post("/arcade/accounts/:guildId/:userId/daily", async (req, res): Promise<void> => {
  const params = ClaimArcadeDailyParams.safeParse(req.params);
  const body = ClaimArcadeDailyBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: !params.success ? params.error.message : "Invalid request body",
    });
    return;
  }
  const result = await runEarningAction({
    guildId: params.data.guildId,
    userId: params.data.userId,
    username: body.data.username,
    action: "daily",
  });
  res.json(
    ClaimArcadeDailyResponse.parse({
      ok: result.amount > 0,
      message: result.message,
      account: serializeAccount(result.account),
    }),
  );
});

router.post("/arcade/accounts/:guildId/:userId/shop", async (req, res): Promise<void> => {
  const params = BuyArcadeItemParams.safeParse(req.params);
  const body = BuyArcadeItemBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({
      error: !params.success ? params.error.message : "Invalid request body",
    });
    return;
  }
  const result = await buyItem({
    guildId: params.data.guildId,
    userId: params.data.userId,
    username: body.data.username,
    itemId: body.data.itemId,
    quantity: body.data.quantity,
  });
  const account = result.ok
    ? result.account
    : await getAccount(params.data.guildId, params.data.userId, body.data.username);
  res.json(
    BuyArcadeItemResponse.parse({
      ok: result.ok,
      message: result.message,
      account: serializeAccount(account),
    }),
  );
});

export default router;