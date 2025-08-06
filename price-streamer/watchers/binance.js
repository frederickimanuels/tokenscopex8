// price-streamer/watchers/binance.js
const WebSocket = require('ws');

function connect(pairs, redisClient) {
    const streams = pairs.map(p => `${p.replace('/', '').toLowerCase()}@ticker`);
    const wsUrl = `wss://stream.binance.com:9443/ws/${streams.join('/')}`;
    
    console.log(`[Binance] Connecting to WebSocket for ${streams.length} streams...`);
    const ws = new WebSocket(wsUrl);

    ws.on('open', () => console.log('✅ [Binance] Connected to WebSocket.'));

    ws.on('message', async (data) => {
        try {
          const message = JSON.parse(data.toString());
      
          if (message && message.e === '24hrTicker' && message.s && message.c) {
            const pair = message.s;
            const price = parseFloat(message.c);
            const payload = JSON.stringify({ exchange: 'binance', pair, price });
            await redisClient.publish('price-updates', payload);
          }
        } catch (e) { 
            console.error('[Binance] Error processing message:', e); 
        }
    });

    ws.on('ping', () => ws.pong());
    ws.on('close', () => {
        console.log('❌ [Binance] Disconnected. Reconnecting in 10 seconds...');
        setTimeout(() => connect(pairs, redisClient), 10000);
    });
    ws.on('error', (error) => {
        console.error('[Binance] WebSocket Error:', error.message);
        ws.close();
    });
}

module.exports = { connect };