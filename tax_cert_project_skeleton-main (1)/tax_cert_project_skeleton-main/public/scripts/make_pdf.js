
async function generatePDF(btn){
	const loadingDiv = document.querySelector(".loading-modal");	

	try{
		loadingDiv.classList.remove('loading-modal-hide');

		const pclid = btn.dataset.pclid;
		const pan = btn.dataset.pan;

		const response = await fetch(`/tax/AL/baldwin/scrap`, { 
			method: 'POST',
			headers: {
				"Content-Type": "application/json"
			},
			body: JSON.stringify({
				pclid: pclid,
				pan: pan
			})
		});
		const result = await response.json();

		if(result.error){
			console.log(result);
			return;
		}

		let deep_arr = []
		deep_arr.push(['YEAR', 'OWNER(S)', 'TOTAL TAX', 'PAID (Y/N)', 'PAID BY', 'APPRAISED',	'ASSESSED'])
		if(result['taxHistory']['data']){
			for (const [key, value] of Object.entries(result['taxHistory']['data'])) {
				deep_arr.push(value);
			}
		}

		console.log(result);
		var docDefinition = { 
			pageSize: 'A4',
			content: [
				{text : "Property Tax Information", fontSize: 15, alignment: 'center', marginBottom: 15},
				{text : "Parcel Information", fontSize: 12, marginBottom: 5},
				{
					style: 'tableExample',
					table: {
						widths: [100, 139, 100, 139],
						body: [
							['PIN', result['parcel']['PIN'], 'ACCOUNT NUMBER', result['parcel']['ACCOUNT NUMBER']],							
						]
					}
				},
				{
					style: 'tableExample',
					table: {
						widths: [100, '*'],
						body: [
							['PARCEL', result['parcel']['PARCEL']],							
							['OWNER', result['parcel']['OWNER']],							
							['MAILING ADDRESS', result['parcel']['MAILING ADDRESS']],							
							['PROPERTY ADDRESS', result['parcel']['PROPERTY ADDRESS']],							
							['LEGAL DESCRIPTION', result['parcel']['LEGAL DESCRIPTION']],							
							['TAX DISTRICT', result['parcel']['TAX DISTRICT']],							
						]
					}
				},
				{text : "Tax Information", fontSize: 12, marginBottom: 5, marginTop: 10},
				{
					style: 'tableExample',
					table: {
						widths: [55, 55, 55, 55, 55, 55, 55, '*'],
						body: [
							['PPIN', 'YEAR', 'TAX TYPE', 'TAXES', 'PENALTIES / INTEREST', 'SUBTOTAL', 'AMT PAID', 'BALANCE DUE'],
							[result['taxInfo']['PPIN'], result['taxInfo']['YEAR'], result['taxInfo']['TAX TYPE'], result['taxInfo']['TAXES'], result['taxInfo']['PENALTIES / INTEREST'], result['taxInfo']['SUBTOTAL'], result['taxInfo']['AMT PAID'], result['taxInfo']['BALANCE DUE']]
						]
					}
				},
				{text: result['totalDue'], fontSize: 13, bold: true, marginTop: 5},
				{text: result['lastDate'], fontSize: 9, marginTop: 5},
				{text : "Tax History", fontSize: 12, marginBottom: 5, marginTop: 15},
				{
					style: 'tableExample',
					table: {
						widths: [55, '*', 55, 55, '*', 55, 55],
						body: deep_arr
					}
				},
			],
			styles: {
				tableExample: {
					margin: [0, 5, 0, 2],
					fontSize: 10 
				}
			},
		};
		pdfMake.createPdf(docDefinition).open();

	}
	catch(error){
		console.log(error);
	}
	finally{
		loadingDiv.classList.add('loading-modal-hide');
	}	
}