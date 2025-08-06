// metric-poller/poller.js
const { Client, GatewayIntentBits } = require('discord.js');
const fetch = require('node-fetch');
const db = require('./db');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const COINGECKO_GLOBAL_URL = 'https://api.coingecko.com/api/v3/global?x_cg_demo_api_key=CG-XwTpwP9MCXxiVKqpd3PS4GAo';
// We will poll every 5 minutes (300,000 milliseconds).
// This is a respectful rate for a free public API.
const POLLING_INTERVAL = 300000; // 5 minutes

// This is the main function that does the work.
async function pollMetrics(discordClient) {
  console.log('Polling for metric data...');
  try {
    // 1. Fetch data from CoinGecko
    const response = await fetch(COINGECKO_GLOBAL_URL);
    if (!response.ok) {
      console.error(`CoinGecko API Error: ${response.statusText}`);
      return;
    }
    const globalData = await response.json();
    const btcDominance = globalData.data.market_cap_percentage.btc;

    console.log(`Current BTC Dominance: ${btcDominance.toFixed(2)}%`);

    // 2. Check for triggered alerts in our database
    const query = `
      SELECT * FROM alerts
      WHERE status = 'active'
        AND alert_type = 'METRIC'
        AND metric_name = 'BTC_DOMINANCE'
        AND (
          (trigger_condition = 'ABOVE' AND target_price <= $1) OR
          (trigger_condition = 'BELOW' AND target_price >= $1)
        );
    `;
    const result = await db.query(query, [btcDominance]);

    if (result.rows.length === 0) {
      return; // No alerts triggered
    }

    // 3. Process triggered alerts
    for (const alert of result.rows) {
      console.log(`TRIGGERED: BTC Dominance alert ID ${alert.id}`);
      await db.query(`UPDATE alerts SET status = 'triggered' WHERE id = $1`, [alert.id]);
      
      const channel = await discordClient.channels.fetch(alert.channel_id);
      if (!channel) continue;

      let alertMessage = `📈 **Metric Alert!** 📈\n<@${alert.user_id}>, your alert for **Bitcoin Dominance** was triggered!`;
      alertMessage += `\n**Current Dominance:** \`${btcDominance.toFixed(2)}%\``;
      if (alert.mention_role_id) {
        alertMessage += ` <@&${alert.mention_role_id}>`;
      }
      await channel.send(alertMessage);
    }

  } catch (error) {
    console.error('An error occurred during polling:', error);
  }
}

// Main function to start the service
async function start() {
  console.log('Metric Poller connecting to Discord...');
  const discordClient = new Client({ intents: [GatewayIntentBits.Guilds] });
  await discordClient.login(process.env.DISCORD_TOKEN);
  console.log(`✅ Metric Poller logged in as ${discordClient.user.tag}`);

  // Run the poll function once immediately on startup
  pollMetrics(discordClient);

  // Then, run it on a schedule
  setInterval(() => pollMetrics(discordClient), POLLING_INTERVAL);
  console.log(`🚀 Metric Poller is running. Will check every ${POLLING_INTERVAL / 1000} seconds.`);
}

start();