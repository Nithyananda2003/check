import express from "express";

const route = express.Router();

import {
	getCounty
} from "../controllers/misc.controller.js";

route.get('/county', getCounty);

export default route;