import express from "express";
const route = express.Router();

import {
	register,
	login,
	logout,
	getAllUser
} from "../controllers/user.controller.js";
import protectRoute from "../middleware/protectRoute.js";

route.post("/register", register);
route.post("/login", login);
route.post("/logout", logout);

route.get("/all", protectRoute, getAllUser);

export default route;