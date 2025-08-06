// price-streamer/watchers/bybit.js
const WebSocket = require('ws');

const BYBIT_WSS_URL = 'wss://stream.bybit.com/v5/public/spot';

function connect(pairs, redisClient) {
    console.log(`[Bybit] Connecting to WebSocket...`);
    const ws = new WebSocket(BYBIT_WSS_URL);

    ws.on('open', () => {
        console.log('✅ [Bybit] Connected to WebSocket.');

        // Bybit requires a subscription message with specific formatting
        const args = pairs.map(p => `tickers.${p.replace('/', '')}`);
        ws.send(JSON.stringify({
            op: "subscribe",
            args: args
        }));
    });

    ws.on('message', async (data) => {
        const message = JSON.parse(data.toString());
        // Check if it's a valid ticker update
        if (message.topic && message.topic.startsWith('tickers') && message.data) {
            const tickerData = message.data;
            const pair = tickerData.symbol; // e.g., "BTCUSDT"
            const price = parseFloat(tickerData.lastPrice);

            if (price) {
                const payload = JSON.stringify({ exchange: 'bybit', pair, price });
                await redisClient.publish('price-updates', payload);
            }
        }
    });

    // Bybit requires sending a ping every 20 seconds
    const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ op: "ping" }));
        }
    }, 20000);

    ws.on('close', () => {
        console.log('❌ [Bybit] Disconnected. Reconnecting in 10 seconds...');
        clearInterval(pingInterval);
        setTimeout(() => connect(pairs, redisClient), 10000);
    });

    ws.on('error', (err) => {
        console.error('[Bybit] WebSocket Error:', err.message);
        ws.close();
    });
}

module.exports = { connect };