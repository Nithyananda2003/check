import mysql from 'mysql2/promise';

const connectDB = async ()=>{
	try{
		const connection = await mysql.createConnection({
			host: process.env.MYSQL_HOST,
			user: process.env.MYSQL_USER,
			password: process.env.MYSQL_PASSWORD,
			database: process.env.MYSQL_DATABASE,
		});
		return connection;
	}	
	catch(error){
		throw new Error('Database Connection Error: '+error);
	}
}

export default connectDB;