import jwt from "jsonwebtoken";

const generateTokenAndSetCookie = (userId, empId, res)=>{

	const token = jwt.sign(
		{ userId: userId, empId: empId },
		process.env.JWT_SECRET,
		{ expiresIn: "1d" }
	);

	res.cookie("token", token, {
		httpOnly: true,
		maxAge: 24 * 60 * 60 * 1000,
		sameSite: "strict",
	});

	return token;

}

export { generateTokenAndSetCookie };