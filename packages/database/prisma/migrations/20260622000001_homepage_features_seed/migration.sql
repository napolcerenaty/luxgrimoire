INSERT INTO "homepage_features" ("id", "title", "description", "iconName", "ctaLabel", "ctaHref", "sortOrder", "isActive")
VALUES
  (gen_random_uuid(), 'Track Your Collection',    'Add editions, track ownership status (owned, preorder, shipping), condition and reading status — all in one place.',              'BookOpen',  'Start tracking free', '/register', 0, true),
  (gen_random_uuid(), 'Sale Alerts',              'Get notified before First Access, Early Access and General Sale windows close — never miss a drop again.',                       'Bell',      'Set up alerts',       '/register', 1, true),
  (gen_random_uuid(), 'Spending Statistics',      'See exactly how much you spend per month and per year across subscriptions and purchases. Know your collection inside out.',     'BarChart2', 'See your stats',      '/register', 2, true)
ON CONFLICT DO NOTHING;
