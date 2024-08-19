import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
    productId: { type: Number, required: true },
    email: { type: String, required: true },
    amount: { type: Number, required: true },
    quantity:{type: Number,require: true},
    subscription: { type: Boolean, required: true },
    nextBillingDate: { type: Date, default: Date.now },

});

const Product = mongoose.model('Product', productSchema);

export default Product;
