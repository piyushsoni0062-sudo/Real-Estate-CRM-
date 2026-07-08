-- Replace the budgetMin/budgetMax range with a single "budget" amount,
-- and add a free-text "propertySize" (e.g. "100 gaj", "2000 sq.ft.").
ALTER TABLE "Lead" ADD COLUMN "budget" DECIMAL(14,2);
ALTER TABLE "Lead" ADD COLUMN "propertySize" TEXT;

-- Preserve existing data: use the max of the old range as the budget.
UPDATE "Lead" SET "budget" = COALESCE("budgetMax", "budgetMin");

ALTER TABLE "Lead" DROP COLUMN "budgetMin";
ALTER TABLE "Lead" DROP COLUMN "budgetMax";
