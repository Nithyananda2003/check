import express from "express";
const route = express.Router();

import {
	search as maricopa_search
} from "../controllers/AZ/maricopa.controller.js";

route.post("/maricopa", maricopa_search);

export default route;