// rest-poller/poller.js
const ccxt = require('ccxt');
const { createClient } = require('redis');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

console.log('Starting REST Poller service...');

const redisClient = createClient({ url: process.env.UPSTASH_REDIS_TCP_URL });
redisClient.on('error', (err) => console.error('Redis Client Error', err));
redisClient.connect();
console.log('Redis client initialized.');

// We publish to the SAME channel as the WebSocket streamer
const REDIS_CHANNEL = 'price-updates';
// Poll every 10 seconds (10,000 milliseconds)
const POLLING_INTERVAL = 10000;

// --- Configuration for exchanges to be polled ---
const exchangesToPoll = {
  kucoin: ['KCS/USDT', 'LUNC/USDT'],
  // In the future, you can add more exchanges and pairs here
  // bitget: ['BGB/USDT'],
};

async function pollPrices() {
  for (const exchangeId in exchangesToPoll) {
    try {
      const exchange = new ccxt[exchangeId](); // Dynamically create the exchange client
      const symbols = exchangesToPoll[exchangeId];
      
      console.log(`Polling ${exchange.id} for symbols: ${symbols.join(', ')}`);

      // fetchTickers is the unified CCXT method for getting multiple prices
      const tickers = await exchange.fetchTickers(symbols);

      for (const symbol in tickers) {
        const ticker = tickers[symbol];
        const pair = ticker.symbol.replace('/', ''); // "KCS/USDT" -> "KCSUSDT"
        const price = ticker.last;

        if (price) {
          const payload = JSON.stringify({ exchange: exchangeId, pair, price });
          await redisClient.publish(REDIS_CHANNEL, payload);
          console.log(`  > Published ${exchange.id} ${pair}: ${price}`);
        }
      }
    } catch (e) {
      console.error(`Error polling ${exchangeId}:`, e.message);
    }
  }
}

// Run the poller on a schedule
setInterval(pollPrices, POLLING_INTERVAL);
// Run once immediately on startup
pollPrices();