import connectDB from "../db/connection.js";
import bcrypt from "bcryptjs";

import { getCurrentDateTime } from "../utils/helpers/getCurrentDateTime.js";
import { generateTokenAndSetCookie } from "../utils/helpers/generateTokenAndSetCookie.js";

const register = async (req, res) => {
	try{	
		const { type, name, employeeid, password } = req.body;

		// CHECK IF ALREADY REGISTERED
		const conn = await connectDB();
		const sql = `SELECT COUNT(*) AS existingCount FROM users WHERE employee_id='${employeeid}'`;
		const [sqlResult] = await conn.query(sql);
		const existingCount = sqlResult[0].existingCount;

		if(existingCount > 0){
			return res.status(400).json({
				error: "User already exists"
			}); 
		}

		// GENERATE ENCRYPTED PASSWORD
		const salt = await bcrypt.genSalt(10);
		const hashedPassword = await bcrypt.hash(password, salt);

		const currentDateTime = getCurrentDateTime();

		// INSERT NEW USER TO DATABASE
		const insertQuery = "INSERT INTO users(type, name, employee_id, password, created_at, updated_at) VALUES ('"+type+"','"+name+"','"+employeeid+"','"+hashedPassword+"','"+currentDateTime+"','"+currentDateTime+"')";
		const [result] = await conn.query(insertQuery);

		// GENERATE TOKEN AND SET COOKIE
		generateTokenAndSetCookie(result.insertId, employeeid, res);
		await conn.end();

		return res.status(200).json({
			message: result
		});

	}
	catch(error){
		console.log(`Register Controller Error: ${error}`);
		return res.status(200).json({
			error: error.message
		});
	}
}

const login = async (req, res) => {
	try{
		const { employeeid, password } = req.body;

		// CHECK IF ALREADY REGISTERED
		const conn = await connectDB();
		const sql = `SELECT id, employee_id, password FROM users WHERE employee_id='${employeeid}' LIMIT 1`;
		const [sqlResult] = await conn.query(sql);

		if(sqlResult.length == 0){
			return res.redirect('/login');
		}

		const hashedPassword = sqlResult[0]['password'];
		const isPasswordSame = await bcrypt.compare(password, hashedPassword);
		if(!isPasswordSame){
			return res.redirect('/login');
		}

		// GENERATE TOKEN AND SET COOKIE
		generateTokenAndSetCookie(sqlResult[0]['id'], employeeid, res);
		await conn.end();
		
		return res.redirect('/tax');
	}
	catch(error){
		console.log(`Login Controller Error: ${error}`);
		return res.redirect('/login');
	}
}

const logout = async (req, res) => {
	try{		
		res.cookie("token", "", {
			maxAge: 1
		});
		return res.redirect('/login');
	}
	catch(error){
		console.log(`Logout Controller Error: ${error}`);
		return res.redirect('/login');
	}
}

const getAllUser = async (req, res) => {
	const conn = await connectDB();

	let sql = "SELECT * FROM users";
	const [rows] = await conn.query(sql);

	return res.status(200).json({ data: rows });
}

export {
	register,
	login,
	logout,
	getAllUser
};