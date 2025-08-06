// listener.js
const { createClient } = require('redis');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const REDIS_CHANNEL = 'price-updates';

async function main() {
  const redisTcpUrl = "redis://localhost:6002";
  if (!redisTcpUrl) {
    console.error('Error: UPSTASH_REDIS_TCP_URL not found in .env file.');
    return;
  }

  console.log('Connecting to Redis via TCP...');

  // Create a Redis client using the TCP URL
  const subscriber = createClient({
    url: redisTcpUrl,
  });

  subscriber.on('error', (err) => {
    console.error('Redis subscriber error:', err);
  });

  await subscriber.connect();
  console.log('✅ Connected to Redis. Waiting for price updates...');

  // Subscribe to the channel. The callback function will execute for each message.
  await subscriber.subscribe(REDIS_CHANNEL, (message, channel) => {
    console.log(`Received from channel '${channel}':`, message);
  });
}

main();