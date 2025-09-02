
// Mercer County Tax Scraper - Complete Working Version
// Nithyananda R S

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const formatDate = (month, day, year) => {
	const date = new Date(year, month - 1, day);
	const isValidDate = date && date.getMonth() === month - 1 && date.getDate() === day;
	if (!isValidDate) {
		throw new Error(`Invalid date: ${month}/${day}/${year}`);
	}
	return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
};

const getCurrentTaxYear = () => {
	const now = new Date();
	const month = now.getMonth() + 1;
	const year = now.getFullYear();
	return month >= 8 ? year + 1 : year;
};

const calculateDueDates = (year = getCurrentTaxYear(), county = 'Mercer') => {
	try {
		const taxYear = parseInt(year);
		if (isNaN(taxYear) || taxYear < 2000 || taxYear > 2100) {
			throw new Error('Invalid tax year');
		}

		const countyDueDates = {
			'Mercer': {
				firstHalf: {
					dueDate: formatDate(2, 21, taxYear),
					delqDate: formatDate(2, 22, taxYear),
					period: 'First Half'
				},
				secondHalf: {
					dueDate: formatDate(7, 21, taxYear),
					delqDate: formatDate(7, 22, taxYear),
					period: 'Second Half'
				},
				paymentTypes: ['Annual', 'Semi-Annual'],
				defaultPaymentType: 'Semi-Annual'
			}
		};

		if (!countyDueDates[county]) {
			throw new Error(`Unknown county: ${county}`);
		}

		const result = countyDueDates[county];
		result.taxYear = taxYear;
		result.displayYear = `${taxYear}`;
		result.formattedDueDates = `${result.firstHalf.dueDate.split('/').slice(0, 2).join('/')} & ${result.secondHalf.dueDate.split('/').slice(0, 2).join('/')}`;

		const now = new Date();
		const firstDueDate = new Date(result.firstHalf.dueDate);
		const secondDueDate = new Date(result.secondHalf.dueDate);
		result.currentPeriod = now < firstDueDate ? 'First Half' :
			now < secondDueDate ? 'Second Half' : 'Past Due';

		return result;
	} catch (error) {
		console.error('Error in calculateDueDates:', error);
		throw error;
	}
};

const parseCurrency = (str) => {
	if (!str) return 0;
	const cleaned = str.toString().replace(/[^0-9.-]+/g, "");
	return parseFloat(cleaned) || 0;
};

const formatCurrency = (val) => {
	const num = parseFloat(val) || 0;
	return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const mc_1 = (page, account) => {
	return new Promise((resolve, reject) => {
		const url = `https://auditor.mercercountyohio.gov/Parcel?Parcel=${account}`;
		page.goto(url, { waitUntil: "domcontentloaded" })
			.then(() => page.$('#Location'))
			.then(pageContentExists => {
				if (!pageContentExists) {
					return resolve("NOT_FOUND");
				}
				page.waitForSelector('#TaxBills')
					.then(() => resolve("OK"))
					.catch(reject);
			})
			.catch(reject);
	});
};

const mc_2 = (page, account) => {
	return page.evaluate(() => {
		const datum = {
			processed_date: new Date().toISOString().split("T")[0],
			order_number: "",
			borrower_name: "",
			owner_name: [],
			property_address: "",
			parcel_number: "",
			land_value: "N/A",
			improvements: "N/A",
			total_assessed_value: "N/A",
			exemption: "N/A",
			total_taxable_value: "N/A",
			taxing_authority: "Mercer County Auditor, 220 W Livingston St, Celina, OH 45822, Ph: (419) 586-7711",
			notes: "",
			delinquent: "",
			tax_history: [],
			payment_history: []
		};

		const findTableValue = (tableId, rowIndex, selector) => {
			const table = document.querySelector(`#${tableId} .table`);
			if (!table) return "N/A";
			const row = table.querySelector(`tr:nth-child(${rowIndex})`);
			return row?.querySelector(selector)?.textContent.trim() ?? "N/A";
		};

		datum.owner_name[0] = findTableValue('Location', 2, '.TableValue');
		datum.property_address = findTableValue('Location', 3, '.TableValue');

		const valuationTable = document.querySelector('table[title="Valuation"]');
		if (valuationTable) {
			const dataRow = valuationTable.querySelector('tbody tr:first-child');
			if (dataRow) {
				const cells = dataRow.querySelectorAll('td');
				if (cells.length >= 7) {
					datum.land_value = cells[4]?.textContent.trim() ?? "N/A";
					datum.improvements = cells[5]?.textContent.trim() ?? "N/A";
					datum.total_assessed_value = cells[6]?.textContent.trim() ?? "N/A";
					datum.total_taxable_value = datum.total_assessed_value;
				}
			}
		}
		return datum;
	}).then(data => ({ data }));
};

const mc_not_found = (account) => {
	return Promise.resolve({
		processed_date: new Date().toISOString().split("T")[0],
		order_number: "",
		borrower_name: "Invalid Parcel ID",
		owner_name: ["Invalid Parcel ID"],
		property_address: "Invalid Parcel ID",
		parcel_number: account,
		land_value: "N/A",
		improvements: "N/A",
		total_assessed_value: "N/A",
		exemption: "N/A",
		total_taxable_value: "N/A",
		taxing_authority: "Mercer County Auditor, 220 W Livingston St, Celina, OH 45822, Ph: (419) 586-7711",
		notes: "Parcel not found on the website.",
		delinquent: "N/A",
		tax_history: [],
		payment_history: []
	});
};

const mc_no_tax_history = (bundle) => {
	bundle.data.tax_history = [];
	bundle.data.notes = "Tax history and current taxes are not available on the website.";
	bundle.data.delinquent = "N/A";
	return Promise.resolve(bundle.data);
};

const scrapeTaxBills = (page) => {
	return page.evaluate(() => {
		const parseCurrency = (str) => {
			if (!str) return 0;
			const cleaned = str.toString().replace(/[^0-9.-]+/g, "");
			return parseFloat(cleaned) || 0;
		};

		const taxHistory = [];
		const taxTabs = document.querySelectorAll('#taxBill-tabs .nav-link');

		taxTabs.forEach(tab => {
			const taxYearText = tab.textContent.trim();
			const yearMatch = taxYearText.match(/(\d{4}) Payable (\d{4})/);
			if (!yearMatch) return;

			const taxYear = yearMatch[1];
			const payableYear = parseInt(yearMatch[2]);

			const tabTarget = tab.getAttribute('data-target');
			if (!tabTarget) return;

			const tabPane = document.querySelector(tabTarget);
			if (!tabPane) return;

			// Find "Taxes Billed" and "Owed" rows
			const billedRow = Array.from(tabPane.querySelectorAll('tr')).find(row => {
				const firstCell = row.querySelector('td');
				return firstCell && firstCell.textContent.trim() === 'Taxes Billed';
			});

			const owedRow = tabPane.querySelector('tr.bg-gradient-warning');

			if (billedRow && owedRow) {
				// Get all td elements from each row
				const billedCells = Array.from(billedRow.querySelectorAll('td'));
				const owedCells = Array.from(owedRow.querySelectorAll('td'));

				// Based on HTML structure: [label, empty, firstHalf, secondHalf, total]
				// So we need indices 2, 3, 4
				const firstHalfBilled = parseCurrency(billedCells[2]?.textContent);
				const secondHalfBilled = parseCurrency(billedCells[3]?.textContent);
				const totalBilled = parseCurrency(billedCells[4]?.textContent);
				const firstHalfOwed = parseCurrency(owedCells[2]?.textContent);
				const secondHalfOwed = parseCurrency(owedCells[3]?.textContent);
				const totalOwed = parseCurrency(owedCells[4]?.textContent);

				taxHistory.push({
					year: taxYear,
					payable_year: payableYear,
					base_amount: totalBilled,
					amount_due: totalOwed,
					amount_paid: Math.max(0, totalBilled - totalOwed),
					first_half_billed: firstHalfBilled,
					second_half_billed: secondHalfBilled,
					first_half_owed: firstHalfOwed,
					second_half_owed: secondHalfOwed,
					first_half_paid: Math.max(0, firstHalfBilled - firstHalfOwed),
					second_half_paid: Math.max(0, secondHalfBilled - secondHalfOwed),
					payments: []
				});
			}
		});

		return taxHistory.sort((a, b) => parseInt(b.payable_year) - parseInt(a.payable_year));
	});
};

const scrapePaymentHistory = (page) => {
	return page.evaluate(() => {
		const parseCurrency = (str) => {
			if (!str) return 0;
			const cleaned = str.toString().replace(/[^0-9.-]+/g, "");
			return parseFloat(cleaned) || 0;
		};

		const payments = [];
		const paymentsTable = document.querySelector('table.sortableTable[title="Tax Payments"] tbody');

		if (paymentsTable) {
			paymentsTable.querySelectorAll('tr').forEach(row => {
				const cells = row.querySelectorAll('td');
				if (cells.length >= 3) {
					const amount = parseCurrency(cells[2]?.textContent);
					if (amount > 0) {
						payments.push({
							date: cells[0]?.textContent.trim(),
							receipt_number: cells[1]?.textContent.trim(),
							amount: amount
						});
					}
				}
			});
		}

		return payments.sort((a, b) => new Date(a.date) - new Date(b.date));
	});
};

const account_search = (page, account) => {
	return mc_1(page, account)
		.then(pageStatus => {
			if (pageStatus === "NOT_FOUND") {
				return mc_not_found(account);
			}
			return mc_2(page, account)
				.then(bundle => Promise.all([scrapeTaxBills(page), scrapePaymentHistory(page)])
					.then(([taxBills, paymentHistory]) => {
						if (taxBills.length === 0) {
							return mc_no_tax_history(bundle);
						}

						// Map payments to tax bills
						const payableYearMap = taxBills.reduce((acc, bill) => {
							acc[bill.payable_year] = bill;
							return acc;
						}, {});

						// Associate payments with the correct half-year and bill
						paymentHistory.forEach(payment => {
							const date = new Date(payment.date);
							const year = date.getFullYear();
							const month = date.getMonth();
							let payableYear;

							// Determine payable year based on payment date.
							// Payments made in the first half of the year are for the current payable year.
							// Payments made in the second half of the year are also for the current payable year.
							// We can simply use the payment year for a 1:1 match with the tax bill payable year.
							payableYear = year;

							if (payableYearMap[payableYear]) {
								const bill = payableYearMap[payableYear];
								const amountTolerance = 1.0;

								// New, more robust logic for semi-annual payments
								// Since amounts for both halves can be the same, we check the date against the due dates.
								const dueDates = calculateDueDates(payableYear);
								const paymentDate = new Date(payment.date);
								const firstHalfDueDate = new Date(dueDates.firstHalf.dueDate);
								const secondHalfDueDate = new Date(dueDates.secondHalf.dueDate);

								const isAnnual = Math.abs(payment.amount - bill.base_amount) <= amountTolerance;
								const isFirstHalfPayment = Math.abs(payment.amount - bill.first_half_billed) <= amountTolerance && paymentDate <= firstHalfDueDate;
								const isSecondHalfPayment = Math.abs(payment.amount - bill.second_half_billed) <= amountTolerance && paymentDate > firstHalfDueDate && paymentDate <= secondHalfDueDate;

								if (isAnnual) {
									bill.payments.push({ ...payment, halfType: 'Annual' });
								} else if (isFirstHalfPayment) {
									bill.payments.push({ ...payment, halfType: '1st Half' });
								} else if (isSecondHalfPayment) {
									bill.payments.push({ ...payment, halfType: '2nd Half' });
								}
							}
						});

						// NEW APPROACH: Check for any unpaid amounts across all years/halves
						const allUnpaidEntries = [];

						taxBills.forEach(bill => {
							const dueDates = calculateDueDates(bill.payable_year);

							// Check first half
							if (bill.first_half_owed > 0.01) {
								allUnpaidEntries.push({
									jurisdiction: "County",
									year: bill.year,
									payable_year: bill.payable_year,
									status: "Unpaid",
									base_amount: formatCurrency(bill.first_half_billed),
									amount_paid: formatCurrency(0),
									amount_due: formatCurrency(bill.first_half_owed),
									payment_type: "1st Half Unpaid",
									due_date: dueDates.firstHalf.dueDate,
									delq_date: dueDates.firstHalf.delqDate
								});
							}

							// Check second half
							if (bill.second_half_owed > 0.01) {
								allUnpaidEntries.push({
									jurisdiction: "County",
									year: bill.year,
									payable_year: bill.payable_year,
									status: "Unpaid",
									base_amount: formatCurrency(bill.second_half_billed),
									amount_paid: formatCurrency(0),
									amount_due: formatCurrency(bill.second_half_owed),
									payment_type: "2nd Half Unpaid",
									due_date: dueDates.secondHalf.dueDate,
									delq_date: dueDates.secondHalf.delqDate
								});
							}
						});

						let processedTaxHistory = [];

						if (allUnpaidEntries.length > 0) {
							// UNPAID SCENARIO: Show all unpaid entries
							processedTaxHistory = allUnpaidEntries;
						} else {
							// PAID SCENARIO: Show only latest year
							if (taxBills.length > 0) {
								const latestBill = taxBills[0];
								const dueDates = calculateDueDates(latestBill.payable_year);

								// Determine payment pattern for latest year
								const paymentsForLatest = latestBill.payments;

								const annualPayment = paymentsForLatest.find(p => p.halfType === 'Annual');

								if (annualPayment) {
									processedTaxHistory.push({
										jurisdiction: "County",
										year: latestBill.year,
										payable_year: latestBill.payable_year,
										status: "Paid",
										base_amount: formatCurrency(latestBill.base_amount),
										amount_paid: formatCurrency(latestBill.amount_paid),
										amount_due: formatCurrency(0),
										paid_date: annualPayment.date,
										payment_type: "Annual",
										due_date: dueDates.firstHalf.dueDate,
										delq_date: dueDates.firstHalf.delqDate
									});
								} else {
									const firstHalfPayment = paymentsForLatest.find(p => p.halfType === '1st Half');
									const secondHalfPayment = paymentsForLatest.find(p => p.halfType === '2nd Half');

									if (latestBill.first_half_billed > 0) {
										processedTaxHistory.push({
											jurisdiction: "County",
											year: latestBill.year,
											payable_year: latestBill.payable_year,
											status: "Paid",
											base_amount: formatCurrency(latestBill.first_half_billed),
											amount_paid: formatCurrency(latestBill.first_half_paid),
											amount_due: formatCurrency(latestBill.first_half_owed),
											payment_type: "Semi-Annual (1st Half)",
											due_date: dueDates.firstHalf.dueDate,
											delq_date: dueDates.firstHalf.delqDate,
											paid_date: firstHalfPayment ? firstHalfPayment.date : null
										});
									}
									if (latestBill.second_half_billed > 0) {
										processedTaxHistory.push({
											jurisdiction: "County",
											year: latestBill.year,
											payable_year: latestBill.payable_year,
											status: "Paid",
											base_amount: formatCurrency(latestBill.second_half_billed),
											amount_paid: formatCurrency(latestBill.second_half_paid),
											amount_due: formatCurrency(latestBill.second_half_owed),
											payment_type: "Semi-Annual (2nd Half)",
											due_date: dueDates.secondHalf.dueDate,
											delq_date: dueDates.secondHalf.delqDate,
											paid_date: secondHalfPayment ? secondHalfPayment.date : null
										});
									}
								}
							}
						}

						processedTaxHistory.sort((a, b) => {
							if (a.payable_year !== b.payable_year) {
								return parseInt(b.payable_year) - parseInt(a.payable_year);
							}
							if (a.payment_type.includes('1st Half') && b.payment_type.includes('2nd Half')) {
								return -1;
							}
							if (a.payment_type.includes('2nd Half') && b.payment_type.includes('1st Half')) {
								return 1;
							}
							return 0;
						});

						const hasUnpaid = allUnpaidEntries.length > 0;

						bundle.data.tax_history = processedTaxHistory;
						bundle.data.payment_history = paymentHistory;
						bundle.data.delinquent = hasUnpaid ? "YES" : "NONE";
						bundle.data.notes = hasUnpaid ? "DELINQUENT TAXES ARE DUE." : "ALL TAXES ARE PAID.";

						const dates = calculateDueDates(getCurrentTaxYear());
						bundle.data.notes += ` NORMALLY TAXES ARE PAID SEMI-ANNUALLY, NORMAL DUE DATES ARE ${dates.formattedDueDates}`;

						return bundle.data;
					})
				);
		});
};

const retryable_scrape = (page, account, maxRetries = 3, retries = 0) => {
	return account_search(page, account)
		.catch(error => {
			console.error(`Scraping attempt ${retries + 1} failed for account ${account}:`, error);
			if (retries >= maxRetries - 1) {
				return Promise.reject(error);
			}
			return new Promise(resolve => setTimeout(resolve, 2000 * (retries + 1)))
				.then(() => retryable_scrape(page, account, maxRetries, retries + 1));
		});
};

const search = (req, res) => {
	const { fetch_type, account } = req.body;
	let context = null;

	if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
		return res.status(200).render("error_data", {
			error: true,
			message: "Invalid Access"
		});
	}

	getBrowserInstance()
		.then(browser => browser.createBrowserContext())
		.then(c => {
			context = c;
			return context.newPage();
		})
		.then(page => {
			page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36");
			page.setDefaultNavigationTimeout(90000);
			return page.setRequestInterception(true)
				.then(() => {
					page.on("request", (reqInt) => {
						if (["stylesheet", "font", "image", "script", "media"].includes(reqInt.resourceType())) {
							reqInt.abort();
						} else {
							reqInt.continue();
						}
					});
					return page;
				});
		})
		.then(page => retryable_scrape(page, account))
		.then(data => {
			if (fetch_type === "html") {
				res.status(200).render("parcel_data_official", data);
			} else if (fetch_type === "api") {
				res.status(200).json({ result: data });
			}
		})
		.catch(error => {
			console.error(error);
			const errorMessage = error.message || "An unexpected error occurred during the scraping process.";
			if (fetch_type === "html") {
				res.status(200).render('error_data', { error: true, message: errorMessage });
			} else if (fetch_type === "api") {
				res.status(500).json({ error: true, message: errorMessage });
			}
		})
		.finally(() => {
			if (context) {
				context.close();
			}
		});
};

export { search };
