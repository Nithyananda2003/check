import jwt from "jsonwebtoken";

const protectRoute = async (req, res, next) => {
	try{
		const cookieToken = req.cookies.token;
		if(!cookieToken){
			return res.redirect('/login');
		}

		const decodedToken = jwt.verify(cookieToken, process.env.JWT_SECRET);
		if (decodedToken) {
            req.userId = decodedToken.userId;
			res.empId = decodedToken.empId;
			return next();
        } 
        else {
            return res.redirect('/login');
        }
		
	}
	catch(error){
		console.log(error.message);
		return res.redirect('/login');
	}
} 

export default protectRoute;