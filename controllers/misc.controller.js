import connectDB from "../db/connection.js";

const getCounty = async (req, res) => {
	const { state } = req.query;
	if(!state){
		return res.status(400).json({
			error: "State value is missing"
		});
	}

	try{
		const conn = await connectDB();
		const sql = `SELECT county_name, path FROM county WHERE state_code='${state}' AND status=1 ORDER BY county_name ASC`;
		const [rows] = await conn.query(sql);
		await conn.end();

		const result = [];
		rows.forEach((obj) => {
			result.push({
				county: obj['county_name'],
				path: obj['path']
			});
		});

		return res.status(200).json({
			data: result
		});

	}
	catch(error){
		console.log(error.message);
		return res.status(500).json({
			error: error.message
		});
	}
}

export {
	getCounty
};