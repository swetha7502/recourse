ALTER TABLE "orders" ADD COLUMN "simulated_agent_error" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_intent_id_unique" UNIQUE("intent_id");