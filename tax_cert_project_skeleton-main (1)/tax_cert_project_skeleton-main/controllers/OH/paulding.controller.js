// Paulding County Tax Scraper
// Author: Nithyananda R S
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
	return month >= 10 ? year + 1 : year;
};

// Utility function for currency formatting
const formatCurrency = (str) =>
	str ? `$${parseFloat(str.replace(/[^0-9.-]+/g, "")).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";

// Paulding County due date calculator
const calculateDueDates = (year = getCurrentTaxYear(), county = 'Paulding') => {
	try {
		const payableYear = parseInt(year);
		const taxYear = payableYear - 1;
		if (isNaN(payableYear) || payableYear < 2000 || payableYear > 2100) {
			throw new Error('Invalid tax year');
		}

		const countyDueDates = {
			'Paulding': {
				firstHalf: {
					dueDate: formatDate(2, 5, payableYear),
					delqDate: formatDate(2, 6, payableYear),
					period: 'First Half'
				},
				secondHalf: {
					dueDate: formatDate(7, 16, payableYear),
					delqDate: formatDate(7, 17, payableYear),
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

const pd_1 = (page, account) => {
  const url = `https://www.pauldingcountyauditor.com/Parcel?Parcel=${account}`;
  return new Promise((resolve, reject) => {
    page.goto(url, { waitUntil: "domcontentloaded" }).then(() => {
      page.$('#Location').then(pageContentExists => {
        if (!pageContentExists) {
          resolve("NOT_FOUND");
          return;
        }
        page.waitForSelector('#Location').then(() => {
          page.evaluate(() => {
            // Look for the active tax tab to get current year tax table
            const activeTaxTable = document.querySelector('.tab-pane.active table[title*="Taxes"]');
            if (!activeTaxTable) return "NO_TAX_HISTORY";

            // Look for "NET DUE" row to determine payment status
            const netDueRow = Array.from(activeTaxTable.querySelectorAll('tr')).find(row =>
              row.textContent.includes('NET DUE') && row.classList.contains('bg-gradient-warning')
            );

            if (!netDueRow) return "NO_TAX_HISTORY";

            const cells = netDueRow.querySelectorAll('td');
            if (cells.length < 5) return "NO_TAX_HISTORY";

            // Parse amounts from NET DUE row (columns: Description, Delinquency, First Half, Second Half, Year Total)
            const delinquencyDue = parseFloat(cells[1]?.textContent.trim().replace(/[^0-9.-]+/g, "")) || 0;
            const firstHalfDue = parseFloat(cells[2]?.textContent.trim().replace(/[^0-9.-]+/g, "")) || 0;
            const secondHalfDue = parseFloat(cells[3]?.textContent.trim().replace(/[^0-9.-]+/g, "")) || 0;
            const totalDue = parseFloat(cells[4]?.textContent.trim().replace(/[^0-9.-]+/g, "")) || 0;

            console.log('Payment Status Debug:', {
              delinquencyDue,
              firstHalfDue,
              secondHalfDue,
              totalDue
            });

            // Determine payment status based on NET DUE amounts
            if (totalDue === 0 && firstHalfDue === 0 && secondHalfDue === 0 && delinquencyDue === 0) {
              return "PAID";
            } else if (firstHalfDue === 0 && secondHalfDue > 0) {
              return "PARTIAL";
            } else if (firstHalfDue > 0 || secondHalfDue > 0 || delinquencyDue > 0) {
              return "UNPAID";
            } else {
              return "PAID"; // Default to paid if all amounts are zero
            }
          }).then(status => {
            resolve(status);
          }).catch(reject);
        }).catch(reject);
      }).catch(reject);
    }).catch(reject);
  });
};

/* STEP-2: scrape valuation + produce base datum structure */
const pd_2 = (page, account) => {
  return new Promise((resolve, reject) => {
    page.evaluate(() => {
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
        taxing_authority: "Paulding County Auditor",
        notes: "",
        delinquent: "",
        tax_history: []
      };

      const findTableValue = (tableId, rowIndex, selector) => {
        const table = document.querySelector(`#${tableId} .table`);
        if (!table) return "N/A";
        const row = table.querySelector(`tr:nth-child(${rowIndex})`);
        return row?.querySelector(selector)?.textContent.trim() ?? "N/A";
      };

      // Extract basic property information
      datum.owner_name[0] = findTableValue('Location', 2, '.TableValue');
      datum.property_address = findTableValue('Location', 3, '.TableValue');

      // Extract valuation data from the most recent year (first row in valuation table)
      const valuationTable = document.querySelector('.table-responsive .table[title="Valuation"]');
      if (valuationTable) {
        const valuationRow = valuationTable.querySelector('tbody tr:first-child');
        if (valuationRow) {
          const cells = valuationRow.querySelectorAll('td');
          if (cells.length >= 7) {
            // Based on the HTML structure: Land, Improvements, Total for both Appraised and Assessed
            datum.land_value = cells[1]?.textContent.trim() ?? "N/A"; // Appraised Land
            datum.improvements = cells[2]?.textContent.trim() ?? "N/A"; // Appraised Improvements
            datum.total_assessed_value = cells[6]?.textContent.trim() ?? "N/A"; // Assessed Total
            datum.total_taxable_value = datum.total_assessed_value;
          }
        }
      }

      return datum;
    }).then(pageData => {
      pageData.parcel_number = account;
      pageData.notes = "";
      pageData.delinquent = "";
      resolve({ data: pageData });
    }).catch(reject);
  });
};

/* New Function: Handles the "N/A" case when the parcel is not found */
const pd_not_found = (account) => {
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
    taxing_authority: "Paulding County Auditor",
    notes: "Parcel not found on the website.",
    delinquent: "N/A",
    tax_history: []
  };
};

/* New Function: Handles the case where tax history is not found */
const pd_no_tax_history = (bundle) => {
  bundle.data.tax_history = [];
  bundle.data.notes = "Tax history and current taxes are not available on the website.";
  bundle.data.delinquent = "N/A";
  return bundle.data;
};

/* ---------- PAID branch --------------- */
const pd_paid = (page, bundle) => {
  return new Promise((resolve, reject) => {
    page.evaluate(() => {
      const formatCurrency = (str) =>
        str ? `$${parseFloat(str.replace(/[^0-9.-]+/g, "")).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";

      const history = [];

      // Get the current tax year from the active tab
      const activeTab = document.querySelector('#taxBill-tabs .nav-link.active');
      if (!activeTab) return [];

      const tabText = activeTab.textContent.trim();
      const yearMatch = tabText.match(/(\d{4}) Payable (\d{4})/);
      if (!yearMatch) return [];

      const taxYear = yearMatch[1];
      const payableYear = yearMatch[2];

      // Get the current tax table (active tab content)
      const currentTaxTable = document.querySelector('.tab-pane.active table[title*="Taxes"]');
      if (!currentTaxTable) return [];

      // Extract tax amounts from the "NET OWED" row
      const netOwedRow = Array.from(currentTaxTable.querySelectorAll('tr')).find(row =>
        row.textContent.includes('NET OWED')
      );

      if (!netOwedRow) return [];

      const owedCells = netOwedRow.querySelectorAll('td');
      if (owedCells.length < 5) return [];

      const firstHalfOwed = formatCurrency(owedCells[2]?.textContent.trim());
      const secondHalfOwed = formatCurrency(owedCells[3]?.textContent.trim());

      // Check payment history table to determine actual payment dates
      const paymentTable = document.querySelector('#TaxPayments + .card-body .table');
      const paymentRows = paymentTable ? Array.from(paymentTable.querySelectorAll('tbody tr')) : [];

      let firstHalfPaidDate = "";
      let secondHalfPaidDate = "";
      const currentYearPayments = [];

      // Collect all payments for current year
      paymentRows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 7) {
          const paymentDate = cells[0].textContent.trim();
          const cycle = cells[1].textContent.trim();
          const priorPaid = parseFloat(cells[2].textContent.trim().replace(/[^0-9.-]+/g, "")) || 0;
          const firstHalfPaid = parseFloat(cells[3].textContent.trim().replace(/[^0-9.-]+/g, "")) || 0;
          const secondHalfPaid = parseFloat(cells[4].textContent.trim().replace(/[^0-9.-]+/g, "")) || 0;
          const surplusPaid = parseFloat(cells[5].textContent.trim().replace(/[^0-9.-]+/g, "")) || 0;

          // Extract year from cycle (e.g., "1-24" means tax year 2024, payable 2025)
          const cycleMatch = cycle.match(/(\d+)-(\d+)/);
          if (cycleMatch) {
            const cycleYear = parseInt(`20${cycleMatch[2]}`);
            if (cycleYear.toString() === taxYear) {
              currentYearPayments.push({
                date: paymentDate,
                cycle: cycle,
                priorAmount: priorPaid,
                firstHalfAmount: firstHalfPaid,
                secondHalfAmount: secondHalfPaid,
                surplusAmount: surplusPaid,
                dateObj: new Date(paymentDate)
              });
            }
          }
        }
      });

      // Sort payments by date (earliest first)
      currentYearPayments.sort((a, b) => a.dateObj - b.dateObj);

      // Determine payment dates based on actual payment amounts
      currentYearPayments.forEach(payment => {
        if (payment.firstHalfAmount > 0 && !firstHalfPaidDate) {
          firstHalfPaidDate = payment.date;
        }
        if (payment.secondHalfAmount > 0 && !secondHalfPaidDate) {
          secondHalfPaidDate = payment.date;
        }
        // If both first and second half paid on same date, it's likely annual
        if (payment.firstHalfAmount > 0 && payment.secondHalfAmount > 0) {
          firstHalfPaidDate = payment.date;
          secondHalfPaidDate = payment.date;
        }
      });

      // Determine if this is an annual or semi-annual payment
      const firstHalfAmount = parseFloat(firstHalfOwed.replace(/[^0-9.-]+/g, "")) || 0;
      const secondHalfAmount = parseFloat(secondHalfOwed.replace(/[^0-9.-]+/g, "")) || 0;

      // Check if payment was made as annual (both halves paid on same date) or semi-annual
      const isAnnualPayment = currentYearPayments.some(payment =>
        payment.firstHalfAmount > 0 && payment.secondHalfAmount > 0
      );

      if (isAnnualPayment || (firstHalfPaidDate && firstHalfPaidDate === secondHalfPaidDate)) {
        // Annual payment - single entry
        const totalOwed = formatCurrency((firstHalfAmount + secondHalfAmount).toString());

        history.push({
          jurisdiction: "County",
          year: taxYear,
          payment_type: "Annual",
          status: "Paid",
          base_amount: totalOwed,
          amount_paid: totalOwed,
          amount_due: "$0.00",
          mailing_date: "N/A",
          due_date: `02/05/${payableYear}`,
          delq_date: `02/06/${payableYear}`,
          paid_date: firstHalfPaidDate,
          good_through_date: ""
        });
      } else {
        // Semi-annual payments - two entries
        if (firstHalfAmount > 0) {
          history.push({
            jurisdiction: "County",
            year: taxYear,
            payment_type: "Semi-Annual",
            status: "Paid",
            base_amount: firstHalfOwed,
            amount_paid: firstHalfOwed,
            amount_due: "$0.00",
            mailing_date: "N/A",
            due_date: `02/05/${payableYear}`,
            delq_date: `02/06/${payableYear}`,
            paid_date: firstHalfPaidDate,
            good_through_date: ""
          });
        }

        if (secondHalfAmount > 0) {
          history.push({
            jurisdiction: "County",
            year: taxYear,
            payment_type: "Semi-Annual",
            status: "Paid",
            base_amount: secondHalfOwed,
            amount_paid: secondHalfOwed,
            amount_due: "$0.00",
            mailing_date: "N/A",
            due_date: `07/16/${payableYear}`,
            delq_date: `07/17/${payableYear}`,
            paid_date: secondHalfPaidDate,
            good_through_date: ""
          });
        }
      }

      return history;
    }).then(taxHistory => {
      bundle.data.tax_history = taxHistory;

      // Determine payment type from the actual history entries
      const paymentType = (taxHistory.length === 1 && taxHistory[0].payment_type === "Annual") ? "Annual" : "Semi-Annual";

      const dates = calculateDueDates(parseInt(taxHistory[0]?.year) + 1);
      bundle.data.notes = `ALL PRIORS ARE PAID, ${dates.displayYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID ${paymentType.toUpperCase()}, NORMAL DUE DATES ARE ${dates.formattedDueDates}`;
      bundle.data.delinquent = "NONE";

      resolve(bundle.data);
    }).catch(reject);
  });
};

/* ---------- PARTIAL (1st Installment Paid) branch ------------- */
const pd_partial = (page, bundle) => {
  return new Promise((resolve, reject) => {
    page.evaluate(() => {
      const formatCurrency = (str) =>
        str ? `$${parseFloat(str.replace(/[^0-9.-]+/g, "")).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";

      const history = [];

      // Get the current tax year from the active tab
      const activeTab = document.querySelector('#taxBill-tabs .nav-link.active');
      if (!activeTab) return [];

      const tabText = activeTab.textContent.trim();
      const yearMatch = tabText.match(/(\d{4}) Payable (\d{4})/);
      if (!yearMatch) return [];

      const taxYear = yearMatch[1];
      const payableYear = yearMatch[2];

      // Get the current tax table
      const currentTaxTable = document.querySelector('.tab-pane.active table[title*="Taxes"]');
      if (!currentTaxTable) return [];

      // Extract tax amounts from "NET OWED" row
      const netOwedRow = Array.from(currentTaxTable.querySelectorAll('tr')).find(row =>
        row.textContent.includes('NET OWED')
      );

      if (!netOwedRow) return [];

      const owedCells = netOwedRow.querySelectorAll('td');
      if (owedCells.length < 5) return [];

      const firstHalfOwed = formatCurrency(owedCells[2]?.textContent.trim());
      const secondHalfOwed = formatCurrency(owedCells[3]?.textContent.trim());

      // Find payment date for first half from payment history
      const paymentTable = document.querySelector('#TaxPayments + .card-body .table');
      const paymentRows = paymentTable ? Array.from(paymentTable.querySelectorAll('tbody tr')) : [];

      let firstHalfPaidDate = "";

      paymentRows.forEach(row => {
        const cells = row.querySelectorAll('td');
        if (cells.length >= 7) {
          const paymentDate = cells[0].textContent.trim();
          const cycle = cells[1].textContent.trim();
          const firstHalfPaid = parseFloat(cells[3].textContent.trim().replace(/[^0-9.-]+/g, "")) || 0;

          // Extract year from cycle (e.g., "1-24" means tax year 2024)
          const cycleMatch = cycle.match(/(\d+)-(\d+)/);
          if (cycleMatch) {
            const cycleYear = parseInt(`20${cycleMatch[2]}`);
            if (cycleYear.toString() === taxYear && firstHalfPaid > 0) {
              firstHalfPaidDate = paymentDate;
            }
          }
        }
      });

      // Add paid first installment
      history.push({
        jurisdiction: "County",
        year: taxYear,
        payment_type: "Semi-Annual",
        status: "Paid",
        base_amount: firstHalfOwed,
        amount_paid: firstHalfOwed,
        amount_due: "$0.00",
        mailing_date: "N/A",
        due_date: `02/05/${payableYear}`,
        delq_date: `02/06/${payableYear}`,
        paid_date: firstHalfPaidDate,
        good_through_date: ""
      });

      // Add unpaid second installment - get from NET DUE row
      const netDueRow = Array.from(currentTaxTable.querySelectorAll('tr')).find(row =>
        row.textContent.includes('NET DUE')
      );

      if (netDueRow) {
        const dueCells = netDueRow.querySelectorAll('td');
        const secondHalfDue = formatCurrency(dueCells[3]?.textContent.trim());

        history.push({
          jurisdiction: "County",
          year: taxYear,
          payment_type: "Semi-Annual",
          status: "Unpaid",
          base_amount: secondHalfDue,
          amount_paid: "$0.00",
          amount_due: secondHalfDue,
          mailing_date: "N/A",
          due_date: `07/16/${payableYear}`,
          delq_date: `07/17/${payableYear}`,
          paid_date: "",
          good_through_date: ""
        });
      }

      return history;
    }).then(taxHistory => {
      bundle.data.tax_history = taxHistory;
      const dates = calculateDueDates(parseInt(taxHistory[0]?.year) + 1);
      bundle.data.notes = `PRIOR YEAR(S) TAXES ARE PAID, ${dates.displayYear} 1ST INSTALLMENT PAID, 2ND INSTALLMENT DUE, NORMALLY TAXES ARE PAID ${dates.defaultPaymentType.toUpperCase()}, NORMAL DUE DATES ARE ${dates.formattedDueDates}`;
      bundle.data.delinquent = "YES";

      resolve(bundle.data);
    }).catch(reject);
  });
};

/* ---------- UNPAID branch------------- */
const pd_unpaid = (page, bundle) => {
  return new Promise((resolve, reject) => {
    page.evaluate(() => {
      const formatCurrency = (str) =>
        str ? `$${parseFloat(str.replace(/[^0-9.-]+/g, "")).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";

      const history = [];

      // Get the current tax year from the active tab
      const activeTab = document.querySelector('#taxBill-tabs .nav-link.active');
      if (!activeTab) return [];

      const tabText = activeTab.textContent.trim();
      const yearMatch = tabText.match(/(\d{4}) Payable (\d{4})/);
      if (!yearMatch) return [];

      const taxYear = yearMatch[1];
      const payableYear = yearMatch[2];

      // Get the current tax table
      const currentTaxTable = document.querySelector('.tab-pane.active table[title*="Taxes"]');
      if (!currentTaxTable) return [];

      // Extract amounts due from "NET DUE" row
      const netDueRow = Array.from(currentTaxTable.querySelectorAll('tr')).find(row =>
        row.textContent.includes('NET DUE')
      );

      if (!netDueRow) return [];

      const dueCells = netDueRow.querySelectorAll('td');
      if (dueCells.length < 5) return [];

      const firstHalfDue = formatCurrency(dueCells[2]?.textContent.trim());
      const secondHalfDue = formatCurrency(dueCells[3]?.textContent.trim());

      const parseAmount = (str) => parseFloat(str.replace(/[^0-9.-]+/g, "")) || 0;

      // Add unpaid installments
      if (parseAmount(firstHalfDue) > 0) {
        history.push({
          jurisdiction: "County",
          year: taxYear,
          payment_type: "Semi-Annual",
          status: "Unpaid",
          base_amount: firstHalfDue,
          amount_paid: "$0.00",
          amount_due: firstHalfDue,
          mailing_date: "N/A",
          due_date: `02/05/${payableYear}`,
          delq_date: `02/06/${payableYear}`,
          paid_date: "",
          good_through_date: ""
        });
      }

      if (parseAmount(secondHalfDue) > 0) {
        history.push({
          jurisdiction: "County",
          year: taxYear,
          payment_type: "Semi-Annual",
          status: "Unpaid",
          base_amount: secondHalfDue,
          amount_paid: "$0.00",
          amount_due: secondHalfDue,
          mailing_date: "N/A",
          due_date: `07/16/${payableYear}`,
          delq_date: `07/17/${payableYear}`,
          paid_date: "",
          good_through_date: ""
        });
      }

      // Sort history by installment order
      history.sort((a, b) => {
        if (a.year !== b.year) {
          return parseInt(b.year) - parseInt(a.year);
        }
        return a.due_date < b.due_date ? -1 : 1;
      });

      return history;
    }).then(taxData => {
      bundle.data.tax_history = taxData;
      const dates = calculateDueDates(parseInt(taxData[0]?.year) + 1);
      bundle.data.notes = `PRIOR YEAR(S) TAXES ARE DUE, NORMALLY TAXES ARE PAID ${dates.defaultPaymentType.toUpperCase()}, NORMAL DUE DATES ARE ${dates.formattedDueDates}`;
      bundle.data.delinquent = "YES";

      resolve(bundle.data);
    }).catch(reject);
  });
};

// Orchestrator Function
const account_search = (page, account) => {
  return pd_1(page, account).then(paymentStatus => {
    if (paymentStatus === "NOT_FOUND") {
      return pd_not_found(account);
    }
    return pd_2(page, account).then(bundle => {
      if (paymentStatus === "NO_TAX_HISTORY") {
        return pd_no_tax_history(bundle);
      } else if (paymentStatus === "PAID") {
        return pd_paid(page, bundle);
      } else if (paymentStatus === "PARTIAL") {
        return pd_partial(page, bundle);
      } else {
        return pd_unpaid(page, bundle);
      }
    });
  });
};

const retryable_scrape = (page, account, maxRetries = 2) => {
  return new Promise((resolve, reject) => {
    let retries = 0;
    const attempt = () => {
      account_search(page, account).then(result => {
        resolve(result);
      }).catch(error => {
        console.error(`Scraping attempt ${retries + 1} failed for account ${account}:`, error);
        retries++;
        if (retries >= maxRetries) {
          reject(error);
        } else {
          setTimeout(attempt, 2000 * retries);
        }
      });
    };
    attempt();
  });
};

const search = (req, res) => {
	const { fetch_type, account } = req.body;
	let context = null;
  let page = null;

  const handleError = (error) => {
    console.error(error);
    const errorMessage = error.message || "An unexpected error occurred during the scraping process.";
    if (fetch_type === "html") {
      res.status(200).render('error_data', {
        error: true,
        message: errorMessage
      });
    } else if (fetch_type === "api") {
      res.status(500).json({
        error: true,
        message: errorMessage
      });
    }
    if (page) {
      page.close().catch(() => {});
    }
    if (context) {
      context.close().catch(() => {});
    }
  };

	if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
		return res.status(200).render("error_data", {
			error: true,
			message: "Invalid Access"
		});
	}

	getBrowserInstance().then(browser => {
    browser.createBrowserContext().then(ctx => {
      context = ctx;
      ctx.newPage().then(p => {
        page = p;
        p.setUserAgent(
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36"
        ).then(() => {
          page.setDefaultNavigationTimeout(60000);
          page.setRequestInterception(true).then(() => {
            page.on("request", (reqInt) => {
              if (["stylesheet", "font", "image", "script", "media"].includes(reqInt.resourceType())) {
                reqInt.abort();
              } else {
                reqInt.continue();
              }
            });
            retryable_scrape(page, account).then(data => {
              if (fetch_type === "html") {
                res.status(200).render("parcel_data_official", data);
              } else if (fetch_type === "api") {
                res.status(200).json({
                  result: data
                });
              }
              page.close().catch(() => {});
              context.close().catch(() => {});
            }).catch(handleError);
          }).catch(handleError);
        }).catch(handleError);
      }).catch(handleError);
    }).catch(handleError);
  }).catch(handleError);
};

export { search };
