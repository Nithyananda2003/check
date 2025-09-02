import express from "express";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import ejs from "ejs";
import path from "node:path";
import cors from "cors";

import getBrowserInstance from "./utils/chromium/browserLaunch.js";

dotenv.config();

const app = express();

app.engine('.html', ejs.__express);
app.use(express.static('public'));
app.set('view engine', 'html');

import user_router from "./routes/user.route.js";
import misc_router from "./routes/misc.route.js";
import darke_router from "./routes/ohio.route.js";

import protectRoute from "./middleware/protectRoute.js";

import arizona_router from "./routes/arizona.route.js";
import washington_router from "./routes/washington.route.js";

app.use(cors());

app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.get("/tax", protectRoute, (req, res) => {
    res.render('order_search')
});

app.use("/tax/AZ", arizona_router);
app.use("/tax/OH", darke_router);
app.use("/tax/WA", washington_router);

app.use("/tax/:state/:county", (req, res) => {
    res.json({ error: true, message: "Service Unavailable for this county" })
});

app.use("/user", user_router);
app.use("/misc", misc_router);

app.get("/login", (req, res) => {
    res.render('login');
});

app.get("/register", protectRoute, (req, res) => {
    res.render('register');
});

app.get("*", protectRoute, (req, res) => {
    res.render('page_not_found');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
    try {
        await getBrowserInstance();
        console.log("Browser launched");
        console.log("Server is listening on PORT: " + PORT);
    }
    catch (error) {
        console.log(error)
    }
});
