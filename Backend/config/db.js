// config/db.js
const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT, 10) || 5432,
  database: process.env.DB_NAME || 'RmsDb',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD,
});

pool.on('connect', () => {
  console.log(' Connected to PostgreSQL (RmsDb)');
});

pool.on('error', (err) => {
  console.error(' Unexpected PostgreSQL error:', err);
  process.exit(-1);
});

module.exports = pool;