// price-streamer/streamer.js
const { createClient } = require('redis');
const path = require('path');
const db = require('./db');

const binanceWatcher = require('./watchers/binance');
const bybitWatcher = require('./watchers/bybit');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

console.log('Starting Dynamic Multi-Exchange Streamer...');

const RECONCILE_INTERVAL = 15000; // 15 seconds
let activeState = {};

// --- NEW: Exchange-specific stablecoin configuration ---
const SUPPORTED_STABLES_BY_EXCHANGE = {
    'binance': ['USDT', 'USDC', 'TUSD', 'FDUSD'],
    'bybit': ['USDT', 'USDC'], // Bybit primarily uses USDT and USDC
    'kucoin': ['USDT'],
    'okx': ['USDT'],
    'mexc': ['USDT'],
    'bitget': ['USDT'],
};

async function getAlertsByExchange() {
    const query = `
      SELECT DISTINCT exchange, base_currency, quote_currency FROM alerts 
      WHERE status = 'active' AND alert_type = 'PRICE';
    `;
    const result = await db.query(query);

    const alertsByExchange = result.rows.reduce((acc, alert) => {
      const exchange = alert.exchange.toLowerCase();
      if (!acc[exchange]) acc[exchange] = new Set();
      
      if (alert.quote_currency === 'USD_STABLES') {
        // --- THE FIX ---
        // Use the specific stablecoin list for the given exchange
        const stablesForThisExchange = SUPPORTED_STABLES_BY_EXCHANGE[exchange] || ['USDT']; // Default to USDT
        for (const stable of stablesForThisExchange) {
            const pair = `${alert.base_currency}/${stable}`;
            acc[exchange].add(pair);
        }
      } else if (alert.base_currency && alert.quote_currency) {
        const pair = `${alert.base_currency}/${alert.quote_currency}`;
        acc[exchange].add(pair);
      }
      return acc;
    }, {});
    
    for (const exchange in alertsByExchange) {
        alertsByExchange[exchange] = Array.from(alertsByExchange[exchange]).sort();
    }
    return alertsByExchange;
}

async function reconcile() {
    console.log('---');
    console.log('Reconciling active alerts...');
    try {
        const newState = await getAlertsByExchange();
        if (JSON.stringify(newState) !== JSON.stringify(activeState)) {
            console.log('Change in alerts detected. Restarting service to apply changes...');
            process.exit(0);
        } else {
            console.log('No changes in alerts. Continuing...');
        }
    } catch (error) {
        console.error('Error during reconciliation:', error);
    }
}

async function start() {
    const redisClient = createClient({ url: process.env.UPSTASH_REDIS_TCP_URL || 'redis://redis:6379' });
    redisClient.on('error', (err) => console.error('Redis Client Error', err));
    await redisClient.connect();
    console.log('Redis client initialized.');

    activeState = await getAlertsByExchange();
    console.log('Found initial active alerts for:', Object.keys(activeState));

    if (activeState.binance) {
      binanceWatcher.connect(activeState.binance, redisClient);
    }
    if (activeState.bybit) {
      bybitWatcher.connect(activeState.bybit, redisClient);
    }

    setInterval(reconcile, RECONCILE_INTERVAL);
}

start().catch(console.error);