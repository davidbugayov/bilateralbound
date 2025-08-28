// Legacy server.js - now delegates to modular server
const BilateralBoundServer = require('./src/server');

// Start the server
const server = new BilateralBoundServer();
server.start();

module.exports = server;
