import mongoose from 'mongoose';

const stripeCustomerSchema = new mongoose.Schema({
  stripeCustomerId: String,
  paymentMethodId: String,
  email: String,
});

const StripeCustomer = mongoose.model('StripeCustomer', stripeCustomerSchema);

export default StripeCustomer;
