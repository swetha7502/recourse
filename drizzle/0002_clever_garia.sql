ALTER TABLE "cases" ADD CONSTRAINT "cases_order_id_unique" UNIQUE("order_id");--> statement-breakpoint
ALTER TABLE "ledger" ADD CONSTRAINT "ledger_case_id_kind_unique" UNIQUE("case_id","kind");