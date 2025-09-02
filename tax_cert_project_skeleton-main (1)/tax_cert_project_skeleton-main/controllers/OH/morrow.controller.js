// Morrow County Property Scraper

// Based on Darke County implementation pattern

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// Utility function for date formatting
const formatDate = (month, day, year) => {
    const date = new Date(year, month - 1, day);
    const isValidDate = date && date.getMonth() === month - 1 && date.getDate() === day;
    if (!isValidDate) {
        throw new Error(`Invalid date: ${month}/${day}/${year}`);
    }
    return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
};

// Get current tax year
const getCurrentTaxYear = () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    return month >= 10 ? year + 1 : year;
};

// Utility function for currency formatting
const formatCurrency = (str) =>
    str ? `$${parseFloat(str.replace(/[^0-9.-]+/g, "")).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";

// Calculate due dates for Morrow County
const calculateDueDates = (year = getCurrentTaxYear()) => {
    try {
        const taxYear = parseInt(year);
        if (isNaN(taxYear) || taxYear < 2000 || taxYear > 2100) {
            throw new Error('Invalid tax year');
        }

        const result = {
            firstHalf: {
                dueDate: formatDate(1, 31, taxYear),
                delqDate: formatDate(2, 1, taxYear),
                period: 'First Half'
            },
            secondHalf: {
                dueDate: formatDate(7, 20, taxYear),
                delqDate: formatDate(7, 21, taxYear),
                period: 'Second Half'
            },
            paymentTypes: ['Annual', 'Semi-Annual'],
            defaultPaymentType: 'Semi-Annual',
            taxYear: taxYear,
            displayYear: `${taxYear}`,
            formattedDueDates: `01/31 & 07/20`
        };

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

// STEP 1: Check payment status
const mc_1 = async (page, account) => {
    const url = `https://auditor.co.morrow.oh.us/Parcel?Parcel=${account}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });

    // Check if parcel exists
    const pageContentExists = await page.$('.parcel');
    if (!pageContentExists) {
        return "NOT_FOUND";
    }

    // Wait for a section that contains tax information
    try {
        await page.waitForSelector('table[title*="Tax Table"]', { timeout: 5000 });
    } catch (error) {
        // If the tax table is not found, assume no tax history is available
        return "NO_TAX_HISTORY";
    }

    return page.evaluate(() => {
        // Find the tax table for the most recent year
        const taxTables = Array.from(document.querySelectorAll('table[title*="Tax Table"]'));
        if (!taxTables || taxTables.length === 0) return "NO_TAX_HISTORY";

        // Find the 'Owed' row to determine current balance
        const mostRecentTaxTable = taxTables[0];
        const owedRow = Array.from(mostRecentTaxTable.querySelectorAll('tr')).find(row => {
            const firstCell = row.querySelector('td');
            return firstCell && firstCell.textContent.trim() === 'Owed';
        });

        if (!owedRow) return "NO_TAX_HISTORY";

        const cells = owedRow.querySelectorAll('td');
        if (cells.length < 5) return "UNPAID";

        const firstHalfOwed = parseFloat(cells[2]?.textContent.trim().replace(/[^0-9.-]+/g, "")) || 0;
        const secondHalfOwed = parseFloat(cells[3]?.textContent.trim().replace(/[^0-9.-]+/g, "")) || 0;

        if (firstHalfOwed === 0 && secondHalfOwed === 0) {
            return "PAID";
        } else if (firstHalfOwed === 0 && secondHalfOwed > 0) {
            return "PARTIAL";
        } else {
            return "UNPAID";
        }
    });
};

// STEP 2: Scrape valuation and create base data structure
const mc_2 = async (page, account) => {
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
            taxing_authority: "Morrow County Treasurer, 48 E High St, Mount Gilead, OH 43338, Ph: 419-947-5010",
            notes: "",
            delinquent: "",
            tax_history: []
        };

        // Extract owner name and address from the 'Location' table
        const locationTable = document.querySelector('#Location table');
        if (locationTable) {
            const rows = locationTable.querySelectorAll('tr');
            rows.forEach(row => {
                const titleCell = row.querySelector('.tableTitle');
                const valueCell = row.querySelector('.TableValue');
                if (titleCell && valueCell) {
                    const titleText = titleCell.textContent.trim();
                    if (titleText.includes('Owner')) {
                        datum.owner_name[0] = valueCell.textContent.trim();
                    } else if (titleText.includes('Address')) {
                        const address = valueCell.textContent.split('<div')[0].trim();
                        datum.property_address = address;
                    }
                }
            });
        }

        // Extract valuation data from the valuation table
        const valuationTable = document.querySelector('table[title="Valuation"]');
        if (valuationTable) {
            const dataRow = valuationTable.querySelector('tbody tr') ||
                valuationTable.querySelectorAll('tr')[2];

            if (dataRow) {
                const cells = dataRow.querySelectorAll('td, th');
                if (cells.length >= 7) {
                    datum.land_value = cells[1]?.textContent.trim() || "N/A";
                    datum.improvements = cells[2]?.textContent.trim() || "N/A";
                    datum.total_assessed_value = cells[6]?.textContent.trim() || "N/A";
                    datum.total_taxable_value = datum.total_assessed_value;
                }
            }
        }

        // Get exemption information if available
        const reductionRows = Array.from(document.querySelectorAll('tr'));
        const homesteadRow = reductionRows.find(row =>
            row.textContent.includes('Homestead Reduction')
        );
        if (homesteadRow) {
            const cells = homesteadRow.querySelectorAll('td');
            if (cells.length >= 3) {
                const exemptionAmount = cells[2]?.textContent.trim();
                if (exemptionAmount && exemptionAmount !== '$0.00') {
                    datum.exemption = exemptionAmount;
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

// Handle parcel not found
const mc_not_found = (account) => {
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
        taxing_authority: "Morrow County Treasurer, 48 E High St, Mount Gilead, OH 43338, Ph: 419-947-5010",
        notes: "Parcel not found on the website.",
        delinquent: "N/A",
        tax_history: []
    };
};

// Handle no tax history found
const mc_no_tax_history = (bundle) => {
    bundle.data.tax_history = [];
    bundle.data.notes = "Tax history and current taxes are not available on the website.";
    bundle.data.delinquent = "N/A";
    return bundle.data;
};

// Handle PAID status
const mc_paid = async (page, bundle) => {
    const taxHistory = await page.evaluate(() => {
        const formatCurrency = (str) =>
            str ? `$${parseFloat(str.replace(/[^0-9.-]+/g, "")).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";

        const history = [];
        const currentYear = new Date().getFullYear();
        let taxYear = currentYear;

        const taxTable = document.querySelector('table[title*="Tax Table"]');
        if (taxTable) {
            const titleMatch = taxTable.getAttribute('title').match(/(\d{4})/);
            if (titleMatch) taxYear = parseInt(titleMatch[1]);
        }

        const firstHalfBase = formatCurrency(taxTable?.querySelector('tbody tr')?.querySelectorAll('td')[2]?.textContent.trim());
        const secondHalfBase = formatCurrency(taxTable?.querySelector('tbody tr')?.querySelectorAll('td')[3]?.textContent.trim());

        // Get payment history from Tax Payments table
        const paymentsTable = document.querySelector('table[title="Tax Payments"]');
        const paymentRows = paymentsTable ? Array.from(paymentsTable.querySelectorAll('tbody tr')) : [];

        const currentYearPayments = paymentRows
            .filter(row => {
                const yearCell = row.querySelector('td:nth-child(2)');
                return yearCell && yearCell.textContent.trim() === taxYear.toString();
            })
            .map(row => {
                const cells = row.querySelectorAll('td');
                return {
                    date: cells[0]?.textContent.trim(),
                    amount: formatCurrency(cells[3]?.textContent.trim())
                };
            })
            .sort((a, b) => new Date(a.date) - new Date(b.date)); // Sort by date to get correct installment order

        if (currentYearPayments.length === 2) {
            history.push({
                jurisdiction: "County",
                year: taxYear.toString(),
                payment_type: "Semi Annual",
                status: "Paid",
                base_amount: firstHalfBase,
                amount_paid: currentYearPayments[0].amount,
                amount_due: "$0.00",
                mailing_date: "N/A",
                due_date: `01/31/${taxYear}`,
                delq_date: `02/01/${taxYear}`,
                paid_date: currentYearPayments[0].date,
                good_through_date: ""
            });

            history.push({
                jurisdiction: "County",
                year: taxYear.toString(),
                payment_type: "Semi Annual",
                status: "Paid",
                base_amount: secondHalfBase,
                amount_paid: currentYearPayments[1].amount,
                amount_due: "$0.00",
                mailing_date: "N/A",
                due_date: `07/20/${taxYear}`,
                delq_date: `07/21/${taxYear}`,
                paid_date: currentYearPayments[1].date,
                good_through_date: ""
            });
        } else if (currentYearPayments.length === 1) {
            const totalAmount = formatCurrency(
                (parseFloat(firstHalfBase.replace(/[^0-9.-]+/g, "")) +
                    parseFloat(secondHalfBase.replace(/[^0-9.-]+/g, ""))).toString()
            );
            history.push({
                jurisdiction: "County",
                year: taxYear.toString(),
                payment_type: "Annual",
                status: "Paid",
                base_amount: totalAmount,
                amount_paid: currentYearPayments[0].amount,
                amount_due: "$0.00",
                mailing_date: "N/A",
                due_date: `01/31/${taxYear}`,
                delq_date: `02/01/${taxYear}`,
                paid_date: currentYearPayments[0].date,
                good_through_date: ""
            });
        } else if (currentYearPayments.length > 2) {
            currentYearPayments.forEach((payment, index) => {
                history.push({
                    jurisdiction: "County",
                    year: taxYear.toString(),
                    payment_type: `Installment ${index + 1}`,
                    status: "Paid",
                    base_amount: payment.amount,
                    amount_paid: payment.amount,
                    amount_due: "$0.00",
                    mailing_date: "N/A",
                    due_date: "N/A",
                    delq_date: "N/A",
                    paid_date: payment.date,
                    good_through_date: ""
                });
            });
        }

        return history;
    });

    bundle.data.tax_history = taxHistory;
    const paymentType = taxHistory.length === 1 ? "Annual" : taxHistory.length === 2 ? "Semi-Annual" : "Multiple";
    const dates = calculateDueDates(taxHistory[0]?.year);
    bundle.data.notes = `ALL PRIORS ARE PAID, ${dates.displayYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID ${paymentType.toUpperCase()}, NORMAL DUE DATES ARE ${dates.formattedDueDates}`;
    bundle.data.delinquent = "NONE";

    return bundle.data;
};

// Handle PARTIAL payment status
const mc_partial = async (page, bundle) => {
    const taxHistory = await page.evaluate(() => {
        const formatCurrency = (str) =>
            str ? `$${parseFloat(str.replace(/[^0-9.-]+/g, "")).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";

        const history = [];
        let currentYear = new Date().getFullYear();

        const taxTable = document.querySelector('table[title*="Tax Table"]');
        if (taxTable) {
            const titleMatch = taxTable.getAttribute('title').match(/(\d{4})/);
            if (titleMatch) currentYear = parseInt(titleMatch[1]);
        }

        const firstHalfBase = formatCurrency(taxTable?.querySelector('tbody tr')?.querySelectorAll('td')[2]?.textContent.trim());
        const secondHalfBase = formatCurrency(taxTable?.querySelector('tbody tr')?.querySelectorAll('td')[3]?.textContent.trim());

        // Get the paid date from the payments table
        const paymentsTable = document.querySelector('table[title="Tax Payments"]');
        const paymentRows = paymentsTable ? Array.from(paymentsTable.querySelectorAll('tbody tr')) : [];
        const firstInstallmentPayment = paymentRows.find(row => {
            const taxYearCell = row.querySelector('td:nth-child(2)');
            return taxYearCell && taxYearCell.textContent.trim() === currentYear.toString();
        });
        const paidDate = firstInstallmentPayment ? firstInstallmentPayment.querySelector('td:nth-child(1)').textContent.trim() : "";

        // Get owed amount for the second half
        const owedRow = taxTable?.querySelector('tbody tr:last-child');
        const secondHalfOwed = formatCurrency(owedRow?.querySelectorAll('td')[3]?.textContent.trim());

        // First installment (paid)
        history.push({
            jurisdiction: "County",
            year: currentYear.toString(),
            payment_type: "First Installment",
            status: "Paid",
            base_amount: firstHalfBase,
            amount_paid: firstHalfBase,
            amount_due: "$0.00",
            mailing_date: "N/A",
            due_date: `01/31/${currentYear}`,
            delq_date: `02/01/${currentYear}`,
            paid_date: paidDate,
            good_through_date: ""
        });

        // Second installment (unpaid)
        history.push({
            jurisdiction: "County",
            year: currentYear.toString(),
            payment_type: "Second Installment",
            status: "Unpaid",
            base_amount: secondHalfBase,
            amount_paid: "$0.00",
            amount_due: secondHalfOwed,
            mailing_date: "N/A",
            due_date: `07/20/${currentYear}`,
            delq_date: `07/21/${currentYear}`,
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

// Handle UNPAID status
const mc_unpaid = async (page, bundle) => {
    const taxData = await page.evaluate(() => {
        const formatCurrency = (str) =>
            str ? `$${parseFloat(str.replace(/[^0-9.-]+/g, "")).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : "$0.00";

        const history = [];
        const taxTables = Array.from(document.querySelectorAll('table[title*="Tax Table"]'));

        for (const taxTable of taxTables) {
            const titleMatch = taxTable.getAttribute('title').match(/(\d{4})/);
            if (!titleMatch) continue;

            const taxYear = parseInt(titleMatch[1]);

            // Find the 'Owed' row for this table
            const owedRow = Array.from(taxTable.querySelectorAll('tr')).find(row => {
                const firstCell = row.querySelector('td');
                return firstCell && firstCell.textContent.trim() === 'Owed';
            });
            if (!owedRow) continue;

            const cells = owedRow.querySelectorAll('td');
            if (cells.length < 5) continue;

            const firstHalfOwed = parseFloat(cells[2]?.textContent.trim().replace(/[^0-9.-]+/g, "")) || 0;
            const secondHalfOwed = parseFloat(cells[3]?.textContent.trim().replace(/[^0-9.-]+/g, "")) || 0;
            const firstHalfBase = formatCurrency(taxTable?.querySelector('tbody tr')?.querySelectorAll('td')[2]?.textContent.trim());
            const secondHalfBase = formatCurrency(taxTable?.querySelector('tbody tr')?.querySelectorAll('td')[3]?.textContent.trim());
            
            if (firstHalfOwed > 0) {
                history.push({
                    jurisdiction: "County",
                    year: taxYear.toString(),
                    payment_type: "First Installment",
                    status: "Unpaid",
                    base_amount: firstHalfBase,
                    amount_paid: "$0.00",
                    amount_due: formatCurrency(cells[2]?.textContent.trim()),
                    mailing_date: "N/A",
                    due_date: `01/31/${taxYear}`,
                    delq_date: `02/01/${taxYear}`,
                    paid_date: "",
                    good_through_date: ""
                });
            }

            if (secondHalfOwed > 0) {
                history.push({
                    jurisdiction: "County",
                    year: taxYear.toString(),
                    payment_type: "Second Installment",
                    status: "Unpaid",
                    base_amount: secondHalfBase,
                    amount_paid: "$0.00",
                    amount_due: formatCurrency(cells[3]?.textContent.trim()),
                    mailing_date: "N/A",
                    due_date: `07/20/${taxYear}`,
                    delq_date: `07/21/${taxYear}`,
                    paid_date: "",
                    good_through_date: ""
                });
            }
        }

        // Sort by year in descending order
        history.sort((a, b) => {
            const yearA = parseInt(a.year);
            const yearB = parseInt(b.year);
            return yearB - yearA;
        });

        return history;
    });

    bundle.data.tax_history = taxData;
    const dates = calculateDueDates();
    bundle.data.notes = `PRIOR YEAR(S) TAXES ARE DUE, NORMALLY TAXES ARE PAID ${dates.defaultPaymentType.toUpperCase()}, NORMAL DUE DATES ARE ${dates.formattedDueDates}`;
    bundle.data.delinquent = "YES";

    return bundle.data;
};

// Main orchestrator function
const account_search = async (page, account) => {
    // Step 1: Check payment status
    const paymentStatus = await mc_1(page, account);

    // Check for "Not Found" case
    if (paymentStatus === "NOT_FOUND") {
        return mc_not_found(account);
    }

    // Step 2: Get base property data
    const { data } = await mc_2(page, account);

    // Step 3: Process based on payment status
    if (paymentStatus === "NO_TAX_HISTORY") {
        return mc_no_tax_history({ data });
    } else if (paymentStatus === "PAID") {
        return mc_paid(page, { data });
    } else if (paymentStatus === "PARTIAL") {
        return mc_partial(page, { data });
    } else {
        return mc_unpaid(page, { data });
    }
};

// Retry mechanism for resilient scraping
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

// Main search function - entry point for the controller
const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    let context = null;

    try {
        // Validate request
        if (!fetch_type || (fetch_type !== "html" && fetch_type !== "api")) {
            return res.status(200).render("error_data", {
                error: true,
                message: "Invalid Access"
            });
        }

        // Initialize browser
        const browser = await getBrowserInstance();
        context = await browser.createBrowserContext();
        const page = await context.newPage();

        // Set user agent to avoid detection
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        );
        page.setDefaultNavigationTimeout(90000);

        // Enable request interception for performance optimization
        await page.setRequestInterception(true);
        page.on("request", (reqInt) => {
            // Block non-essential resources
            if (["stylesheet", "font", "image", "media"].includes(reqInt.resourceType())) {
                reqInt.abort();
            } else {
                reqInt.continue();
            }
        });

        // Perform the scraping with retry logic
        const data = await retryable_scrape(page, account);

        // Return response based on fetch type
        if (fetch_type === "html") {
            res.status(200).render("parcel_data_official", data);
        } else if (fetch_type === "api") {
            res.status(200).json({
                result: data
            });
        }
    } catch (error) {
        console.error("Error in search function:", error);
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
        // Clean up browser context
        if (context) {
            await context.close();
        }
    }
};

// Export the search function for use in Express routes
export { search };
