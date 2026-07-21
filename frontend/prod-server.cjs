const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');

const app = express();

// Proxy API requests to backend
app.use('/api', createProxyMiddleware({
  target: 'http://127.0.0.1:3001/api',
  changeOrigin: true,
}));

// Serve static files from dist
app.use(express.static(path.join(__dirname, 'dist')));

// Handle React routing, return all requests to React app
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = 5177;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Production server running on http://0.0.0.0:${PORT}`);
});
