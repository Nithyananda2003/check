import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const ac_1 = async (page, account)  => {
	return new Promise(async (resolve, reject) => {
		try{
			const url = `https://treasurer.maricopa.gov/`;
			const status = await page.goto(url, { waitUntil: "domcontentloaded"});

			const account_arr = account.split("-");

			await page.waitForSelector("#txtParcelNumBook")
			await page.locator("#txtParcelNumBook").fill(account_arr[0]);

			await page.waitForSelector("#txtParcelNumMap");
			await page.locator("#txtParcelNumMap").fill(account_arr[1]);

			await page.waitForSelector("#txtParcelNumItem");
			await page.locator("#txtParcelNumItem").fill(account_arr[2]);

			await page.locator("#btnGo").click();

			await Promise.all([
				page.locator("#btnGo").click(),
				page.waitForNavigation()
			]);

			await page.waitForSelector("#cphMainContent_cphRightColumn_divViewAdditionalYears");
			const paid_status = await page.evaluate(() => {
				let ul = document.querySelector("#cphMainContent_cphRightColumn_divViewAdditionalYears").parentElement.lastElementChild.querySelector(".block-grid");
				let li = ul.children;
				let amount = li[1].textContent.trim();
				return amount;
			})

			resolve(paid_status);

		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

const ac_2 = async (page, paid_status, account) => {
	return new Promise(async (resolve, reject) => {
		try{
			const url = "https://treasurer.maricopa.gov/Parcel/DetailedTaxStatement.aspx";
			const status = await page.goto(url, { waitUntil: "domcontentloaded"});

			// await page.waitForSelector("#cphMainContent_cphRightColumn_dtlTaxBill_lblPrimaryLandAssessedValue");			
			// await page.waitForSelector("#cphMainContent_cphRightColumn_dtlTaxBill_lblPrimaryExemptionAssessedValue");
			// await page.waitForSelector("#cphMainContent_cphRightColumn_dtlTaxBill_lblPrimaryTotalAssessedValue");

			const page_data = await page.evaluate(() => {
				const datum = {
					processed_date : "",
					order_number : "",
					borrower_name: "",
					owner_name: [],
					property_address: "",
					parcel_number: "",
					land_value: "",
					improvements: "",
					total_assessed_value: "",
					exemption: "",
					total_taxable_value: "",
					taxing_authority: "Maricopa County Treasurer, 301 W Jefferson St #100, Phoenix, AZ 85003, Ph: 602-506-8511",	
					notes: "",
					delinquent:"",			
					tax_history: []
				}

				// OWNER / ADDRESS
				datum['owner_name'][0] = document.getElementById("cphMainContent_cphRightColumn_dtlTaxBill_ParcelNASitusLegal_lblNameAddress")?.firstElementChild?.childNodes[0]?.textContent ?? "N/A";
				datum['property_address'] = document.getElementById("cphMainContent_cphRightColumn_dtlTaxBill_ParcelNASitusLegal_lblSitusAddress")?.textContent ?? "N/A";

				// ASSESSED VALUE
				datum['total_assessed_value'] = document.getElementById("cphMainContent_cphRightColumn_dtlTaxBill_lblPrimaryLandAssessedValue")?.textContent;
				datum['exemption'] = document.getElementById("cphMainContent_cphRightColumn_dtlTaxBill_lblPrimaryExemptionAssessedValue")?.textContent;
				datum['total_taxable_value'] = document.getElementById("cphMainContent_cphRightColumn_dtlTaxBill_lblPrimaryTotalAssessedValue")?.textContent;

				return datum;
			});
			page_data['parcel_number'] = account;

			// NOTES AND DELINQUENT
			if(paid_status == "$0.00"){
				page_data['notes'] = "ALL PRIORS ARE PAID, 2024-2025 TAXES ARE PAID, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 10/01 & 03/01";
				page_data['delinquent'] = "NONE";
			}
			else{
				page_data['notes'] = "ALL PRIORS ARE PAID, 2024-2025 TAXES ARE NOT PAID, 2ND HALF TAXES ARE DUE, NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE 10/01 & 03/01";
				page_data['delinquent'] = "YES";
			}

			resolve({
				data: page_data,
				paid_status: paid_status
			});
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message))
		}
	})
}

const ac_paid = async (page, data) => {
	return new Promise(async (resolve, reject) => {
		try{
			const url = `https://treasurer.maricopa.gov/Parcel/Activities.aspx`;
			const status = await page.goto(url, { waitUntil: "domcontentloaded"});

			await page.waitForSelector("#cphMainContent_cphRightColumn_Activities1_gvActs");
			const page_content = await page.evaluate(() => {
				let temp = [];
				const table = document.getElementById("cphMainContent_cphRightColumn_Activities1_gvActs");
				const tbody_rows = table.querySelectorAll("tbody tr");
				const tr_length = tbody_rows.length;

				let max_year = null;
				for(let i=0; i<tr_length; i++){
					let th_data = {
						jurisdiction: "County",
						year: "",
						payment_type: "",
						status: "Paid",
						base_amount: "",
						amount_paid: "",
						amount_due: "$0.00",
						mailing_date: "N/A",
						due_date: "",
						delq_date: "",
						paid_date: "",
						good_through_date: "",
						link: ""
					};

					tbody_rows[i].querySelectorAll("td").forEach((td, j) => {
						if(j == 0){
							th_data['year'] = td.textContent.trim();
						}
						else if(j == 1){
							th_data['link'] = td.querySelector('a').href;
						}
						else if(j == 2){
							th_data['amount_paid'] = td.textContent.trim();
						}
						else if(j == 4){
							th_data['paid_date'] = td.textContent.trim();
						}
					});

					if(i == 0){
						max_year = th_data['year'];
						temp.push(th_data);
					}
					else{
						if(th_data['year'] == max_year){
							temp.push(th_data);
						}
						else{
							break;
						}
					}
				}

				return temp;
			});

			data['tax_history'] = page_content.reverse();

			for(let i=0; i<data['tax_history'].length; i++){
				data['tax_history'][i] = await ac_paid_helper(page, data['tax_history'][i]);
				delete data['tax_history'][i]['link'];
			}

			resolve(data);
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	});
}

const ac_paid_helper = async (page, data) => {
	return new Promise(async (resolve, reject) => {
		try{
			const url = data['link'];
			await page.goto(url, { waitUntil: "domcontentloaded"});

			const new_data = await page.evaluate((data) => {
				data['base_amount'] = document.getElementById('cphMainContent_cphRightColumn_activityTaxPayment_lblCtxPmtAmountTotal')?.textContent ?? data['amount_paid'];

				const half_1 = document.getElementById('cphMainContent_cphRightColumn_activityTaxPayment_lblCtxPmtAmount1stHalfTotal').textContent.trim();
				const half_2 = document.getElementById('cphMainContent_cphRightColumn_activityTaxPayment_lblCtxPmtAmount2ndHalfTotal').textContent.trim();

				if(half_1 == '$0.00' || half_2 == '$0.00'){
					data['payment_type'] = "Semi-Annual";
				}
				else{
					data['payment_type'] = "Annual";
				}
				return data;

			}, data);

			resolve(new_data);
		}
		catch(error){
			console.log(error);
			reject(error.message);
		}
	})
}

const ac_unpaid = async (page, data) => {
	return new Promise(async (resolve, reject) => {
		try{
			const url = `https://treasurer.maricopa.gov/Parcel/Summary.aspx?List=All`;
			const status = await page.goto(url, { waitUntil: "domcontentloaded"});

			await page.waitForSelector("#cphMainContent_cphRightColumn_divBackTaxes");
			const page_content = await page.evaluate(() => {
				let temp = [];
				const table = document.querySelector("#cphMainContent_cphRightColumn_divBackTaxes table")
				const tbody_rows = table.querySelectorAll("tbody tr");

				let status = true;
				let tr_length = tbody_rows.length;				
				for(let i=0; i<tr_length; i++){
					let th_data = {
						jurisdiction: "County",
						year: "",
						payment_type: "Semi-Annual",
						status: "",
						base_amount: "",
						amount_paid: "",
						amount_due: "",
						mailing_date: "N/A",
						due_date: "",
						delq_date: "",
						paid_date: "-",
						good_through_date: "",
					};
					if(status){
						tbody_rows[i].querySelectorAll("td").forEach((td, i) => {
							if(i == 0){
								th_data['year'] = td.textContent.trim();
							}
							else if(i == 1){
								let status_text = td.textContent.trim();
								th_data['status'] = status_text;
								if(status_text == 'Paid'){
									status = false;
								}
							}
							else if(i == 2){
								th_data['base_amount'] = td.textContent.trim();
							}
							else if(i == 3){
								th_data['amount_due'] = td.textContent.trim();
							}
						});						
					}
					if(!status){
						break;
					}
					temp.push(th_data);
				}
				return temp;
			});
			data['tax_history'] = [...page_content];
			resolve(data);

		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

const ac_unpaid_v2_step_1 = async (page, data) => {
	return new Promise(async (resolve, reject) => {
		try{
			const url = `https://treasurer.maricopa.gov/Parcel/Summary.aspx?List=All`;
			const status = await page.goto(url, { waitUntil: "domcontentloaded"});

			await page.waitForSelector("#cphMainContent_cphRightColumn_gvTaxYears");
			const unpaid_year = await page.evaluate(() => {
				const trs = document.querySelectorAll("#cphMainContent_cphRightColumn_gvTaxYears tbody tr");
				const trs_length = trs.length;

				let unpaid_year = [];
				for(let i=0; i<trs_length; i++){
					const tds = trs[i].querySelectorAll("td");
					if(tds[1].textContent.trim() !== "Unpaid"){
						unpaid_year.push(tds[0].textContent.trim())
					}
				}
				return unpaid_year;
			});

			resolve({
				data: data,
				unpaid_year: unpaid_year
			});
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

const ac_unpaid_v2_step_2 = async (page, data) => {
	return new Promise(async (resolve, reject) => {
		try{
		
			resolve(data['data']);
		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

const ac_screenshot = async(page, url, account) => {
	return new Promise(async (resolve, reject) => {
		try{	
			const status = await page.goto(url, { waitUntil: "domcontentloaded"});

			const element = await page.$('#siteInnerContentContainer .nine');
			let base64 = await element.screenshot({ encoding: "base64" });

			base64 = "data:image/data:image/png;base64,"+base64;

			resolve({
				image: base64
			});

		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

const account_search = async (page, account) => {
	return new Promise(async (resolve, reject) => {
		try{
			ac_1(page, account)
			.then((paid_status) => {

				ac_2(page, paid_status, account)
				.then((data2) => { 

					if(data2['paid_status'] == "$0.00"){

						ac_paid(page, data2['data'])
						.then((data3) => {
							resolve(data3);
						})
						.catch((error) => {
							console.log(error);
							reject(error);
						});

					}
					else{

						ac_unpaid(page, data2['data'])
						.then((data3) => {
							resolve(data3);
						})
						.catch((error) => {
							console.log(error);
							reject(error);
						});

					}

				})
				.catch((error) => {
					console.log(error);
					reject(error)
				})
				
			})
			.catch((error) => {
				console.log(error);
				reject(error);
			})

		}
		catch(error){
			console.log(error);
			reject(new Error(error.message));
		}
	})
}

const search = async (req, res) => {
	const { fetch_type, account } = req.body;
	try{

		if(!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
			return res.status(200).render('error_data', {
				error: true,
				message: "Invalid Access"
			});
		}

		const browser = await getBrowserInstance();
		const context = await browser.createBrowserContext();
		const page = await context.newPage();
		// await page.setViewport({ width: 1366, height: 768});
		await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36')

		page.setDefaultNavigationTimeout(90000);

		// INTERCEPT REQUESTS AND BLOCK CERTAIN RESOURCE TYPES
		await page.setRequestInterception(true);
		page.on('request', (req) => {
			if (req.resourceType() === 'stylesheet' || req.resourceType() === 'font' || req.resourceType() === 'image') {
				req.abort();
			} else {
				req.continue();
			}
		});

		if(fetch_type == "html"){
			// FRONTEND POINT
			account_search(page, account)
			.then((data) => {
				res.status(200).render("parcel_data_official", data);
			})
			.catch((error) => {
				console.log(error)
				res.status(200).render('error_data', {
					error: true,
					message: error.message
				});
			})
			.finally(async () => {
				await context.close();
			})
		}
		else if(fetch_type == "api"){
			// API ENDPOINT
			account_search(page, account)
			.then((data) => {
				res.status(200).json({
					result: data
				})
			})
			.catch((error) => {
				console.log(error)
				res.status(500).json({
					error: true,
					message: error.message
				})
			})
			.finally(async () => {
				await context.close();
			})
		}

	}
	catch(error){
		console.log(error);
		if(fetch_type == "html"){
			res.status(200).render('error_data', {
				error: true,
				message: error.message
			});
		}
		else if(fetch_type == "api"){
			res.status(500).json({
				error: true,
				message: error.message
			});
		}
	}
}

export {
	search
}