import express from "express";
const route = express.Router();

import {
	search as darke_search
} from "../controllers/OH/darke.controller.js";

route.post("/darke", darke_search);

export default route;
