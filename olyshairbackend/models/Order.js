// models/Order.js
const db = require("../db");

// Create a new order
async function createOrder({ user_id, total_amount, status, shipping_address_id, tracking_number }) {
  const result = await db.query(
    `INSERT INTO orders (user_id, total_amount, status, shipping_address_id, tracking_number)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [user_id, total_amount, status, shipping_address_id, tracking_number]
  );
  return result.rows[0];
}

// Get all orders
async function getOrders() {
  const result = await db.query(`SELECT * FROM orders WHERE is_deleted = FALSE ORDER BY order_date DESC`);
  return result.rows;
}

// Get an order by ID
async function getOrderById(order_id) {
  const result = await db.query(`SELECT * FROM orders WHERE order_id = $1 AND is_deleted = FALSE`, [order_id]);
  return result.rows[0];
}

// Update an order (e.g., status or tracking number)
async function updateOrder(order_id, fields) {
  const setQuery = Object.keys(fields)
    .map((key, i) => `${key} = $${i + 2}`)
    .join(", ");

  const values = [order_id, ...Object.values(fields)];

  const result = await db.query(
    `UPDATE orders SET ${setQuery} WHERE order_id = $1 RETURNING *`,
    values
  );
  return result.rows[0];
}

// Soft delete an order
async function deleteOrder(order_id) {
  const result = await db.query(
    `UPDATE orders SET is_deleted = TRUE WHERE order_id = $1 RETURNING *`,
    [order_id]
  );
  return result.rows[0];
}

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  updateOrder,
  deleteOrder,
};
