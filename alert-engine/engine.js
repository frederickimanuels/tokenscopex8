// alert-engine/engine.js - FINAL DEX INTEGRATION
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
      // --- Universal Caching Logic ---
      await redisClient.set(`price:${pair}`, price, { EX: 300 });

      // --- Universal Alert Processing Logic ---
      let baseCurrency = null;
      let quoteCurrency = null;
      let exchange = null; // We will determine the exchange from the pair format

      if (pair.includes('_UNISWAP')) {
        // Handle DEX pairs (e.g., "WETHUSDC_UNISWAP")
        exchange = 'Uniswap_V3';
        // This is a simple parser; a more robust one could be made for other pairs
        if (pair === 'WETHUSDC_UNISWAP') {
            baseCurrency = 'WETH';
            quoteCurrency = 'USDC';
        }
      } else {
        // Handle CEX pairs (e.g., "BTCUSDT")
        for (const stable of USD_STABLES_GROUP) {
          if (pair.endsWith(stable)) {
            baseCurrency = pair.substring(0, pair.length - stable.length);
            quoteCurrency = stable;
            break;
          }
        }
      }

      if (!baseCurrency) return; // Skip if we couldn't parse the pair

      const query = `
        SELECT * FROM alerts
        WHERE status = 'active'
          AND alert_type = 'PRICE'
          AND base_currency = $1
          AND ( (exchange = $2) OR (quote_currency = $3 OR quote_currency = 'USD_STABLES') )
          AND (
            (trigger_condition = 'ABOVE' AND target_price <= $4) OR
            (trigger_condition = 'BELOW' AND target_price >= $4)
          );
      `;
      // Note: The logic for generalized CEX alerts vs specific DEX alerts is handled here.
      // A specific DEX alert will match `exchange = 'Uniswap_V3'`.
      // A CEX alert will match the `quote_currency` check.
      const result = await db.query(query, [baseCurrency, exchange, quoteCurrency, price]);

      for (const alert of result.rows) {
        const alertIdentifier = alert.quote_currency === 'USD_STABLES' ? alert.base_currency : `${alert.base_currency}/${alert.quote_currency}`;
        console.log(`TRIGGERED: Alert ID ${alert.id} for ${alertIdentifier} on ${alert.exchange}`);

        await db.query(`UPDATE alerts SET status = 'triggered' WHERE id = $1`, [alert.id]);

        const channel = await discordClient.channels.fetch(alert.channel_id);
        if (!channel) continue;

        let alertMessage = `🔔 **Price Alert!** 🔔\n<@${alert.user_id}>, your alert for **${alertIdentifier}** on **${alert.exchange}** was triggered!`;
        alertMessage += `\n**Current Price (${pair}):** \`$${price}\``;

        if (alert.mention_role_id) {
          // If we stored the literal '@everyone', use it directly.
          // Otherwise, format it as a standard role mention.
          const mention = alert.mention_role_id === '@everyone' 
            ? '@everyone' 
            : `<@&${alert.mention_role_id}>`;
          alertMessage += ` ${mention}`;
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