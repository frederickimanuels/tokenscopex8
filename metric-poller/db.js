// db.js
const { Pool } = require('pg');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

// Create a new pool instance using the connection string from our .env file
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// We export a query function that will be used throughout our application
module.exports = {
  query: (text, params) => pool.query(text, params),
};