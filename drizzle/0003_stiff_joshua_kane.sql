CREATE TABLE "llm_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_usage" (
	"day" text NOT NULL,
	"model" text NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "llm_usage_day_model_pk" PRIMARY KEY("day","model")
);
--> statement-breakpoint
ALTER TABLE "rulings" ADD COLUMN "prompt_hash" text;