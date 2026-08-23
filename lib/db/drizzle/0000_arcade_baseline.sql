CREATE TABLE IF NOT EXISTS "arcade_server_settings" (
  "guild_id" text PRIMARY KEY NOT NULL,
  "guild_name" text DEFAULT 'Discord server' NOT NULL,
  "prefix" text DEFAULT '!' NOT NULL,
  "interest_bps" integer DEFAULT 240 NOT NULL,
  "daily_amount" integer DEFAULT 250 NOT NULL,
  "toggles" jsonb DEFAULT '{"daily":true,"games":true,"shop":true,"memes":true}'::jsonb NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "arcade_economy_accounts" (
  "guild_id" text NOT NULL,
  "user_id" text NOT NULL,
  "username" text NOT NULL,
  "wallet" integer DEFAULT 500 NOT NULL,
  "bank" integer DEFAULT 0 NOT NULL,
  "xp" integer DEFAULT 0 NOT NULL,
  "achievement_count" integer DEFAULT 0 NOT NULL,
  "daily_streak" integer DEFAULT 0 NOT NULL,
  "last_daily_at" timestamp with time zone,
  "last_work_at" timestamp with time zone,
  "last_beg_at" timestamp with time zone,
  "last_crime_at" timestamp with time zone,
  "last_hunt_at" timestamp with time zone,
  "last_fish_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "arcade_economy_accounts_guild_id_user_id_pk" PRIMARY KEY("guild_id", "user_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "arcade_inventory" (
  "guild_id" text NOT NULL,
  "user_id" text NOT NULL,
  "item_id" text NOT NULL,
  "quantity" integer DEFAULT 0 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "arcade_inventory_guild_id_user_id_item_id_pk" PRIMARY KEY("guild_id", "user_id", "item_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "arcade_activity" (
  "id" serial PRIMARY KEY NOT NULL,
  "guild_id" text NOT NULL,
  "user_id" text,
  "type" text NOT NULL,
  "title" text NOT NULL,
  "detail" text NOT NULL,
  "amount" integer,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);