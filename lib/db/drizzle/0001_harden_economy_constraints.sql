UPDATE "arcade_economy_accounts"
SET
  "wallet" = GREATEST("wallet", 0),
  "bank" = GREATEST("bank", 0),
  "xp" = GREATEST("xp", 0),
  "achievement_count" = GREATEST("achievement_count", 0),
  "daily_streak" = GREATEST("daily_streak", 0);
--> statement-breakpoint
DELETE FROM "arcade_inventory" WHERE "quantity" <= 0;
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arcade_economy_wallet_nonnegative') THEN
    ALTER TABLE "arcade_economy_accounts" ADD CONSTRAINT "arcade_economy_wallet_nonnegative" CHECK ("wallet" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arcade_economy_bank_nonnegative') THEN
    ALTER TABLE "arcade_economy_accounts" ADD CONSTRAINT "arcade_economy_bank_nonnegative" CHECK ("bank" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arcade_economy_xp_nonnegative') THEN
    ALTER TABLE "arcade_economy_accounts" ADD CONSTRAINT "arcade_economy_xp_nonnegative" CHECK ("xp" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arcade_economy_achievement_count_nonnegative') THEN
    ALTER TABLE "arcade_economy_accounts" ADD CONSTRAINT "arcade_economy_achievement_count_nonnegative" CHECK ("achievement_count" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arcade_economy_daily_streak_nonnegative') THEN
    ALTER TABLE "arcade_economy_accounts" ADD CONSTRAINT "arcade_economy_daily_streak_nonnegative" CHECK ("daily_streak" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'arcade_inventory_quantity_positive') THEN
    ALTER TABLE "arcade_inventory" ADD CONSTRAINT "arcade_inventory_quantity_positive" CHECK ("quantity" > 0);
  END IF;
END
$$;