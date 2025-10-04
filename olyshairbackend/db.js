const { Pool } = require("pg");
require("dotenv").config({path: "./olyshair.env"});

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Simple test to ensure the connection is working
pool.on("connect", () => {
  console.log("Successfully connected to the PostgreSQL database");
});

pool.on("error", (err) => {
  console.error("Unexpected error on idle client", err);
  process.exit(-1);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool, // export the pool for transactions if needed
};
