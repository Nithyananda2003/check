
const only_alphabets = (str) => {
	var new_str = str.replace(/[^a-zA-Z]+/g, '');
	return new_str;
}

export{
	only_alphabets
}