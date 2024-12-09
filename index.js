const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config()
const port = process.env.PORT || 5000;
const SSLCommerzPayment = require('sslcommerz-lts')

// middleware
app.use(cors());
app.use(express.json());


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tqyfr7x.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const userCollection = client.db("sellDB").collection("users");
        const productCollection = client.db("sellDB").collection("userProduct");
        const cartCollection = client.db("sellDB").collection("carts");
        const purchasesCollection = client.db("sellDB").collection("purchases");



        // jwt related api
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        })

        // middlewares 
        const verifyToken = (req, res, next) => {
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' });
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' })
                }
                req.decoded = decoded;
                next();
            })
        }

        // use verify admin after verifyToken
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }

        // users related api
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        });

        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;

            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }

            const query = { email: email };
            const user = await userCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin });
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            const query = { email: user.email }
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists', insertedId: null })
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        });

        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })

        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await userCollection.deleteOne(query);
            res.send(result);
        })


        app.post('/userProduct', async (req, res) => {
            const userProduct = req.body;
            const result = await productCollection.insertOne(userProduct);
            res.send(result);
        })

        app.get('/userProduct', async (req, res) => {
            const result = await productCollection.find().toArray();
            res.send(result);
        })

        app.get('/userProduct/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await productCollection.findOne(query);
            res.send(result)

        })

        app.get('/userSelfProduct', async (req, res) => {
            let query = {};
            if (req.query?.email) {
                query = { email: req.query.email }
            }
            const result = await productCollection.find(query).toArray();
            res.send(result);
        })

        app.delete('/userSelfProduct/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await productCollection.deleteOne(query);
            res.send(result);
        })

        app.put('/userSelfProduct/:id', async (req, res) => {
            const id = req.params.id;
            const updatedData = req.body;

            try {
                const result = await productCollection.updateOne(
                    { _id: new ObjectId(id) },
                    { $set: updatedData }
                );

                if (result.modifiedCount > 0) {
                    res.status(200).json({ updatedId: id, message: "Product information updated successfully" });
                } else {
                    res.status(404).json({ message: "Product not found or no changes made" });
                }
            } catch (error) {
                res.status(500).json({ message: "Internal Server Error" });
            }
        });


        app.get('/userProduct/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await productCollection.findOne(query);
            res.send(result)

        })

        // cart collection

        app.post('/carts', async (req, res) => {
            const cartItem = req.body;
            const query = { productId: cartItem.productId, userEmail: cartItem.userEmail };
            const existingCartItem = await cartCollection.findOne(query);

            if (existingCartItem) {
                return res.status(400).send({ message: 'This product is already in your cart!' });
            }

            const result = await cartCollection.insertOne(cartItem);
            res.status(201).send(result);
        });

        app.get('/cartsProduct', async (req, res) => {
            const result = await cartCollection.find().toArray();
            res.send(result);
        })

        app.get('/carts', async (req, res) => {
            const email = req.query.email;
            if (!email) {
                return res.status(400).send({ message: 'Email query parameter is required' });
            }

            try {
                const query = { userEmail: email };
                const result = await cartCollection.find(query).toArray();

                res.status(200).send(result);
            } catch (error) {
                console.error("Error fetching cart data:", error);
                res.status(500).send({ message: 'Internal server error' });
            }
        });


        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await cartCollection.deleteOne(query);
            res.send(result);
        })

        // order now

        app.get('/OrderNow/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await cartCollection.findOne(query);
            res.send(result)

        })

        // purchases

        app.post('/purchases', async (req, res) => {
            const purchasesProduct = req.body;
            const result = await purchasesCollection.insertOne(purchasesProduct);
            res.send(result);
        })

        app.get('/purchases', async (req, res) => {
            const email = req.query.email;
            if (!email) {
                return res.status(400).send({ message: 'Email query parameter is required' });
            }

            try {
                const query = { "contactInfo.email": email };
                const result = await purchasesCollection.find(query).toArray();

                console.log("Query:", query);
                console.log("Result:", result);
                res.status(200).send(result);
            } catch (error) {
                console.error("Error fetching purchases data:", error);
                res.status(500).send({ message: 'Internal server error' });
            }
        });

        app.get('/purchasesQuentity', async (req, res) => {
            const result = await purchasesCollection.find().toArray();
            res.send(result);
        })



        // payment

        const store_id = process.env.STORE_ID
        const store_passwd = process.env.STORE_PASS
        const is_live = false




        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Sell is sitting')
})

app.listen(port, () => {
    console.log(`Resell is sitting on port ${port}`);
})

