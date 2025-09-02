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

// Pickaway County due date calculator
const calculateDueDates = (year = getCurrentTaxYear(), county = 'Pickaway') => {
    try {
        const taxYear = parseInt(year);
        if (isNaN(taxYear) || taxYear < 2000 || taxYear > 2100) {
            throw new Error('Invalid tax year');
        }

        const countyDueDates = {
            'Pickaway': {
                firstHalf: {
                    dueDate: formatDate(2, 21, taxYear),
                    delqDate: formatDate(2, 22, taxYear),
                    period: 'First Half'
                },
                secondHalf: {
                    dueDate: formatDate(7, 18, taxYear),
                    delqDate: formatDate(7, 19, taxYear),
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

/* STEP-1: Check payment status */
const pc_1 = async (page, account) => {
    const url = `https://auditor.pickawaycountyohio.gov/Parcel?Parcel=${account}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });

    const pageContentExists = await page.$('#Location');
    if (!pageContentExists) {
        return "NOT_FOUND";
    }

    await page.waitForSelector('#Location');

    return page.evaluate(() => {
        // Look for tax tables with year-specific titles
        const taxTables = document.querySelectorAll('table[title*="Taxes"]');
        if (taxTables.length === 0) return "NO_TAX_HISTORY";

        // Get the most recent tax year table (should be the first active tab)
        const currentTaxTable = taxTables[0];
        if (!currentTaxTable) return "NO_TAX_HISTORY";

        // Look for "Taxes Due" row to determine payment status
        const taxDueRow = Array.from(currentTaxTable.querySelectorAll('tr')).find(row =>
            row.textContent.includes('Taxes Due')
        );

        if (!taxDueRow) return "NO_TAX_HISTORY";

        const cells = taxDueRow.querySelectorAll('td');
        if (cells.length < 5) return "NO_TAX_HISTORY";

        // Parse amounts from Taxes Due row
        const firstHalfDue = parseFloat(cells[2]?.textContent.trim().replace(/[^0-9.-]+/g, "")) || 0;
        const secondHalfDue = parseFloat(cells[3]?.textContent.trim().replace(/[^0-9.-]+/g, "")) || 0;
        const totalDue = parseFloat(cells[4]?.textContent.trim().replace(/[^0-9.-]+/g, "")) || 0;

        // Determine payment status
        if (totalDue === 0 && firstHalfDue === 0 && secondHalfDue === 0) {
            return "PAID";
        } else if (firstHalfDue === 0 && secondHalfDue > 0) {
            return "PARTIAL";
        } else {
            return "UNPAID";
        }
    });
};

/* STEP-2: scrape valuation + produce base datum structure */
const pc_2 = async (page, account) => {
    const pageData = await page.evaluate(() => {
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
            taxing_authority: "Pickaway County Auditor, 207 S Court St, Circleville, OH 43113",
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
                    datum.land_value = cells[1]?.textContent.trim() ?? "N/A"; // Appraised Land
                    datum.improvements = cells[2]?.textContent.trim() ?? "N/A"; // Appraised Improvements
                    datum.total_assessed_value = cells[6]?.textContent.trim() ?? "N/A"; // Assessed Total
                    datum.total_taxable_value = datum.total_assessed_value;
                }
            }
        }

        return datum;
    });

    pageData.parcel_number = account;
    pageData.notes = "";
    pageData.delinquent = "";

    return { data: pageData };
};

/* New Function: Handles the "N/A" case when the parcel is not found */
const pc_not_found = (account) => {
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
        taxing_authority: "Pickaway County Auditor, 207 S Court St, Circleville, OH 43113",
        notes: "Parcel not found on the website.",
        delinquent: "N/A",
        tax_history: []
    };
};

/* New Function: Handles the case where tax history is not found */
const pc_no_tax_history = (bundle) => {
    bundle.data.tax_history = [];
    bundle.data.notes = "Tax history and current taxes are not available on the website.";
    bundle.data.delinquent = "N/A";
    return bundle.data;
};

/* ---------- PAID branch --------------- */
const pc_paid = async (page, bundle) => {
    const taxHistory = await page.evaluate(() => {
        const formatCurrency = (str) =>
            str ? `$${parseFloat(str.replace(/[^0-9.-]+/g, "")).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";

        const history = [];

        // Get the current tax year from the active tab
        const activeTab = document.querySelector('#taxBill-tabs .nav-link.active');
        if (!activeTab) return [];

        // Extract ONLY the year (e.g., "2024 Payable 2025" -> "2024")
        const currentYearFull = activeTab.textContent.trim();
        const currentYear = currentYearFull.split(' ')[0]; // Extract only the year part

        // Get the current tax table (active tab content)
        const currentTaxTable = document.querySelector('.tab-pane.active table[title*="Taxes"]');
        if (!currentTaxTable) return [];

        // Extract tax amounts from the "Taxes Billed" row
        const taxesBilledRow = Array.from(currentTaxTable.querySelectorAll('tr')).find(row =>
            row.textContent.includes('Taxes Billed')
        );

        if (!taxesBilledRow) return [];

        const billedCells = taxesBilledRow.querySelectorAll('td');
        if (billedCells.length < 5) return [];

        const firstHalfBilled = formatCurrency(billedCells[2]?.textContent.trim());
        const secondHalfBilled = formatCurrency(billedCells[3]?.textContent.trim());

        // Check payment history table to determine actual payment dates
        const paymentTable = document.querySelector('#taxPayments');
        const paymentRows = paymentTable ? Array.from(paymentTable.querySelectorAll('tbody tr')) : [];

        let firstHalfPaidDate = "";
        let secondHalfPaidDate = "";
        const currentYearPayments = [];

        // Collect all payments for current year
        paymentRows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 3) {
                const paymentDate = cells[0].textContent.trim();
                const taxYearPayment = cells[1].textContent.trim(); // This should already be just the year
                const amount = parseFloat(cells[2].textContent.trim().replace(/[^0-9.-]+/g, ""));

                if (taxYearPayment === currentYear) { // Compare with extracted year
                    currentYearPayments.push({
                        date: paymentDate,
                        amount: amount,
                        dateObj: new Date(paymentDate)
                    });
                }
            }
        });

        // Sort payments by date (earliest first)
        currentYearPayments.sort((a, b) => a.dateObj - b.dateObj);

        // Assign payment dates based on chronological order
        if (currentYearPayments.length >= 1) {
            firstHalfPaidDate = currentYearPayments[0].date;
        }
        if (currentYearPayments.length >= 2) {
            secondHalfPaidDate = currentYearPayments[1].date;
        }

        // Determine if this is an annual or semi-annual payment
        const firstHalfAmount = parseFloat(firstHalfBilled.replace(/[^0-9.-]+/g, "")) || 0;
        const secondHalfAmount = parseFloat(secondHalfBilled.replace(/[^0-9.-]+/g, "")) || 0;

        // Check if only one payment was made (annual) or two payments (semi-annual)
        const paymentCount = paymentRows.filter(row => {
            const cells = row.querySelectorAll('td');
            return cells.length >= 3 && cells[1].textContent.trim() === currentYear;
        }).length;

        if (paymentCount === 1 && Math.abs(firstHalfAmount + secondHalfAmount - currentYearPayments[0].amount) < 0.01) {
            // Annual payment - single entry if the single payment matches total billed
            const totalBilled = formatCurrency((firstHalfAmount + secondHalfAmount).toString());
            const paymentDate = firstHalfPaidDate || secondHalfPaidDate; // Will be the same if only one payment

            history.push({
                jurisdiction: "County",
                year: currentYear,
                payment_type: "Annual",
                status: "Paid",
                base_amount: totalBilled,
                amount_paid: totalBilled,
                amount_due: "$0.00",
                mailing_date: "N/A",
                due_date: `02/21/${currentYear}`, // Formatted without "Payable XXXX"
                delq_date: `02/22/${currentYear}`, // Formatted without "Payable XXXX"
                paid_date: paymentDate,
                good_through_date: ""
            });
        } else {
            // Semi-annual payments - two entries
            if (firstHalfAmount > 0) {
                history.push({
                    jurisdiction: "County",
                    year: currentYear,
                    payment_type: "Semi-Annual",
                    status: "Paid",
                    base_amount: firstHalfBilled,
                    amount_paid: firstHalfBilled,
                    amount_due: "$0.00",
                    mailing_date: "N/A",
                    due_date: `02/21/${currentYear}`, // Formatted without "Payable XXXX"
                    delq_date: `02/22/${currentYear}`, // Formatted without "Payable XXXX"
                    paid_date: firstHalfPaidDate,
                    good_through_date: ""
                });
            }

            if (secondHalfAmount > 0) {
                history.push({
                    jurisdiction: "County",
                    year: currentYear,
                    payment_type: "Semi-Annual",
                    status: "Paid",
                    base_amount: secondHalfBilled,
                    amount_paid: secondHalfBilled,
                    amount_due: "$0.00",
                    mailing_date: "N/A",
                    due_date: `07/18/${currentYear}`, // Formatted without "Payable XXXX"
                    delq_date: `07/19/${currentYear}`, // Formatted without "Payable XXXX"
                    paid_date: secondHalfPaidDate,
                    good_through_date: ""
                });
            }
        }

        return history;
    });

    bundle.data.tax_history = taxHistory;

    // Determine payment type from the actual history entries
    const paymentType = (taxHistory.length === 1 && taxHistory[0].payment_type === "Annual") ? "Annual" : "Semi-Annual";

    const dates = calculateDueDates(taxHistory[0]?.year);
    bundle.data.notes = `ALL PRIORS ARE PAID, ${dates.displayYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID ${paymentType.toUpperCase()}, NORMAL DUE DATES ARE ${dates.formattedDueDates}`;
    bundle.data.delinquent = "NONE";

    return bundle.data;
};

/* ---------- PARTIAL (1st Installment Paid) branch ------------- */
const pc_partial = async (page, bundle) => {
    const taxHistory = await page.evaluate(() => {
        const formatCurrency = (str) =>
            str ? `$${parseFloat(str.replace(/[^0-9.-]+/g, "")).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";

        const history = [];

        // Get the current tax year from the active tab
        const activeTab = document.querySelector('#taxBill-tabs .nav-link.active');
        if (!activeTab) return [];

        // Extract ONLY the year (e.g., "2024 Payable 2025" -> "2024")
        const currentYearFull = activeTab.textContent.trim();
        const currentYear = currentYearFull.split(' ')[0]; // Extract only the year part

        // Get the current tax table
        const currentTaxTable = document.querySelector('.tab-pane.active table[title*="Taxes"]');
        if (!currentTaxTable) return [];

        // Extract tax amounts
        const taxesBilledRow = Array.from(currentTaxTable.querySelectorAll('tr')).find(row =>
            row.textContent.includes('Taxes Billed')
        );

        if (!taxesBilledRow) return [];

        const billedCells = taxesBilledRow.querySelectorAll('td');
        if (billedCells.length < 5) return [];

        const firstHalfBilled = formatCurrency(billedCells[2]?.textContent.trim());
        const secondHalfBilled = formatCurrency(billedCells[3]?.textContent.trim());

        // Find payment date for first half from payment history
        const paymentTable = document.querySelector('#taxPayments');
        const paymentRows = paymentTable ? Array.from(paymentTable.querySelectorAll('tbody tr')) : [];

        let firstHalfPaidDate = "";

        paymentRows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 3) {
                const paymentDate = cells[0].textContent.trim();
                const taxYearPayment = cells[1].textContent.trim(); // This should already be just the year

                if (taxYearPayment === currentYear) { // Compare with extracted year
                    const paymentDateObj = new Date(paymentDate);
                    const month = paymentDateObj.getMonth() + 1;

                    if (month <= 6) { // Assuming first half payment is typically before July
                        firstHalfPaidDate = paymentDate;
                    }
                }
            }
        });

        // Add paid first installment
        history.push({
            jurisdiction: "County",
            year: currentYear,
            payment_type: "First Installment",
            status: "Paid",
            base_amount: firstHalfBilled,
            amount_paid: firstHalfBilled,
            amount_due: "$0.00",
            mailing_date: "N/A",
            due_date: `02/21/${currentYear}`, // Formatted without "Payable XXXX"
            delq_date: `02/22/${currentYear}`, // Formatted without "Payable XXXX"
            paid_date: firstHalfPaidDate,
            good_through_date: ""
        });

        // Add unpaid second installment
        history.push({
            jurisdiction: "County",
            year: currentYear,
            payment_type: "Second Installment",
            status: "Unpaid",
            base_amount: secondHalfBilled,
            amount_paid: "$0.00",
            amount_due: secondHalfBilled,
            mailing_date: "N/A",
            due_date: `07/18/${currentYear}`, // Formatted without "Payable XXXX"
            delq_date: `07/19/${currentYear}`, // Formatted without "Payable XXXX"
            paid_date: "",
            good_through_date: ""
        });

        return history;
    });

    bundle.data.tax_history = taxHistory;
    const dates = calculateDueDates(taxHistory[0]?.year);
    bundle.data.notes = `PRIOR YEAR(S) TAXES ARE PAID, ${dates.displayYear} 1ST INSTALLMENT PAID, 2ND INSTALLMENT DUE, NORMALLY TAXES ARE PAID ${dates.defaultPaymentType.toUpperCase()}, NORMAL DUE DATES ARE ${dates.formattedDueDates}`;
    bundle.data.delinquent = "YES";

    return bundle.data;
};

/* ---------- UNPAID branch ------------- */
const pc_unpaid = async (page, bundle) => {
    // Navigate to the page once and scrape all data
    const unpaidHistory = await page.evaluate(() => {
        const formatCurrency = (str) =>
            str ? `$${parseFloat(str.replace(/[^0-9.-]+/g, "")).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";

        const history = [];
        const taxTabs = document.querySelectorAll('div.tab-pane');

        taxTabs.forEach(tabPane => {
            const taxTable = tabPane.querySelector('table[title*="Taxes"]');
            if (!taxTable) return;

            // Get the year from the corresponding tab link
            const tabId = tabPane.id;
            const tabLink = document.querySelector(`a[data-target="#${tabId}"]`) || document.querySelector(`div[data-target="#${tabId}"]`);
            const yearFull = tabLink?.textContent.trim();
            if (!yearFull) return;
            const year = yearFull.split(' ')[0];

            // Get the billed amounts
            const taxesBilledRow = Array.from(taxTable.querySelectorAll('tr')).find(row => row.textContent.includes('Taxes Billed'));
            const taxesDueRow = Array.from(taxTable.querySelectorAll('tr')).find(row => row.textContent.includes('Taxes Due'));
            const paymentsMadeRow = Array.from(taxTable.querySelectorAll('tr')).find(row => row.textContent.includes('Payments Made'));

            if (!taxesBilledRow || !taxesDueRow || !paymentsMadeRow) return;

            const billedCells = taxesBilledRow.querySelectorAll('td');
            const dueCells = taxesDueRow.querySelectorAll('td');
            const paidCells = paymentsMadeRow.querySelectorAll('td');

            if (billedCells.length < 5 || dueCells.length < 5 || paidCells.length < 5) return;

            const firstHalfBilled = billedCells[2]?.textContent.trim();
            const secondHalfBilled = billedCells[3]?.textContent.trim();
            const firstHalfPaid = paidCells[2]?.textContent.trim();
            const secondHalfPaid = paidCells[3]?.textContent.trim();
            const firstHalfDue = dueCells[2]?.textContent.trim();
            const secondHalfDue = dueCells[3]?.textContent.trim();

            const firstHalfDueAmount = parseFloat(firstHalfDue.replace(/[^0-9.-]+/g, "")) || 0;
            const secondHalfDueAmount = parseFloat(secondHalfDue.replace(/[^0-9.-]+/g, "")) || 0;

            // Find payment dates
            const paymentTable = document.querySelector('#taxPayments tbody');
            const paymentRows = paymentTable ? Array.from(paymentTable.querySelectorAll('tr')) : [];
            let firstHalfPaidDate = "";
            let secondHalfPaidDate = "";

            const paymentsForYear = paymentRows
                .filter(row => {
                    const cells = row.querySelectorAll('td');
                    return cells[1]?.textContent.trim() === year;
                })
                .map(row => {
                    const cells = row.querySelectorAll('td');
                    return {
                        date: cells[0]?.textContent.trim(),
                        amount: parseFloat(cells[2]?.textContent.trim().replace(/[^0-9.-]+/g, "")) || 0
                    };
                });

            const firstHalfPaidAmount = parseFloat(firstHalfPaid.replace(/[^0-9.-]+/g, "")) || 0;
            const secondHalfPaidAmount = parseFloat(secondHalfPaid.replace(/[^0-9.-]+/g, "")) || 0;

            // Find payment dates by matching amounts
            const firstHalfPayment = paymentsForYear.find(p => Math.abs(p.amount - firstHalfPaidAmount) < 0.01);
            if (firstHalfPayment) {
                firstHalfPaidDate = firstHalfPayment.date;
            }

            const secondHalfPayment = paymentsForYear.find(p => Math.abs(p.amount - secondHalfPaidAmount) < 0.01);
            if (secondHalfPayment) {
                secondHalfPaidDate = secondHalfPayment.date;
            }

            // ONLY add to history if there is an amount due
            if (firstHalfDueAmount > 0) {
                history.push({
                    jurisdiction: "County",
                    year: year,
                    payment_type: "First Installment",
                    status: "Unpaid",
                    base_amount: formatCurrency(firstHalfBilled),
                    amount_paid: formatCurrency(firstHalfPaid),
                    amount_due: formatCurrency(firstHalfDue),
                    mailing_date: "N/A",
                    due_date: `02/21/${year}`,
                    delq_date: `02/22/${year}`,
                    paid_date: firstHalfPaidDate,
                    good_through_date: ""
                });
            }

            if (secondHalfDueAmount > 0) {
                history.push({
                    jurisdiction: "County",
                    year: year,
                    payment_type: "Second Installment",
                    status: "Unpaid",
                    base_amount: formatCurrency(secondHalfBilled),
                    amount_paid: formatCurrency(secondHalfPaid),
                    amount_due: formatCurrency(secondHalfDue),
                    mailing_date: "N/A",
                    due_date: `07/18/${year}`,
                    delq_date: `07/19/${year}`,
                    paid_date: secondHalfPaidDate,
                    good_through_date: ""
                });
            }
        });

        return history;
    });

    bundle.data.tax_history = unpaidHistory;

    // Sort unpaid history to show most recent years first
    unpaidHistory.sort((a, b) => {
        const yearDiff = parseInt(b.year) - parseInt(a.year);
        if (yearDiff !== 0) return yearDiff;
        // For the same year, show First Installment before Second Installment
        const firstInstallmentA = a.payment_type.includes("First");
        const firstInstallmentB = b.payment_type.includes("First");
        return firstInstallmentA ? -1 : 1;
    });

    const unpaidYears = [...new Set(unpaidHistory.map(item => item.year))];

    if (unpaidHistory.length > 0) {
        bundle.data.notes = `MULTIPLE YEARS (${unpaidYears.sort((a, b) => b - a).join(', ')}) TAXES ARE DUE`;
        bundle.data.delinquent = "YES";
    } else {
        bundle.data.notes = "ALL TAXES ARE PAID, INCLUDING PRIORS.";
        bundle.data.delinquent = "NONE";
    }

    return bundle.data;
};

// Orchestrator Function
const account_search = async (page, account) => {
    // Step 1: Data Scraping
    const paymentStatus = await pc_1(page, account);

    // Check for "Not Found" case first, as it's an immediate failure
    if (paymentStatus === "NOT_FOUND") {
        return pc_not_found(account);
    }

    const { data } = await pc_2(page, account);

    // Step 2: Analysis and Formatting
    if (paymentStatus === "NO_TAX_HISTORY") {
        return pc_no_tax_history({ data });
    } else if (paymentStatus === "PAID") {
        return pc_paid(page, { data });
    } else if (paymentStatus === "PARTIAL") {
        return pc_partial(page, { data });
    } else {
        return pc_unpaid(page, { data });
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

        await page.setRequestInterception(true);
        page.on("request", (reqInt) => {
            if (["stylesheet", "font", "image", "script", "media"].includes(reqInt.resourceType())) {
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
