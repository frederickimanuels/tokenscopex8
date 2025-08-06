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

  const redisClient = createRedisClient({ url: process.env.UPSTASH_REDIS_TCP_URL || 'redis://redis:6379' });
  redisClient.on('error', (err) => console.error('Redis Client Error', err));
  await redisClient.connect();
  console.log('✅ Engine connected to Redis (standard client).');
  
  const subscriber = redisClient.duplicate();
  await subscriber.connect();
  console.log('✅ Engine connected to Redis (subscriber client).');

  await subscriber.subscribe(REDIS_CHANNEL, async (message) => {
    // --- 1. DESTRUCTURE THE NEW EXCHANGE-AWARE PAYLOAD ---
    const { exchange, pair, price } = JSON.parse(message);
    if (!exchange || !pair || price === undefined) return;

    try {
      // --- 2. UPDATE THE CACHE KEY TO BE EXCHANGE-SPECIFIC ---
      await redisClient.set(`price:${exchange}:${pair}`, price, { EX: 300 });

      let baseCurrency = null;
      let quoteCurrency = null;

      // This logic parses both CEX and DEX pairs based on format
      if (pair.includes('_UNISWAP')) {
        if (pair === 'WETHUSDC_UNISWAP') {
            baseCurrency = 'WETH';
            quoteCurrency = 'USDC';
        }
      } else { // CEX Pair Parsing
        for (const stable of USD_STABLES_GROUP) {
          if (pair.endsWith(stable)) {
            baseCurrency = pair.substring(0, pair.length - stable.length);
            quoteCurrency = stable;
            break;
          }
        }
      }

      if (!baseCurrency) return;

      // --- 3. THE CORRECTED, SIMPLER SQL QUERY ---
      // This query now filters by the specific exchange from the message.
      const query = `
        SELECT * FROM alerts
        WHERE status = 'active'
          AND alert_type = 'PRICE'
          AND exchange = $1
          AND base_currency = $2
          AND (quote_currency = $3 OR quote_currency = 'USD_STABLES')
          AND (
            (trigger_condition = 'ABOVE' AND target_price <= $4) OR
            (trigger_condition = 'BELOW' AND target_price >= $4)
          );
      `;
      const result = await db.query(query, [exchange, baseCurrency, quoteCurrency, price]);

      if (result.rows.length === 0) return;

      for (const alert of result.rows) {
        const alertIdentifier = alert.quote_currency === 'USD_STABLES' ? alert.base_currency : `${alert.base_currency}/${alert.quote_currency}`;
        console.log(`TRIGGERED: Alert ID ${alert.id} for ${alertIdentifier} on ${alert.exchange}`);

        await db.query(`UPDATE alerts SET status = 'triggered' WHERE id = $1`, [alert.id]);

        const channel = await discordClient.channels.fetch(alert.channel_id);
        if (!channel) continue;

        let alertMessage = `🔔 **Price Alert!** 🔔\n<@${alert.user_id}>, your alert for **${alertIdentifier}** on **${alert.exchange}** was triggered!`;
        alertMessage += `\n**Current Price (${pair}):** \`$${price}\``;

        if (alert.mention_role_id) {
          const mention = alert.mention_role_id === '@everyone' ? '@everyone' : `<@&${alert.mention_role_id}>`;
          alertMessage += ` ${mention}`;
        }
        await channel.send(alertMessage);
      }
    } catch (err) {
      console.error(`Error processing alert for ${exchange}:${pair}:`, err);
    }
  });

  console.log('🚀 Alert Engine is running and listening for prices.');
}

main().catch(console.error);