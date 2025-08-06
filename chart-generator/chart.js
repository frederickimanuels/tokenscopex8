// chart-generator/chart.js
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const ccxt = require('ccxt');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

const PORT = process.env.CHART_PORT || 3000; // You can add CHART_PORT=3000 to your .env

app.post('/generate', async (req, res) => {
    const { exchangeId, coin, quote, timeframe = '1d' } = req.body;
    if (!exchangeId || !coin || !quote) {
        return res.status(400).json({ error: 'Missing required parameters.' });
    }

    try {
        const exchange = new ccxt[exchangeId]();
        const symbol = `${coin.toUpperCase()}/${quote.toUpperCase()}`;

        // 1. Fetch historical data from the exchange using CCXT
        const ohlcv = await exchange.fetchOHLCV(symbol, timeframe, undefined, 90); // Get last 90 candles
        if (ohlcv.length === 0) {
            return res.status(404).json({ error: 'No chart data found for this pair.' });
        }

        // 2. Format the data for QuickChart.io
        const labels = ohlcv.map(candle => new Date(candle[0]).toLocaleDateString());
        const dataPoints = ohlcv.map(candle => candle[4]); // Use the 'close' price

        const chartConfig = {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: `${symbol} Price`,
                    data: dataPoints,
                    fill: false,
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                }]
            }
        };

        // 3. Send data to QuickChart API to get an image URL
        const quickChartResponse = await fetch('https://quickchart.io/chart/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chart: chartConfig, format: 'png' })
        });

        const { url } = await quickChartResponse.json();
        res.json({ chartUrl: url });

    } catch (error) {
        console.error('Chart generation error:', error);
        res.status(500).json({ error: 'Failed to generate chart.' });
    }
});

app.listen(PORT, () => {
    console.log(`✅ Chart Generator service listening on port ${PORT}`);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Application specific logging, throwing an error, or other logic here
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception thrown:', error);
  process.exit(1);
});

process.on('exit', (code) => {
  console.log(`Chart Generator is exiting with code: ${code}`);
});