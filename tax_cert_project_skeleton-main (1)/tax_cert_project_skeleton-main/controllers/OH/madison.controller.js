// Nithyananda R S - Madison County Only (COMPLETE FIXED VERSION)
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// Utility function to validate and format dates
const formatDate = (month, day, year) => {
	const date = new Date(year, month - 1, day);
	const isValidDate = date && date.getMonth() === month - 1 && date.getDate() === day;
	if (!isValidDate) {
		throw new Error(`Invalid date: ${month}/${day}/${year}`);
	}
	return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
};

// Utility function for currency formatting
const formatCurrency = (str) =>
	str ? `$${parseFloat(str.replace(/[^0-9.-]+/g, "")).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";

// Madison County due date calculator - now requires year
const calculateDueDates = (year) => {
	try {
		const payableYear = parseInt(year);
		if (isNaN(payableYear) || payableYear < 2000 || payableYear > 2100) {
			throw new Error('Invalid payable year');
		}

		const madisonDueDates = {
			firstHalf: {
				dueDate: formatDate(2, 14, payableYear),
				delqDate: formatDate(2, 15, payableYear),
				period: 'First Half'
			},
			secondHalf: {
				dueDate: formatDate(7, 14, payableYear),
				delqDate: formatDate(7, 15, payableYear),
				period: 'Second Half'
			},
			paymentTypes: ['Annual', 'Semi-Annual'],
			defaultPaymentType: 'Semi-Annual'
		};

		const result = madisonDueDates;
		result.payableYear = payableYear;
		result.formattedDueDates = `${result.firstHalf.dueDate.split('/').slice(0, 2).join('/')} & ${result.secondHalf.dueDate.split('/').slice(0, 2).join('/')}`;

		return result;
	} catch (error) {
		console.error('Error in calculateDueDates:', error);
		throw error;
	}
};

// ====================================================================================================
// MADISON COUNTY SCRAPING LOGIC - COMPLETE FIXED VERSION
// ====================================================================================================

const madison_1 = async (page, account) => {
	const url = `https://auditor.co.madison.oh.us/Parcel?Parcel=${account}`;
	await page.goto(url, { waitUntil: "domcontentloaded" });

	// Check if parcel exists by looking for Location section
	const pageContentExists = await page.$('#Location');
	if (!pageContentExists) {
		console.log(`DEBUG: #Location not found for account ${account}`);
		return {status: "NOT_FOUND", tabText: '', allTabs: []};
	}

	await page.waitForSelector('#Location');

	// Wait for tax section to load
	try {
		await page.waitForSelector('#TaxBills', { timeout: 10000 });
	} catch (error) {
		console.log(`DEBUG: #TaxBills not found for account ${account}`);
		return {status: "NO_TAX_HISTORY", tabText: '', allTabs: []};
	}

	return page.evaluate(() => {
		console.log('DEBUG: Starting payment status evaluation');

		// Check if tax tabs exist
		const taxTabs = document.querySelector('#taxBill-tabs');
		if (!taxTabs) {
			console.log('DEBUG: Tax tabs not found');
			return {status: "NO_TAX_HISTORY", tabText: '', allTabs: []};
		}

		// Get all tax year tabs
		const allTabElements = document.querySelectorAll('#taxBill-tabs .nav-link');
		const allTabs = Array.from(allTabElements).map(tab => ({
			text: tab.textContent.trim(),
			id: tab.getAttribute('href') || tab.getAttribute('data-bs-target') || '',
			element: tab
		}));

		// Get the active tab
		const activeTab = document.querySelector('#taxBill-tabs .nav-link.active');
		const tabText = activeTab ? activeTab.textContent.trim() : '';
		if (!activeTab) {
			console.log('DEBUG: Active tab not found');
			return {status: "NO_TAX_HISTORY", tabText, allTabs};
		}

		console.log('DEBUG: Active tab text:', tabText);
		console.log('DEBUG: All tabs:', allTabs.map(t => t.text));

		// Find the active tab pane
		const activeTabPane = document.querySelector('#taxBill-content .tab-pane.active');
		if (!activeTabPane) {
			console.log('DEBUG: Active tab pane not found');
			return {status: "NO_TAX_HISTORY", tabText, allTabs};
		}

		// Find all rows in the active tab
		const allRows = Array.from(activeTabPane.querySelectorAll('tr'));
		console.log('DEBUG: Found', allRows.length, 'rows in active tab');

		// Look for NET DUE row
		const netDueRow = allRows.find(row => {
			const text = row.textContent.toLowerCase();
			return text.includes('net due');
		});

		if (!netDueRow) {
			console.log('DEBUG: NET DUE row not found');
			return {status: "NO_TAX_HISTORY", tabText, allTabs};
		}

		const netDueCells = netDueRow.querySelectorAll('td');
		if (netDueCells.length < 4) {
			console.log('DEBUG: Not enough cells in NET DUE row');
			return {status: "NO_TAX_HISTORY", tabText, allTabs};
		}

		// Extract amounts from cells (index 2 = first half, index 3 = second half)
		const firstHalfDueText = netDueCells[2]?.textContent.trim() || "$0.00";
		const secondHalfDueText = netDueCells[3]?.textContent.trim() || "$0.00";

		const firstHalfDue = parseFloat(firstHalfDueText.replace(/[^0-9.-]+/g, "")) || 0;
		const secondHalfDue = parseFloat(secondHalfDueText.replace(/[^0-9.-]+/g, "")) || 0;

		let status;
		if (firstHalfDue === 0 && secondHalfDue === 0) {
			status = "PAID";
		} else if (firstHalfDue === 0 && secondHalfDue > 0) {
			status = "PARTIAL";
		} else {
			status = "UNPAID";
		}
		console.log('DEBUG: Status =', status);

		return {status, tabText, allTabs};
	});
};

const madison_2 = async (page, account) => {
	return await page.evaluate(() => {
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
			taxing_authority: "Madison County Auditor, 1 N. Main St., London, OH 43140, Ph: 740-852-9446",
			notes: "",
			delinquent: "",
			tax_history: []
		};

		// Extract owner name, address, and parcel info from Location section
		const locationTable = document.querySelector('#Location .table');
		if (locationTable) {
			const rows = locationTable.querySelectorAll('tr');
			rows.forEach((row) => {
				const titleCell = row.querySelector('.tableTitle');
				const valueCell = row.querySelector('.TableValue');

				if (titleCell && valueCell) {
					const title = titleCell.textContent.trim().toLowerCase();
					const value = valueCell.textContent.trim();

					if (title.includes('owner')) {
						datum.owner_name[0] = value;
					} else if (title.includes('address')) {
						datum.property_address = value;
					} else if (title.includes('parcel')) {
						datum.parcel_number = value;
					}
				}
			});
		}

		// Valuation table with fallbacks
		let valuationTable = document.querySelector('#Valuation .table-responsive .table') || 
			document.querySelector('#Valuation .table') || 
			document.querySelector('[id*="Valuation"] table');

		if (!valuationTable) {
			const allTables = document.querySelectorAll('table');
			for (let table of allTables) {
				const tableText = table.textContent.toLowerCase();
				if (tableText.includes('land') && tableText.includes('improvement')) {
					valuationTable = table;
					break;
				}
			}
		}

		if (valuationTable) {
			const firstDataRow = valuationTable.querySelector('tbody tr');
			if (firstDataRow) {
				const cells = firstDataRow.querySelectorAll('td');
				if (cells.length >= 7) {
					datum.land_value = cells[1]?.textContent.trim() ?? "N/A";
					datum.improvements = cells[2]?.textContent.trim() ?? "N/A";
					datum.total_assessed_value = cells[6]?.textContent.trim() ?? "N/A";
					datum.total_taxable_value = datum.total_assessed_value;
				}
			}
		}

		return datum;
	});
};

const madison_not_found = (account) => {
	return {
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
		taxing_authority: "Madison County Auditor, 1 N. Main St., London, OH 43140, Ph: 740-852-9446",
		notes: "Parcel not found on the website.",
		delinquent: "N/A",
		tax_history: []
	};
};

const madison_no_tax_history = (data) => {
	data.tax_history = [];
	data.notes = "Tax history and current taxes are not available on the website.";
	data.delinquent = "N/A";
	return data;
};

// Helper function to extract tax data from a specific tab
const extractTaxDataFromTab = async (page, tabId, assessmentYear, payableYear) => {
	return await page.evaluate((tabId, assessmentYear, payableYear) => {
		console.log(`DEBUG: Extracting data from tab: ${tabId} for years ${assessmentYear}/${payableYear}`);

		const formatCurrency = (str) =>
			str ? `$${parseFloat(str.replace(/[^0-9.-]+/g, "")).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";

		const history = [];
		
		// Find the tab pane by ID
		let tabPane = document.querySelector(tabId);
		if (!tabPane && tabId.startsWith('#')) {
			// Try without the #
			tabPane = document.querySelector(tabId.substring(1));
		}
		if (!tabPane) {
			// Try to find by partial match
			const allTabPanes = document.querySelectorAll('.tab-pane');
			for (let pane of allTabPanes) {
				if (pane.id && tabId.includes(pane.id)) {
					tabPane = pane;
					break;
				}
			}
		}

		if (!tabPane) {
			console.log(`DEBUG: Could not find tab pane for ${tabId}`);
			return [];
		}

		const allRows = Array.from(tabPane.querySelectorAll('tr'));
		const netTaxRow = allRows.find(row => row.textContent.toLowerCase().includes('net tax'));
		const netDueRow = allRows.find(row => row.textContent.toLowerCase().includes('net due'));

		if (netTaxRow && netDueRow) {
			const taxCells = netTaxRow.querySelectorAll('td');
			const dueCells = netDueRow.querySelectorAll('td');

			if (taxCells.length >= 4 && dueCells.length >= 4) {
				const firstHalfTaxText = taxCells[2]?.textContent.trim() || "$0.00";
				const secondHalfTaxText = taxCells[3]?.textContent.trim() || "$0.00";
				const firstHalfDueText = dueCells[2]?.textContent.trim() || "$0.00";
				const secondHalfDueText = dueCells[3]?.textContent.trim() || "$0.00";

				const firstHalfTax = formatCurrency(firstHalfTaxText);
				const secondHalfTax = formatCurrency(secondHalfTaxText);
				const firstHalfDue = parseFloat(firstHalfDueText.replace(/[^0-9.-]+/g, "")) || 0;
				const secondHalfDue = parseFloat(secondHalfDueText.replace(/[^0-9.-]+/g, "")) || 0;

				// Add first half if there's an amount due
				if (firstHalfDue > 0) {
					history.push({
						jurisdiction: "County",
						year: assessmentYear.toString(),
						payment_type: "First Installment",
						status: "Unpaid",
						base_amount: firstHalfTax,
						amount_paid: "$0.00",
						amount_due: formatCurrency(firstHalfDueText),
						mailing_date: "N/A",
						due_date: `02/14/${payableYear}`,
						delq_date: `02/15/${payableYear}`,
						paid_date: "",
						good_through_date: ""
					});
				}

				// Add second half if there's an amount due
				if (secondHalfDue > 0) {
					history.push({
						jurisdiction: "County",
						year: assessmentYear.toString(),
						payment_type: "Second Installment",
						status: "Unpaid",
						base_amount: secondHalfTax,
						amount_paid: "$0.00",
						amount_due: formatCurrency(secondHalfDueText),
						mailing_date: "N/A",
						due_date: `07/14/${payableYear}`,
						delq_date: `07/15/${payableYear}`,
						paid_date: "",
						good_through_date: ""
					});
				}
			}
		}

		console.log(`DEBUG: Extracted ${history.length} unpaid entries from tab ${tabId}`);
		return history;
	}, tabId, assessmentYear, payableYear);
};

// Helper function to click a tab and wait for it to load
const clickTabAndWait = async (page, tabElement) => {
	await page.evaluate((tab) => {
		tab.click();
	}, tabElement);
	
	// Wait a moment for the tab content to load
	await page.waitForTimeout(1000);
};

const madison_paid = async (page, data, assessmentYear, payableYear, dates) => {
	const taxHistory = await page.evaluate((assessmentYear, payableYear) => {
		console.log('DEBUG: Starting madison_paid extraction');

		const formatCurrency = (str) =>
			str ? `$${parseFloat(str.replace(/[^0-9.-]+/g, "")).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";

		const history = [];

		// Get the active tab pane
		const activeTabPane = document.querySelector('#taxBill-content .tab-pane.active');
		if (!activeTabPane) {
			return [];
		}

		const allRows = Array.from(activeTabPane.querySelectorAll('tr'));
		const netTaxRow = allRows.find(row => row.textContent.toLowerCase().includes('net tax'));
		const netPaidRow = allRows.find(row => row.textContent.toLowerCase().includes('net paid'));

		let firstHalfAmount = "$0.00";
		let secondHalfAmount = "$0.00";
		let firstHalfPaid = 0;
		let secondHalfPaid = 0;

		if (netTaxRow) {
			const cells = netTaxRow.querySelectorAll('td');
			if (cells.length >= 4) {
				firstHalfAmount = formatCurrency(cells[2]?.textContent.trim());
				secondHalfAmount = formatCurrency(cells[3]?.textContent.trim());
			}
		}

		if (netPaidRow) {
			const paidCells = netPaidRow.querySelectorAll('td');
			if (paidCells.length >= 4) {
				firstHalfPaid = Math.abs(parseFloat(paidCells[2]?.textContent.trim().replace(/[^0-9.-]+/g, "")) || 0);
				secondHalfPaid = Math.abs(parseFloat(paidCells[3]?.textContent.trim().replace(/[^0-9.-]+/g, "")) || 0);
			}
		}

		// Payments table with fallbacks
		let paymentsTable = document.querySelector('#TaxPayments .table') ||
			document.querySelector('#TaxPayments table') ||
			document.querySelector('[id*="TaxPayment"] table') ||
			document.querySelector('[id*="Payment"] table');

		if (!paymentsTable) {
			const allTables = document.querySelectorAll('table');
			for (let table of allTables) {
				const tableText = table.textContent.toLowerCase();
				if (tableText.includes('payment') && tableText.includes('date')) {
					paymentsTable = table;
					break;
				}
			}
		}

		const currentYearPayments = [];
		if (paymentsTable) {
			const paymentRows = paymentsTable.querySelectorAll('tbody tr');
			paymentRows.forEach((row) => {
				const paymentCells = row.querySelectorAll('td');
				if (paymentCells.length >= 2) {
					const paymentDate = paymentCells[0].textContent.trim();
					const amount = paymentCells[1].textContent.trim();
					try {
						const paymentYear = new Date(paymentDate).getFullYear();
						if (paymentYear === payableYear) {
							const paymentMonth = new Date(paymentDate).getMonth() + 1;
							currentYearPayments.push({
								date: paymentDate,
								amount: formatCurrency(amount),
								month: paymentMonth,
								isFirstHalf: paymentMonth <= 6
							});
						}
					} catch (e) {}
				}
			});
		}

		// Determine payment pattern
		if (currentYearPayments.length === 1) {
			// Annual
			history.push({
				jurisdiction: "County",
				year: assessmentYear.toString(),
				payment_type: "Annual",
				status: "Paid",
				base_amount: formatCurrency((parseFloat(firstHalfAmount.replace(/[^0-9.-]+/g, "")) + parseFloat(secondHalfAmount.replace(/[^0-9.-]+/g, ""))).toString()),
				amount_paid: formatCurrency((firstHalfPaid + secondHalfPaid).toString()),
				amount_due: "$0.00",
				mailing_date: "N/A",
				due_date: `02/14/${payableYear}`,
				delq_date: `02/15/${payableYear}`,
				paid_date: currentYearPayments[0]?.date || "Payment Date Not Available",
				good_through_date: ""
			});
		} else if (currentYearPayments.length >= 2) {
			// Semi-annual
			currentYearPayments.sort((a, b) => new Date(a.date) - new Date(b.date));
			const firstHalfPayment = currentYearPayments.find(p => p.isFirstHalf) || currentYearPayments[0];
			const secondHalfPayment = currentYearPayments.find(p => !p.isFirstHalf) || currentYearPayments[1];

			history.push({
				jurisdiction: "County",
				year: assessmentYear.toString(),
				payment_type: "Semi-Annual",
				status: "Paid",
				base_amount: firstHalfAmount,
				amount_paid: formatCurrency(firstHalfPaid.toString()),
				amount_due: "$0.00",
				mailing_date: "N/A",
				due_date: `02/14/${payableYear}`,
				delq_date: `02/15/${payableYear}`,
				paid_date: firstHalfPayment?.date || "Payment Date Not Available",
				good_through_date: ""
			});

			history.push({
				jurisdiction: "County",
				year: assessmentYear.toString(),
				payment_type: "Semi-Annual",
				status: "Paid",
				base_amount: secondHalfAmount,
				amount_paid: formatCurrency(secondHalfPaid.toString()),
				amount_due: "$0.00",
				mailing_date: "N/A",
				due_date: `07/14/${payableYear}`,
				delq_date: `07/15/${payableYear}`,
				paid_date: secondHalfPayment?.date || "Payment Date Not Available",
				good_through_date: ""
			});
		} else {
			// Fallback
			if (parseFloat(firstHalfAmount.replace(/[^0-9.-]+/g, "")) > 0) {
				history.push({
					jurisdiction: "County",
					year: assessmentYear.toString(),
					payment_type: "First Installment",
					status: "Paid",
					base_amount: firstHalfAmount,
					amount_paid: formatCurrency(firstHalfPaid.toString() || firstHalfAmount.replace('$', '')),
					amount_due: "$0.00",
					mailing_date: "N/A",
					due_date: `02/14/${payableYear}`,
					delq_date: `02/15/${payableYear}`,
					paid_date: "Payment Date Not Available",
					good_through_date: ""
				});

				history.push({
					jurisdiction: "County",
					year: assessmentYear.toString(),
					payment_type: "Second Installment",
					status: "Paid",
					base_amount: secondHalfAmount,
					amount_paid: formatCurrency(secondHalfPaid.toString() || secondHalfAmount.replace('$', '')),
					amount_due: "$0.00",
					mailing_date: "N/A",
					due_date: `07/14/${payableYear}`,
					delq_date: `07/15/${payableYear}`,
					paid_date: "Payment Date Not Available",
					good_through_date: ""
				});
			}
		}

		return history;
	}, assessmentYear, payableYear);

	data.tax_history = taxHistory;
	const paymentType = taxHistory.length === 1 ? "Annual" : "Semi-Annual";
	data.notes = `ALL PRIORS ARE PAID, ${assessmentYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID ${paymentType.toUpperCase()}, NORMAL DUE DATES ARE ${dates.formattedDueDates}`;
	data.delinquent = "NONE";

	return data;
};

const madison_partial = async (page, data, assessmentYear, payableYear, dates) => {
	const taxHistory = await page.evaluate((assessmentYear, payableYear) => {
		console.log('DEBUG: Starting madison_partial extraction');

		const formatCurrency = (str) =>
			str ? `$${parseFloat(str.replace(/[^0-9.-]+/g, "")).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";

		const history = [];

		const activeTabPane = document.querySelector('#taxBill-content .tab-pane.active');
		if (!activeTabPane) {
			return [];
		}

		const allRows = Array.from(activeTabPane.querySelectorAll('tr'));
		const netTaxRow = allRows.find(row => row.textContent.toLowerCase().includes('net tax'));
		const netDueRow = allRows.find(row => row.textContent.toLowerCase().includes('net due'));
		const netPaidRow = allRows.find(row => row.textContent.toLowerCase().includes('net paid'));

		if (netTaxRow && netDueRow) {
			const taxCells = netTaxRow.querySelectorAll('td');
			const dueCells = netDueRow.querySelectorAll('td');
			let paidCells;
			if (netPaidRow) {
				paidCells = netPaidRow.querySelectorAll('td');
			}

			if (taxCells.length >= 4 && dueCells.length >= 4) {
				const firstHalfTaxText = taxCells[2]?.textContent.trim() || "$0.00";
				const secondHalfTaxText = taxCells[3]?.textContent.trim() || "$0.00";
				const firstHalfDueText = dueCells[2]?.textContent.trim() || "$0.00";
				const secondHalfDueText = dueCells[3]?.textContent.trim() || "$0.00";

				const firstHalfTax = formatCurrency(firstHalfTaxText);
				const secondHalfTax = formatCurrency(secondHalfTaxText);
				const firstHalfDue = parseFloat(firstHalfDueText.replace(/[^0-9.-]+/g, "")) || 0;
				const secondHalfDue = parseFloat(secondHalfDueText.replace(/[^0-9.-]+/g, "")) || 0;

				// Get paid amounts if available
				let firstHalfPaidText = paidCells ? paidCells[2]?.textContent.trim() || "$0.00" : firstHalfTaxText;
				let firstHalfAmountPaid = formatCurrency( Math.abs( parseFloat(firstHalfPaidText.replace(/[^0-9.-]+/g, "")) ).toString() );

				// Get payment date for first half
				let firstHalfPaidDate = "Payment Date Not Available";

				let paymentsTable = document.querySelector('#TaxPayments .table') ||
					document.querySelector('#TaxPayments table') ||
					document.querySelector('[id*="Payment"] table');

				if (!paymentsTable) {
					const allTables = document.querySelectorAll('table');
					for (let table of allTables) {
						const tableText = table.textContent.toLowerCase();
						if (tableText.includes('payment') && tableText.includes('date')) {
							paymentsTable = table;
							break;
						}
					}
				}

				if (paymentsTable) {
					const paymentRows = paymentsTable.querySelectorAll('tbody tr');
					paymentRows.forEach(row => {
						const paymentCells = row.querySelectorAll('td');
						if (paymentCells.length >= 2) {
							const paymentDate = paymentCells[0].textContent.trim();
							try {
								const paymentYear = new Date(paymentDate).getFullYear();
								const paymentMonth = new Date(paymentDate).getMonth() + 1;
								if (paymentYear === payableYear && paymentMonth <= 6) {
									firstHalfPaidDate = paymentDate;
								}
							} catch (e) {}
						}
					});
				}

				// First half (paid)
				if (firstHalfDue === 0) {
					history.push({
						jurisdiction: "County",
						year: assessmentYear.toString(),
						payment_type: "First Installment",
						status: "Paid",
						base_amount: firstHalfTax,
						amount_paid: firstHalfAmountPaid,
						amount_due: "$0.00",
						mailing_date: "N/A",
						due_date: `02/14/${payableYear}`,
						delq_date: `02/15/${payableYear}`,
						paid_date: firstHalfPaidDate,
						good_through_date: ""
					});
				}

				// Second half (unpaid)
				if (secondHalfDue > 0) {
					history.push({
						jurisdiction: "County",
						year: assessmentYear.toString(),
						payment_type: "Second Installment",
						status: "Unpaid",
						base_amount: secondHalfTax,
						amount_paid: "$0.00",
						amount_due: formatCurrency(secondHalfDueText),
						mailing_date: "N/A",
						due_date: `07/14/${payableYear}`,
						delq_date: `07/15/${payableYear}`,
						paid_date: "",
						good_through_date: ""
					});
				}
			}
		}

		return history;
	}, assessmentYear, payableYear);

	data.tax_history = taxHistory;
	data.notes = `${assessmentYear} TAXES ARE PARTIALLY PAID (FIRST HALF PAID, SECOND HALF DUE), NORMALLY TAXES ARE PAID ${dates.defaultPaymentType.toUpperCase()}, NORMAL DUE DATES ARE ${dates.formattedDueDates}`;
	data.delinquent = "YES";

	return data;
};

const madison_unpaid = async (page, data, allTabs) => {
	console.log('DEBUG: Starting madison_unpaid - processing all tabs for complete history');
	
	const allTaxHistory = [];
	const unpaidYears = [];
	
	// Process each tab to get complete unpaid history
	for (const tab of allTabs) {
		try {
			console.log(`DEBUG: Processing tab: ${tab.text}`);
			
			// Parse assessment and payable years from tab text
			let assessmentYear = new Date().getFullYear() - 1;
			let payableYear = new Date().getFullYear();
			
			if (tab.text && tab.text.includes('Payable')) {
				const parts = tab.text.split(' Payable ');
				if (parts.length === 2) {
					assessmentYear = parseInt(parts[0]);
					payableYear = parseInt(parts[1]);
				}
			}
			
			// Click the tab and wait for content to load
			await page.evaluate((tabText) => {
				const tabElements = document.querySelectorAll('#taxBill-tabs .nav-link');
				for (let tabEl of tabElements) {
					if (tabEl.textContent.trim() === tabText) {
						tabEl.click();
						return true;
					}
				}
				return false;
			}, tab.text);
			
			// Wait for tab content to load using Promise-based timeout
			await new Promise(resolve => setTimeout(resolve, 1500));
			
			// Wait for the tab pane to become active
			await page.waitForFunction(() => {
				const activePane = document.querySelector('#taxBill-content .tab-pane.active');
				return activePane !== null;
			}, { timeout: 5000 });
			
			// Extract tax data from this tab
			const tabTaxHistory = await page.evaluate((assessmentYear, payableYear) => {
				const formatCurrency = (str) =>
					str ? `${parseFloat(str.replace(/[^0-9.-]+/g, "")).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";

				const history = [];
				
				// Get the currently active tab pane
				const activeTabPane = document.querySelector('#taxBill-content .tab-pane.active');
				if (!activeTabPane) {
					console.log('DEBUG: No active tab pane found');
					return [];
				}

				const allRows = Array.from(activeTabPane.querySelectorAll('tr'));
				const netTaxRow = allRows.find(row => row.textContent.toLowerCase().includes('net tax'));
				const netDueRow = allRows.find(row => row.textContent.toLowerCase().includes('net due'));

				if (netTaxRow && netDueRow) {
					const taxCells = netTaxRow.querySelectorAll('td');
					const dueCells = netDueRow.querySelectorAll('td');

					if (taxCells.length >= 4 && dueCells.length >= 4) {
						const firstHalfTaxText = taxCells[2]?.textContent.trim() || "$0.00";
						const secondHalfTaxText = taxCells[3]?.textContent.trim() || "$0.00";
						const firstHalfDueText = dueCells[2]?.textContent.trim() || "$0.00";
						const secondHalfDueText = dueCells[3]?.textContent.trim() || "$0.00";

						const firstHalfTax = formatCurrency(firstHalfTaxText);
						const secondHalfTax = formatCurrency(secondHalfTaxText);
						const firstHalfDue = parseFloat(firstHalfDueText.replace(/[^0-9.-]+/g, "")) || 0;
						const secondHalfDue = parseFloat(secondHalfDueText.replace(/[^0-9.-]+/g, "")) || 0;

						console.log(`DEBUG: Year ${assessmentYear}/${payableYear} - First Half Due: ${firstHalfDue}, Second Half Due: ${secondHalfDue}`);

						// Add first half if there's an amount due
						if (firstHalfDue > 0) {
							history.push({
								jurisdiction: "County",
								year: assessmentYear.toString(),
								payment_type: "First Installment",
								status: "Unpaid",
								base_amount: firstHalfTax,
								amount_paid: "$0.00",
								amount_due: formatCurrency(firstHalfDueText),
								mailing_date: "N/A",
								due_date: `02/14/${payableYear}`,
								delq_date: `02/15/${payableYear}`,
								paid_date: "",
								good_through_date: ""
							});
						}

						// Add second half if there's an amount due
						if (secondHalfDue > 0) {
							history.push({
								jurisdiction: "County",
								year: assessmentYear.toString(),
								payment_type: "Second Installment",
								status: "Unpaid",
								base_amount: secondHalfTax,
								amount_paid: "$0.00",
								amount_due: formatCurrency(secondHalfDueText),
								mailing_date: "N/A",
								due_date: `07/14/${payableYear}`,
								delq_date: `07/15/${payableYear}`,
								paid_date: "",
								good_through_date: ""
							});
						}
						
						// Track years with unpaid amounts
						if (firstHalfDue > 0 || secondHalfDue > 0) {
							return { history, hasUnpaid: true, year: assessmentYear };
						}
					}
				}

				return { history, hasUnpaid: false, year: assessmentYear };
			}, assessmentYear, payableYear);
			
			if (tabTaxHistory.history && tabTaxHistory.history.length > 0) {
				allTaxHistory.push(...tabTaxHistory.history);
			}
			
			if (tabTaxHistory.hasUnpaid) {
				unpaidYears.push(tabTaxHistory.year);
			}
			
		} catch (error) {
			console.error(`Error processing tab ${tab.text}:`, error);
		}
	}
	
	// Sort tax history by year (newest first)
	allTaxHistory.sort((a, b) => parseInt(b.year) - parseInt(a.year));
	
	data.tax_history = allTaxHistory;
	
	// Create comprehensive notes
	const latestYear = Math.max(...unpaidYears);
	const totalUnpaidYears = unpaidYears.length;
	const yearsList = unpaidYears.sort((a, b) => b - a).join(', ');
	
	if (totalUnpaidYears === 1) {
		data.notes = `${latestYear} TAXES ARE UNPAID, NORMALLY TAXES ARE PAID SEMI-ANNUAL, NORMAL DUE DATES ARE 02/14 & 07/14`;
	} else {
		data.notes = `MULTIPLE YEARS UNPAID: ${yearsList} TAXES ARE UNPAID, NORMALLY TAXES ARE PAID SEMI-ANNUAL, NORMAL DUE DATES ARE 02/14 & 07/14`;
	}
	
	data.delinquent = "YES";

	return data;
};

// Main orchestrator function
const account_search = async (page, account) => {
	console.log(`DEBUG: Starting account_search for ${account}`);

	// Step 1: Check payment status and get tab text + all tabs
	const paymentInfo = await madison_1(page, account);
	const paymentStatus = paymentInfo.status;
	console.log(`DEBUG: Payment status for ${account}:`, paymentStatus);

	if (paymentStatus === "NOT_FOUND") {
		return madison_not_found(account);
	}

	// Step 2: Get base property data
	const data = await madison_2(page, account);

	// Parse tab text for years (fallback to current date logic if parse fails)
	let assessmentYear = new Date().getFullYear() - 1;
	let payableYear = new Date().getFullYear();
	if (paymentInfo.tabText && paymentInfo.tabText.includes('Payable')) {
		const parts = paymentInfo.tabText.split(' Payable ');
		if (parts.length === 2) {
			assessmentYear = parseInt(parts[0]);
			payableYear = parseInt(parts[1]);
		}
	}

	const dates = calculateDueDates(payableYear);

	// Step 3: Route to appropriate tax processing function
	if (paymentStatus === "NO_TAX_HISTORY") {
		return madison_no_tax_history(data);
	} else if (paymentStatus === "PAID") {
		return await madison_paid(page, data, assessmentYear, payableYear, dates);
	} else if (paymentStatus === "PARTIAL") {
		return await madison_partial(page, data, assessmentYear, payableYear, dates);
	} else {
		// For unpaid status, process ALL tabs to get complete history
		return await madison_unpaid(page, data, paymentInfo.allTabs);
	}
};

const retryable_scrape = async (page, account, maxRetries = 3) => {
	let retries = 0;
	while (retries < maxRetries) {
		try {
			const result = await account_search(page, account);
			return result;
		} catch (error) {
			console.error(`Scraping attempt ${retries + 1} failed for account ${account}:`, error);
			retries++;
			if (retries >= maxRetries) {
				throw error;
			}
			await new Promise(resolve => setTimeout(resolve, 2000 * retries));
		}
	}
};

const search = async (req, res) => {
	const { fetch_type, account } = req.body;
	let context = null;

	try {
		if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
			return res.status(200).render("error_data", {
				error: true,
				message: "Invalid Access"
			});
		}

		const browser = await getBrowserInstance();
		context = await browser.createBrowserContext();
		const page = await context.newPage();
		await page.setUserAgent(
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36"
		);
		page.setDefaultNavigationTimeout(90000);

		// Enable console logging from the page
		page.on('console', msg => {
			if (msg.text().startsWith('DEBUG:')) {
				console.log('PAGE:', msg.text());
			}
		});

		await page.setRequestInterception(true);
		page.on("request", (reqInt) => {
			if (["font", "image", "media"].includes(reqInt.resourceType())) {
				reqInt.abort();
			} else {
				reqInt.continue();
			}
		});

		const data = await retryable_scrape(page, account);

		if (fetch_type === "html") {
			res.status(200).render("parcel_data_official", data);
		} else if (fetch_type === "api") {
			res.status(200).json({
				result: data
			});
		}
	} catch (error) {
		console.error(error);
		const errorMessage = error.message || "An unexpected error occurred during the scraping process.";
		if (req.body.fetch_type === "html") {
			res.status(200).render('error_data', {
				error: true,
				message: errorMessage
			});
		} else if (req.body.fetch_type === "api") {
			res.status(500).json({
				error: true,
				message: errorMessage
			});
		}
	} finally {
		if (context) {
			await context.close();
		}
	}
};

export { search };
