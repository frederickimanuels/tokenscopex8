// streamer.js
const WebSocket = require('ws');
const { createClient } = require('redis');
const path = require('path');
const db = require('./db');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

console.log('Starting Dynamic Smart Streamer...');

let redisClient;
let currentWs = null;
let activeStreams = [];
const RECONCILE_INTERVAL = 15000; // Check for new alerts every 1 minute

const REDIS_CHANNEL = 'price-updates';
const USD_STABLES_GROUP = ['USDT', 'USDC', 'TUSD', 'FDUSD'];

function connect() {
  if (activeStreams.length === 0) {
    console.log('Stream list is empty. Streamer is idle.');
    return;
  }
  
  const binanceWsUrl = `wss://stream.binance.com:9443/ws/${activeStreams.join('/')}`;
  console.log(`Connecting to Binance for ${activeStreams.length} streams...`);
  currentWs = new WebSocket(binanceWsUrl);

  currentWs.on('open', () => console.log('✅ Connected to Binance WebSocket.'));

  currentWs.on('message', async (data) => {
    try {
      // --- FINAL CORRECTED PARSER ---
      // We parse the message directly and do NOT look for a .data wrapper.
      const message = JSON.parse(data.toString());
      
      if (message && message.e === '24hrTicker' && message.s && message.c) {
        const pair = message.s;
        const price = parseFloat(message.c);
        const payload = JSON.stringify({ pair, price });
        await redisClient.publish(REDIS_CHANNEL, payload);
      }
    } catch (e) { 
      console.error('Error processing message:', e); 
    }
  });

  currentWs.on('ping', () => currentWs.pong());
  
  currentWs.on('close', () => console.log('❌ WebSocket connection closed. Reconciliation will run shortly.'));
  
  currentWs.on('error', (error) => {
    console.error('WebSocket Error:', error.message);
    if (currentWs) currentWs.close();
  });
}

async function reconcileStreams() {
  console.log('---');
  console.log('Reconciling streams...');
  try {
    const query = `
      SELECT base_currency, quote_currency FROM alerts 
      WHERE status = 'active' AND alert_type = 'PRICE' AND exchange = 'Binance';
    `;
    const result = await db.query(query);

    const newStreamsSet = new Set();
    for (const alert of result.rows) {
      if (alert.quote_currency === 'USD_STABLES') {
        for (const stable of USD_STABLES_GROUP) {
          newStreamsSet.add(`${alert.base_currency.toLowerCase()}${stable.toLowerCase()}@ticker`);
        }
      } else if (alert.base_currency && alert.quote_currency) {
        newStreamsSet.add(`${alert.base_currency.toLowerCase()}${alert.quote_currency.toLowerCase()}@ticker`);
      }
    }
    
    const newStreams = Array.from(newStreamsSet).sort();
    const sortedActiveStreams = [...activeStreams].sort();

    if (JSON.stringify(newStreams) !== JSON.stringify(sortedActiveStreams)) {
      console.log('Change in active alerts detected. Reconfiguring connection...');
      activeStreams = newStreams;
      
      if (currentWs && currentWs.readyState === WebSocket.OPEN) {
        currentWs.close();
      }
      
      setTimeout(connect, 1000); 
    } else {
      console.log('No changes in active alerts. Continuing to watch.');
    }
  } catch (error) {
    console.error('Error during stream reconciliation:', error);
  }
}

async function start() {
    redisClient = createClient({ url: process.env.UPSTASH_REDIS_TCP_URL });
    redisClient.on('error', (err) => console.error('Redis Client Error', err));
    await redisClient.connect();
    console.log('Redis client initialized.');

    setInterval(reconcileStreams, RECONCILE_INTERVAL);
    reconcileStreams();
}

start();