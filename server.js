import StripeCustomer from './models/stripeCustomer.js';
import Product from './models/product.js';
import { startPaymentCron } from './cron.js';
import Order from './models/order.js';
import { createServer } from 'http';
import { Server } from 'socket.io';
import connectDB from './db.js';
import express from 'express';
import Stripe from 'stripe';
import dotenv from 'dotenv';
import axios from 'axios';
import cors from 'cors';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());

// Connect to the database
await connectDB();

// Create HTTP server and Socket.IO server
const server = createServer(app);
const io = new Server(server, {
  cors: {
      origin: '*', 
      methods: ["GET", "POST"]
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('A user connected');

    socket.on('order_placed', (data) => {
        // console.log(`Order placed with ID: ${data.orderId}`);
        io.emit('payment_status_update', `Your order ${data.orderId} has been placed successfully.`);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

// Route handlers
app.get('/confirm-payment/:productId', async (req, res) => {
  const { productId } = req.params;
//   console.log('product id', productId);
  const nextBillingDate = new Date(Date.now() + 2 * 60 * 1000);
  try {
        await Product.updateOne({ _id: productId }, { $set: { nextBillingDate: nextBillingDate } });
        res.status(200).send({ success: true });
  } catch (error) {
      console.error('Error confirming payment:', error.message);
      res.status(500).send({ success: false, message: error.message });
  }
});

app.post('/create-payment-intent', async (req, res) => {
    const { amount, email, paymentMethodId } = req.body;
    const amountInCents = Math.round(amount * 100);

    try {
        let stripeCustomer = await StripeCustomer.findOne({ email });

        if (!stripeCustomer) {
            const customer = await stripe.customers.create({
                email,
                payment_method: paymentMethodId,
                invoice_settings: {
                    default_payment_method: paymentMethodId,
                },
            });

            stripeCustomer = new StripeCustomer({
                email,
                stripeCustomerId: customer.id,
                paymentMethodId: paymentMethodId,
            });
            await stripeCustomer.save();
        } else {
            await stripe.paymentMethods.attach(paymentMethodId, {
                customer: stripeCustomer.stripeCustomerId,
            });

            await stripe.customers.update(stripeCustomer.stripeCustomerId, {
                invoice_settings: {
                    default_payment_method: paymentMethodId,
                },
            });

            stripeCustomer.paymentMethodId = paymentMethodId;
            await stripeCustomer.save();
        }

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountInCents,
            currency: 'usd',
            customer: stripeCustomer.stripeCustomerId,
            payment_method: paymentMethodId,
        });

        res.status(201).send({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
        console.error('Error creating payment intent:', error.message);
        res.status(500).send({ error: error.message });
    }
});

// app.get('/customer/:customerId', async (req, res) => {
//     const { customerId } = req.params;

//     try {
//         const response = await axios.get(
//             `https://api.bigcommerce.com/stores/${process.env.STORE_HASH}/v2/customers/${customerId}`,
//             {
//                 headers: {
//                     'X-Auth-Token': process.env.X_AUTH_TOKEN,
//                     'Accept': 'application/json',
//                     'Content-Type': 'application/json',
//                 },
//             }
//         );

//         res.status(201).send(response.data);
//     } catch (error) {
//         console.error('Error fetching customer data:', error.response ? error.response.data : error.message);
//         res.status(500).json({ error: 'Failed to fetch customer data' });
//     }
// });

app.get('/cart/:cartId', async (req, res) => {
    const { cartId } = req.params;

    try {
        const response = await axios.get(
            `https://api.bigcommerce.com/stores/${process.env.STORE_HASH}/v3/carts/${cartId}`,
            {
                headers: {
                    'X-Auth-Token': process.env.X_AUTH_TOKEN,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
            }
        );
        // console.log("response: ",response.data.data)
        res.status(201).send(response.data.data);
    } catch (error) {
        console.error('Error fetching customer data:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to fetch customer data' });
    }
});

app.get('/customer/:customerId/address', async (req, res) => {
    const { customerId } = req.params;

    try {
        const response = await axios.get(
            `https://api.bigcommerce.com/stores/${process.env.STORE_HASH}/v2/customers/${customerId}/addresses`,
            {
                headers: {
                    'X-Auth-Token': process.env.X_AUTH_TOKEN,
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                },
            }
        );
        res.status(201).send(response.data);
    } catch (error) {
        console.error('Error fetching customer data:', error);
        res.status(500).json({ error: 'Failed to fetch customer data' });
    }
});

// app.post('/products', async (req, res) => {
//     const { productIds } = req.body;

//     if (!Array.isArray(productIds) || productIds.length === 0) {
//         return res.status(400).json({ error: 'Product IDs must be a non-empty array' });
//     }

//     const productIdsQuery = `id:in=${productIds.join(',')}`;

//     try {
//         const response = await axios.get(
//             `https://api.bigcommerce.com/stores/${process.env.STORE_HASH}/v3/catalog/products?${productIdsQuery}`,
//             {
//                 headers: {
//                     'X-Auth-Token': process.env.X_AUTH_TOKEN,
//                     'Accept': 'application/json',
//                     'Content-Type': 'application/json',
//                 },
//             }
//         );

//         res.status(200).send(response.data);
//     } catch (error) {
//         console.error('Error fetching product data:', error.response ? error.response.data : error.message);
//         res.status(500).json({ error: 'Failed to fetch product data' });
//     }
// });

app.post('/create-order', async (req, res) => {
    const orderData = req.body;
    try {
        const response = await axios.post(
            `https://api.bigcommerce.com/stores/${process.env.STORE_HASH}/v2/orders`,
            orderData,
            {
                headers: {
                    'X-Auth-Token': process.env.X_AUTH_TOKEN,
                    'Content-Type': 'application/json',
                },
            }
        );
        const order = new Order(orderData);
        await order.save();

        res.status(201).send(response.data);
    } catch (error) {
        console.error('Error placing order:', error.response ? error.response.data : error.message);
        res.status(500).send({ error: error.message });
    }
});

app.post('/save-products', async (req, res) => {
    try {
      const products = req.body.products;
  
      // Validate the products array
      if (!Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ message: 'Products array is invalid or empty' });
      }
  
      // Insert multiple products into the database
      const savedProducts = await Product.insertMany(products);
  
      res.status(201).json({
        message: 'Products saved successfully',
        data: savedProducts,
      });
    } catch (error) {
      console.error('Error saving products:', error);
      res.status(500).json({ message: 'Error saving products', error: error.message });
    }
  });

// Start the server and socket.io
server.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

startPaymentCron(io);
