-- AlterTable: make name nullable on user_purchase_discounts
ALTER TABLE "user_purchase_discounts" ALTER COLUMN "name" DROP NOT NULL;
