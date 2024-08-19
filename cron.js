//for product base subscription
import Product from './models/product.js';
import StripeCustomer from './models/stripeCustomer.js';
import stripe from 'stripe';
import cron from 'node-cron';
import dotenv from 'dotenv';

dotenv.config();

const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);

export const startPaymentCron = (io) => {
    cron.schedule('* * * * *', async () => {  // Schedule the job to run every minute for testing
        console.log('Cron job started - Processing payments for due subscriptions');
        try {
            // Find all products with an active subscription and a next billing date due
            const products = await Product.find({
                subscription: true,
                nextBillingDate: { $lte: new Date() }
            });

            for (const product of products) {
                try {
                    const stripeCustomer = await StripeCustomer.findOne({ email: product.email });

                    if (!stripeCustomer) {
                        console.error(`No Stripe customer found for email: ${product.email}`);
                        continue;
                    }

                    const totalAmount = product.amount * product.quantity * 100;  // Convert to cents

                    // Create payment intent for the product
                    let paymentIntent = await stripeClient.paymentIntents.create({
                        amount: totalAmount,
                        currency: 'usd',
                        customer: stripeCustomer.stripeCustomerId,
                        payment_method: stripeCustomer.paymentMethodId,
                        off_session: true,
                        confirm: true,
                    });

                    console.log(`Payment intent with ID: ${paymentIntent.id} created successfully for product ID: ${product._id}`);

                    // Update nextBillingDate for the product
                    product.nextBillingDate = new Date(Date.now() + 2 * 60 * 1000); // For testing;
                   // order.nextBillingDate = new Date(order.nextBillingDate.setMonth(order.nextBillingDate.getMonth() + 1)); //exactly one month after

                    await product.save();

                    io.emit('paymentSuccess', { productId: product._id, message: 'Payment was successful.' });
                } catch (paymentError) {
                    console.error(`Payment failed for product ID: ${product._id}`);
                    console.error("Error", paymentError.message);

                    if (paymentError.code === 'authentication_required') {
                        console.error(`Action required for product ID: ${product._id}`);
                        product.nextBillingDate = new Date();  // Optionally set to retry immediately
                        await product.save();
                        const paymentMethodId = paymentError.payment_intent.last_payment_error.payment_method.id;
                        const clientSecret = paymentError.payment_intent.client_secret;
                        io.emit('paymentActionRequired', { productId: product._id, clientSecret, paymentMethodId, message: 'Payment requires authentication.' });
                    } else {
                        console.error(`Marking product ID: ${product._id} as failed`);
                        product.nextBillingDate = new Date();  // Optionally set to retry immediately
                        await product.save();
                        io.emit('paymentFailed', { productId: product._id, message: 'Payment failed. Please try again.' });
                    }
                }
            }
        } catch (error) {
            console.error('Error processing payments:', error.message);
        }
        console.log('Cron job completed');
    });
};


//for order base subscription

// import StripeCustomer from './models/stripeCustomer.js';
// import Order from './models/order.js';
// import cron from 'node-cron';
// import stripe from 'stripe';
// import dotenv from 'dotenv';

// dotenv.config();

// const stripeClient = stripe(process.env.STRIPE_SECRET_KEY);

// export const startPaymentCron = (io) => {
//     cron.schedule('* * * * *', async () => {
//         console.log('Cron job started - Processing payments for due orders');
//         try {
//             const pendingOrders = await Order.find({
//                 status_id: 1,
//                 nextBillingDate: { $lte: new Date() }
//             });

//             for (const order of pendingOrders) {
//                 try {
//                     const stripeCustomer = await StripeCustomer.findOne({ email: order.billing_address.email });

//                     if (!stripeCustomer) {
//                         console.error(`No Stripe customer found for order ID: ${order._id} with email: ${order?.billing_address.email}`);
//                         continue;
//                     }
//                     const totalAmount = order.products.reduce(
//                         (sum, product) => sum + product.price_inc_tax * product.quantity,
//                         0
//                     ) * 100;

//                   let paymentIntent = await stripeClient.paymentIntents.create({
//                         amount: totalAmount,
//                         currency: 'usd',
//                         customer: stripeCustomer.stripeCustomerId,
//                         payment_method: stripeCustomer.paymentMethodId,
//                         off_session: true,
//                         confirm: true,
//                     });

//                     console.log(`Payment intent with ID: ${paymentIntent.id} created successfully for order ID: ${order._id}`);
//                     order.nextBillingDate = new Date(Date.now() + 1 * 60 * 1000); //run every minute for testing purpose only
//                     // order.nextBillingDate = new Date(Date.now() + order.billingCycle * 24 * 60 * 60 * 1000); // approximatly one month after
//                     // order.nextBillingDate = new Date(order.nextBillingDate.setMonth(order.nextBillingDate.getMonth() + 1)); //exactly one month after
//                     await order.save();
//                     io.emit('paymentSuccess', { orderId: order._id, message: 'Payment was successful.' });
//                 } catch (paymentError) {
//                     console.error(`Payment failed for order ID: ${order._id}`);
//                     console.error("Error",paymentError.message);

//                     if (paymentError.code === 'authentication_required') {
//                         console.error(`Action required for order ID: ${order._id}`);
//                         order.status_id = 3;
//                         await order.save();
//                         const paymentMethodId = paymentError.payment_intent.last_payment_error.payment_method.id;
//                         const clientSecret = paymentError.payment_intent.client_secret;
//                         io.emit('paymentActionRequired', { orderId: order._id,clientSecret: clientSecret,paymentMethodId:paymentMethodId, message: 'Payment requires authentication.' });
//                     } else {
//                         console.error(`Marking order ID: ${order._id} as failed`);
//                         order.status_id = 0;
//                         await order.save();
//                         io.emit('paymentFailed', { orderId: order._id, message: 'Payment failed. Please try again.' });
//                     }
//                 }
//             }
//         } catch (error) {
//             console.error('Error processing payments:', error.message);
//         }
//         console.log('Cron job completed');
//     });
// };