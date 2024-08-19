import mongoose from 'mongoose';

const orderSchema = new mongoose.Schema({
  status_id: { type: Number, required: true },
  customer_id: { type: Number, required: true },
  billing_address: {
    first_name: String,
    last_name: String,
    street_1: String,
    city: String,
    state: String,
    zip: String,
    country: String,
    country_iso2: String,
    email: String,
  },
  products: [{
    product_id: Number,
    name: String,
    quantity: Number,
    price_inc_tax: Number,
    price_ex_tax: Number,
  }],
  // billingCycle: { type: Number, default: 30 },
  // nextBillingDate: { type: Date, default: Date.now },
});

const Order = mongoose.model('Order', orderSchema);

export default Order;

