import express from "express";
import { search as adams_search, search } from "../controllers/WA/adams.controller.js";
import { search as douglas_search } from "../controllers/WA/douglas.controller.js";
import {search as lincoln_search} from "../controllers/WA/lincoln.controller.js"
import {search as ferry_search} from '../controllers/WA/ferry.controller.js'
import { search as skamania_search} from "../controllers/WA/skamania.controller.js";
import { search as grays_harbor_search} from "../controllers/WA/grays_harbor.controller.js";
import { search as san_juan_search} from "../controllers/WA/san_juan.controller.js";
import { search as jefferson_search } from "../controllers/WA/jefferson.controller.js";


const route = express.Router(); 
route.post("/adams", adams_search);
route.post("/douglas",douglas_search)
route.post('/lincoln',lincoln_search)
route.post('/ferry',ferry_search) 
route.post('/skamania',skamania_search)
route.post('/grays-harbor',grays_harbor_search)
route.post('/san-juan',san_juan_search)
route.post("/jefferson", jefferson_search );

export default route;