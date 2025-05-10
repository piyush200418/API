// Import necessary modules
const express = require('express');
const promClient = require('prom-client');

// Initialize the Express application
const app = express();
const PORT = process.env.PORT || 5000;

// --- Prometheus Metrics Setup ---
const register = new promClient.Registry();

// --- Standard HTTP Metrics ---
const httpRequestDurationMicroseconds = new promClient.Histogram({
    name: 'http_request_duration_seconds', help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'code'], buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10]
});
// Make sure to explicitly register ALL your desired metrics now
register.registerMetric(httpRequestDurationMicroseconds);

const httpRequestsTotal = new promClient.Counter({
    name: 'http_requests_total', help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'code']
});
register.registerMetric(httpRequestsTotal);

// --- Electronics Products Specific Metrics ---

const productDetailViewsTotal = new promClient.Counter({
    name: 'electronics_product_detail_views_total',
    help: 'Total number of times product detail pages were viewed',
    labelNames: ['productId', 'category', 'brand']
});
register.registerMetric(productDetailViewsTotal); 

const itemsAddedToCartTotal = new promClient.Counter({
    name: 'electronics_items_added_to_cart_total',
    help: 'Total number of items added to shopping carts',
    labelNames: ['productId', 'category']
});
register.registerMetric(itemsAddedToCartTotal); 

const ordersPlacedTotal = new promClient.Counter({
    name: 'electronics_orders_placed_total',
    help: 'Total number of orders successfully placed'
});
register.registerMetric(ordersPlacedTotal); 

const inventoryLevel = new promClient.Gauge({
    name: 'electronics_inventory_level',
    help: 'Current inventory level for a product',
    labelNames: ['productId', 'category', 'brand']
});
register.registerMetric(inventoryLevel);


// --- Middleware ---
app.use(express.json()); // Parse JSON request bodies

app.use((req, res, next) => {
    if (req.path === '/metrics' || req.path === '/favicon.ico') {
        return next();
    }
    const end = httpRequestDurationMicroseconds.startTimer();
    const route = req.path;

    res.on('finish', () => {
        const labels = { method: req.method, route: route, code: res.statusCode };
        end(labels);
        httpRequestsTotal.inc(labels);
        console.log(`Metrics recorded for ${req.method} ${route} -> ${res.statusCode}`);
    });
    next();
});

// --- In-Memory Data Storage (Simulated Electronics Store) ---
let customers = [
    { id: 1, name: 'Harsh', email: 'harsh@gmail.com' },
    { id: 2, name: 'Vaibhav', email: 'vaibhav@gmail.com' }
];
let products = [
    { id: 101, name: 'Gaming Laptop', category: 'Laptops', brand: 'MSI', price: 70000, stock: 15 },
    { id: 102, name: 'Wireless Mouse', category: 'Accessories', brand: 'HP', price: 2500, stock: 120 },
    { id: 103, name: '4K Monitor', category: 'Monitors', brand: 'Lenovo', price: 19000, stock: 30 }
];
let nextCustomerId = 3; 
let nextProductId = 104;

// --- Set Initial Inventory Gauge Values ---
products.forEach(product => {
    inventoryLevel.labels(String(product.id), product.category, product.brand).set(product.stock);
});


// --- API Endpoints ---

// Root endpoint
app.get('/', (req, res) => {
    res.status(200).send('Electronics Store API Server is running!');
});

// --- Customer Endpoints ---
app.get('/customers', (req, res) => {
    res.status(200).json(customers);
});
app.post('/customers', (req, res) => {
    const { name, email } = req.body;
    if (!name || !email) { return res.status(400).json({ error: 'Name and email are required' }); }
    const newCustomer = { id: nextCustomerId++, name, email }; customers.push(newCustomer);
    res.status(201).json(newCustomer);
});

// --- Product Endpoints ---
app.get('/products', (req, res) => {
    res.status(200).json(products);
});

app.get('/products/:id', (req, res) => {
    const productId = parseInt(req.params.id, 10);
    const product = products.find(p => p.id === productId);
    if (product) {
        productDetailViewsTotal.labels(String(product.id), product.category, product.brand).inc();
        console.log(`Product view metric incremented for ID: ${product.id}`);
        res.status(200).json(product);
    } else {
        res.status(404).json({ error: 'Product not found' });
    }
});

app.post('/products', (req, res) => {
    const { name, price, category = 'Unknown', brand = 'Unknown', stock = 0 } = req.body;
    if (!name || price === undefined) { return res.status(400).json({ error: 'Name and price are required' }); }
    const newProduct = { id: nextProductId++, name, price: Number(price), category, brand, stock: Number(stock) };
    products.push(newProduct);
    inventoryLevel.labels(String(newProduct.id), newProduct.category, newProduct.brand).set(newProduct.stock);
    console.log(`Inventory gauge set for new product ID: ${newProduct.id}`);
    res.status(201).json(newProduct);
});

// --- Cart Endpoint---
app.post('/cart', (req, res) => {
    const { productId, quantity = 1 } = req.body;
    if (!productId) { return res.status(400).json({ error: 'productId is required' }); }
    const product = products.find(p => p.id === parseInt(productId, 10));
    if (!product) { return res.status(404).json({ error: 'Product not found to add to cart' }); }
    itemsAddedToCartTotal.labels(String(product.id), product.category).inc(Number(quantity));
    console.log(`Item added to cart metric incremented for ID: ${product.id}, Quantity: ${quantity}`);
    res.status(200).json({ message: `${quantity} x ${product.name} added to cart!` });
});

// --- Order Endpoint ---
app.post('/orders', (req, res) => {
    console.log("Simulating order placement...");
    ordersPlacedTotal.inc();
    console.log(`Orders placed metric incremented.`);
    const orderedProductId = 101; // Hardcode for demo
    const productIndex = products.findIndex(p => p.id === orderedProductId);
    if (productIndex !== -1 && products[productIndex].stock > 0) {
        products[productIndex].stock--;
        inventoryLevel.labels(String(products[productIndex].id), products[productIndex].category, products[productIndex].brand)
            .set(products[productIndex].stock);
        console.log(`Inventory gauge updated for product ID: ${products[productIndex].id}, New stock: ${products[productIndex].stock}`);
    } else if (productIndex !== -1) {
        console.warn(`Attempted to order product ID: ${orderedProductId}, but stock is 0.`);
    }
    res.status(201).json({ message: 'Order placed successfully!', orderId: `ORD${Date.now()}` });
});


// --- INTENTIONAL ERROR ENDPOINT for Alert Testing ---
app.get('/intentional-error', (req, res, next) => {
    console.error('Intentional 500 error triggered!');
    try { throw new Error('This is a forced internal server error for testing alerts.'); }
    catch (error) { next(error); }
});

// --- Metrics Endpoint ---
app.get('/metrics', async (req, res) => {
    try {
        res.set('Content-Type', register.contentType);
        res.end(await register.metrics());
    } catch (ex) {
        console.error("Error generating metrics:", ex);
        res.status(500).end(ex.toString());
    }
});

// --- Error Handlers ---
app.use((req, res, next) => {
    res.status(404).send("Sorry, can't find that endpoint!");
});
app.use((err, req, res, next) => {
    console.error(`500 Internal Server Error Handler - ${err.message}`);
    console.error(err.stack);
    res.status(500).send('Something broke on the server!');
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log(`Electronics Store API Server listening on http://localhost:${PORT}`);
    console.log(`Metrics available at http://localhost:${PORT}/metrics`);
    console.log('Initial inventory levels set.');
});