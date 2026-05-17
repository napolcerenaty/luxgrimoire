-- Add subscriberBasePrice to sale_announcements
ALTER TABLE sale_announcements ADD COLUMN subscriber_base_price DECIMAL(10,2) NULL;

-- Add subscriberBasePrice to sale_announcement_regions
ALTER TABLE sale_announcement_regions ADD COLUMN subscriber_base_price DECIMAL(10,2) NULL;

-- Add selectedPrice + selectedPriceCurrency to user_sale_interests
ALTER TABLE user_sale_interests ADD COLUMN selected_price DECIMAL(10,2) NULL;
ALTER TABLE user_sale_interests ADD COLUMN selected_price_currency VARCHAR(3) NULL;
