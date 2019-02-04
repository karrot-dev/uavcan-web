/**
 * Serves files from 'public', proxies API requests to backend
 */

const express = require('express')
const proxy = require('http-proxy-middleware')
const { join } = require('path')

/**
 * Serve static files
 */
const app = express()
app.use(express.static(join(__dirname, './public')))
app.use('/api', proxy({ target: 'http://kanthaus-server', changeOrigin: true }))

/**
 * Run server
 */

app.listen(8080, () => {
  console.log('listening on http://localhost:8080')
})
