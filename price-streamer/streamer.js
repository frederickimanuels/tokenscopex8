// streamer.js - FINAL PARSER FIX
const WebSocket = require('ws');
const { Redis } = require('@upstash/redis');
const path = require('path');
const db = require('./db');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

console.log('Starting Advanced Smart Streamer...');

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});
console.log('Redis client initialized.');

const REDIS_CHANNEL = 'price-updates';
const IDLE_RECHECK_INTERVAL = 30000;

const USD_STABLES_GROUP = ['USDT', 'USDC', 'TUSD', 'FDUSD'];

function connect(streams) {
  if (streams.length === 0) {
    console.log(`No active Binance alerts found. Re-checking database in ${IDLE_RECHECK_INTERVAL / 1000} seconds...`);
    setTimeout(runStreamer, IDLE_RECHECK_INTERVAL);
    return;
  }

  const binanceWsUrl = `wss://stream.binance.com:9443/ws/${streams.join('/')}`;
  console.log(`Connecting to Binance combined stream for ${streams.length} pairs...`);
  const ws = new WebSocket(binanceWsUrl);

  ws.on('open', () => console.log('✅ Connected to Binance WebSocket.'));

  ws.on('message', async (data) => {
    try {
      // --- CORRECTED PARSER ---
      // We parse the message directly and do NOT look for a .data wrapper.
      const message = JSON.parse(data.toString());
      
      if (message && message.e === '24hrTicker' && message.s && message.c) {
        const pair = message.s;
        const price = parseFloat(message.c);
        const payload = JSON.stringify({ pair, price });
        await redis.publish(REDIS_CHANNEL, payload);
      }
    } catch (e) { 
      console.error('Error processing message:', e); 
    }
  });

  ws.on('ping', () => ws.pong());

  ws.on('close', () => {
    console.log('❌ Disconnected from Binance. Will refetch pairs and reconnect in 10 seconds...');
    setTimeout(runStreamer, 10000);
  });

  ws.on('error', (error) => {
    console.error('WebSocket Error:', error.message);
    ws.close();
  });
}

async function runStreamer() {
  console.log('Fetching active price alerts from database...');
  try {
    const query = `
      SELECT base_currency, quote_currency, exchange FROM alerts 
      WHERE status = 'active' 
        AND alert_type = 'PRICE'
        AND exchange = 'Binance'; 
    `;
    const result = await db.query(query);

    const streamsToWatch = new Set(); 

    for (const alert of result.rows) {
      if (alert.quote_currency === 'USD_STABLES') {
        for (const stablecoin of USD_STABLES_GROUP) {
          const streamName = `${alert.base_currency.toLowerCase()}${stablecoin.toLowerCase()}@ticker`;
          streamsToWatch.add(streamName);
        }
      } else if (alert.base_currency && alert.quote_currency) {
        const streamName = `${alert.base_currency.toLowerCase()}${alert.quote_currency.toLowerCase()}@ticker`;
        streamsToWatch.add(streamName);
      }
    }
    
    connect(Array.from(streamsToWatch));

  } catch (error) {
    console.error('Error fetching pairs from database:', error);
    setTimeout(runStreamer, 10000);
  }
}

runStreamer();