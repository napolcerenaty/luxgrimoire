const {PrismaClient} = require('@prisma/client');
const p = new PrismaClient();
p.$queryRawUnsafe(`
  SELECT usss.*, s.slug
  FROM user_subscription_skip_states usss
  JOIN subscriptions s ON s.id = usss."subscriptionId"
  WHERE usss."userId" = (SELECT id FROM users WHERE username = 'testuser1')
`).then(r => { console.log(JSON.stringify(r, null, 2)); p.$disconnect(); }).catch(e => { console.error(e.message); p.$disconnect(); });
