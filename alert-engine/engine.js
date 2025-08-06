// alert-engine/engine.js
const { createClient: createRedisClient } = require('redis');
const { Client, GatewayIntentBits } = require('discord.js');
const db = require('./db');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const REDIS_CHANNEL = 'price-updates';
const USD_STABLES_GROUP = ['USDT', 'USDC', 'TUSD', 'FDUSD'];

async function main() {
  const discordClient = new Client({ intents: [GatewayIntentBits.Guilds] });
  await discordClient.login(process.env.DISCORD_TOKEN);
  console.log(`✅ Engine logged in to Discord as ${discordClient.user.tag}`);

  // We now create two clients: one for standard commands (SET) and one for subscribing (SUBSCRIBE)
  const redisClient = createRedisClient({ url: process.env.UPSTASH_REDIS_TCP_URL });
  redisClient.on('error', (err) => console.error('Redis Client Error', err));
  await redisClient.connect();
  console.log('✅ Engine connected to Redis (standard client).');
  
  const subscriber = redisClient.duplicate();
  await subscriber.connect();
  console.log('✅ Engine connected to Redis (subscriber client).');

  await subscriber.subscribe(REDIS_CHANNEL, async (message) => {
    const { pair, price } = JSON.parse(message);

    try {
      // --- NEW CACHING LOGIC ---
      // Set the latest price in Redis with a 5-minute (300 seconds) expiry.
      await redisClient.set(`price:${pair}`, price, { EX: 300 });

      // --- Alert checking logic (unchanged) ---
      let baseCurrency = null;
      let quoteCurrency = null;
      for (const stable of USD_STABLES_GROUP) {
        if (pair.endsWith(stable)) {
          baseCurrency = pair.substring(0, pair.length - stable.length);
          quoteCurrency = stable;
          break;
        }
      }
      if (!baseCurrency) return;

      const query = `
        SELECT * FROM alerts
        WHERE status = 'active' AND alert_type = 'PRICE' AND base_currency = $1
          AND (quote_currency = $2 OR quote_currency = 'USD_STABLES')
          AND ((trigger_condition = 'ABOVE' AND target_price <= $3) OR (trigger_condition = 'BELOW' AND target_price >= $3));
      `;
      const result = await db.query(query, [baseCurrency, quoteCurrency, price]);

      for (const alert of result.rows) {
        const alertIdentifier = alert.quote_currency === 'USD_STABLES' ? alert.base_currency : `${alert.base_currency}/${alert.quote_currency}`;
        console.log(`TRIGGERED: Alert ID ${alert.id} for ${alertIdentifier}`);

        await db.query(`UPDATE alerts SET status = 'triggered' WHERE id = $1`, [alert.id]);

        const channel = await discordClient.channels.fetch(alert.channel_id);
        if (!channel) continue;

        let alertMessage = `🔔 **Price Alert!** 🔔\n<@${alert.user_id}>, your alert for **${alertIdentifier}** was triggered!`;
        alertMessage += `\n**Current Price (${pair}):** \`$${price}\``;

        if (alert.mention_role_id) {
          alertMessage += ` <@&${alert.mention_role_id}>`;
        }
        await channel.send(alertMessage);
      }
    } catch (err) {
      console.error(`Error processing alert for ${pair}:`, err);
    }
  });

  console.log('🚀 Alert Engine is running and listening for prices.');
}

main();