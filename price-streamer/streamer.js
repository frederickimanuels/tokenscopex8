// streamer.js
const WebSocket = require('ws');
const { Redis } = require('@upstash/redis');
const path = require('path');

// Load .env file from the root directory
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

console.log('Starting price streamer...');

// 1. Initialize Redis Client
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
console.log('Redis client initialized.');

// 2. Define the list of pairs to watch.
// In the future, this list will be dynamically fetched from our PostgreSQL database.
const pairs = ['btcusdt', 'ethusdt', 'gasusdt', 'solusdt'];
const streams = pairs.map(p => `${p}@ticker`).join('/');
const binanceWsUrl = `wss://stream.binance.com:9443/ws/${streams}`;

const REDIS_CHANNEL = 'price-updates';

// 3. Create the main connection function
function connectToBinance() {
  console.log('Connecting to Binance WebSocket...');
  const ws = new WebSocket(binanceWsUrl);

  ws.on('open', () => {
    console.log('✅ Connected to Binance WebSocket.');
  });

  ws.on('message', async (data) => {
    const message = JSON.parse(data.toString());

    // Check if it's a valid ticker message with a price
    if (message.e === '24hrTicker' && message.c) {
      const pair = message.s; // e.g., "BTCUSDT"
      const price = parseFloat(message.c); // Last price

      const payload = JSON.stringify({ pair, price });

      try {
        // Publish the price update to the Redis channel
        await redis.publish(REDIS_CHANNEL, payload);
        // console.log(`Published ${pair}: ${price} to Redis.`); // Uncomment for verbose logging
      } catch (error) {
        console.error('Error publishing to Redis:', error);
      }
    }
  });

  ws.on('close', () => {
    console.log('❌ Disconnected from Binance WebSocket. Reconnecting in 5 seconds...');
    setTimeout(connectToBinance, 5000); // Attempt to reconnect after 5 seconds
  });

  ws.on('error', (error) => {
    console.error('WebSocket Error:', error);
    ws.close(); // This will trigger the 'close' event and the reconnect logic
  });
}

// Start the connection
connectToBinance();