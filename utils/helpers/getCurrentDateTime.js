
const getCurrentDateTime = () =>{
	const dateObj = new Date();
	let year = dateObj.getFullYear();

	let month = dateObj.getMonth();
	month = ('0' + (month + 1)).slice(-2); // month always has 2-character-format. For example, 1 => 01, 2 => 02
	
	let date = dateObj.getDate();
	date = ('0' + date).slice(-2); // date always has 2-character-format
	
	let hour = dateObj.getHours(); 
	hour = ('0' + hour).slice(-2); // hour always has 2-character-format

	let minute = dateObj.getMinutes();
	minute = ('0' + minute).slice(-2); // minute always has 2-character-format
	

	let second = dateObj.getSeconds();
	second = ('0' + second).slice(-2); // second always has 2-character-format
	
	const time = `${year}-${month}-${date} ${hour}:${minute}:${second}`;
	return time;

}
export { getCurrentDateTime };