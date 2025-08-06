// dex-poller/poller.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { ethers } = require('ethers');
const { Token } = require('@uniswap/sdk-core');
const { Pool } = require('@uniswap/v3-sdk');
const IUniswapV3PoolABI = require('@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json').abi;
const { Redis } = require('@upstash/redis');

// --- Configuration ---
const RPC_URL = process.env.INFURA_RPC_URL;
const REDIS_CHANNEL = 'price-updates';
const POLLING_INTERVAL = 120000; // 2 minutes

// --- Ethereum Mainnet Addresses ---
const WETH_ADDRESS = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const WETH_USDC_POOL_ADDRESS = '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640'; // Uniswap V3 0.05% fee tier

// --- Initialization ---
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

const WETH_TOKEN = new Token(1, WETH_ADDRESS, 18, 'WETH', 'Wrapped Ether');
const USDC_TOKEN = new Token(1, USDC_ADDRESS, 6, 'USDC', 'USD Coin');

async function pollDexPrice() {
    try {
        console.log('Polling Uniswap V3 for WETH/USDC price...');
        const poolContract = new ethers.Contract(WETH_USDC_POOL_ADDRESS, IUniswapV3PoolABI, provider);

        // Get the state of the liquidity pool
        const [slot0, liquidity] = await Promise.all([
            poolContract.slot0(),
            poolContract.liquidity(),
        ]);

        // Create a Pool instance from the on-chain data
        const pool = new Pool(
            WETH_TOKEN,
            USDC_TOKEN,
            500, // 0.05% fee tier
            slot0.sqrtPriceX96.toString(),
            liquidity.toString(),
            slot0.tick
        );

        const price = parseFloat(pool.token0Price.toSignificant(6)); // Price of WETH in USDC
        const pair = 'WETHUSDC_UNISWAP'; // Our custom identifier
        
        console.log(`  > Current Price: 1 WETH = ${price} USDC`);
        
        // Publish to the same Redis channel as our other services
        const payload = JSON.stringify({ pair, price });
        await redis.publish(REDIS_CHANNEL, payload);
        console.log(`  > Published ${pair}: ${price} to Redis.`);

    } catch (error) {
        console.error('Error polling DEX price:', error.message);
    }
}

console.log('Starting DEX Poller service...');
// Run once on startup
pollDexPrice();
// Then run on a schedule
setInterval(pollDexPrice, POLLING_INTERVAL);