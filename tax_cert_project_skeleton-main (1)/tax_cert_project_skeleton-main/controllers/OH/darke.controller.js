
// Author: Nithyananda R S
// Optimized for Render hosting

import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

// Enhanced date formatting with validation
const formatDate = (month, day, year) => {
    try {
        const date = new Date(year, month - 1, day);
        const isValidDate = date && 
            date.getMonth() === month - 1 && 
            date.getDate() === day && 
            date.getFullYear() === year;
        
        if (!isValidDate) {
            throw new Error(`Invalid date: ${month}/${day}/${year}`);
        }
        return `${String(month).padStart(2, '0')}/${String(day).padStart(2, '0')}/${year}`;
    } catch (error) {
        console.error('Date formatting error:', error);
        return null;
    }
};

const getCurrentTaxYear = () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    return month >= 10 ? year + 1 : year;
};

// Enhanced currency formatting with error handling
const formatCurrency = (str) => {
    try {
        if (!str || typeof str !== 'string') return "$0.00";
        const cleaned = str.replace(/[^0-9.-]+/g, "");
        if (!cleaned || isNaN(parseFloat(cleaned))) return "$0.00";
        
        const number = parseFloat(cleaned);
        return `$${number.toLocaleString('en-US', { 
            minimumFractionDigits: 2, 
            maximumFractionDigits: 2 
        })}`;
    } catch (error) {
        console.error('Currency formatting error:', error);
        return "$0.00";
    }
};

// Enhanced due date calculator with error handling
const calculateDueDates = (year = getCurrentTaxYear(), county = 'Darke') => {
    try {
        const taxYear = parseInt(year);
        if (isNaN(taxYear) || taxYear < 2000 || taxYear > 2100) {
            throw new Error('Invalid tax year');
        }

        const countyDueDates = {
            'Darke': {
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
        if (!result.firstHalf.dueDate || !result.secondHalf.dueDate) {
            throw new Error('Failed to calculate due dates');
        }

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
        // Return default structure
        return {
            taxYear: getCurrentTaxYear(),
            displayYear: `${getCurrentTaxYear()}`,
            formattedDueDates: "02/21 & 07/18",
            defaultPaymentType: 'Semi-Annual',
            currentPeriod: 'Unknown'
        };
    }
};

// Enhanced payment status checker with timeout and error handling
const dc_1 = async (page, account) => {
    const timeout = 30000; // 30 second timeout
    const url = `https://darkecountyrealestate.org/Parcel?Parcel=${account}`;
    
    try {
        // Navigate with timeout
        await Promise.race([
            page.goto(url, { 
                waitUntil: "domcontentloaded",
                timeout: timeout 
            }),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Navigation timeout')), timeout)
            )
        ]);

        // Check if page loaded correctly
        const pageContentExists = await Promise.race([
            page.$('#Location'),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Page load timeout')), 10000)
            )
        ]);

        if (!pageContentExists) {
            return "NOT_FOUND";
        }

        // Wait for selector with timeout
        await Promise.race([
            page.waitForSelector('#Location', { timeout: 10000 }),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Selector timeout')), 10000)
            )
        ]);

        return await page.evaluate(() => {
            try {
                const billTable = document.querySelector('table[title*="Taxes"]');
                if (!billTable) return "NO_TAX_HISTORY";

                const title = billTable.getAttribute('title');
                const yearMatch = title?.match(/\d{4}/);
                if (!yearMatch) return "NO_TAX_HISTORY";

                const rows = Array.from(billTable.querySelectorAll('tr'));
                const netPaidRow = rows.find(row => row.textContent?.includes('NET PAID'));
                const netDueRow = rows.find(row => row.textContent?.includes('NET DUE'));

                if (!netPaidRow || !netDueRow) return "UNPAID";

                const paidCells = netPaidRow.querySelectorAll('td');
                const dueCells = netDueRow.querySelectorAll('td');

                if (paidCells.length < 4 || dueCells.length < 4) return "UNPAID";

                const firstHalfPaid = parseFloat(paidCells[2]?.textContent?.trim()?.replace(/[^0-9.-]+/g, "") || "0") || 0;
                const secondHalfPaid = parseFloat(paidCells[3]?.textContent?.trim()?.replace(/[^0-9.-]+/g, "") || "0") || 0;
                const firstHalfDue = parseFloat(dueCells[2]?.textContent?.trim()?.replace(/[^0-9.-]+/g, "") || "0") || 0;
                const secondHalfDue = parseFloat(dueCells[3]?.textContent?.trim()?.replace(/[^0-9.-]+/g, "") || "0") || 0;
                
                const totalDue = firstHalfDue + secondHalfDue;
                
                if (totalDue > 0) {
                    if (firstHalfPaid === 0 && secondHalfPaid === 0) {
                        return "UNPAID";
                    }
                    if (firstHalfPaid > 0 && secondHalfPaid === 0) {
                        return "PARTIAL";
                    }
                }
                
                return "PAID";
            } catch (error) {
                console.error('Error in page evaluation:', error);
                return "UNPAID";
            }
        });

    } catch (error) {
        console.error('Error in dc_1:', error);
        if (error.message.includes('timeout') || error.message.includes('Navigation')) {
            return "TIMEOUT";
        }
        return "NOT_FOUND";
    }
};

// Enhanced data scraping with better error handling
const dc_2 = async (page, account) => {
    try {
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
                taxing_authority: "Darke County Treasurer, 504 S. Broadway, Greenville, OH 45331, Ph: 937-547-7365",
                notes: "",
                delinquent: "",
                tax_history: []
            };

            const findTableValue = (tableId, rowIndex, selector) => {
                try {
                    const table = document.querySelector(`#${tableId} .table`);
                    if (!table) return "N/A";
                    const row = table.querySelector(`tr:nth-child(${rowIndex})`);
                    return row?.querySelector(selector)?.textContent?.trim() || "N/A";
                } catch (error) {
                    console.error('Error finding table value:', error);
                    return "N/A";
                }
            };

            try {
                datum.owner_name[0] = findTableValue('Location', 2, '.TableValue');
                datum.property_address = findTableValue('Location', 3, '.TableValue');

                const valuationRow = document.querySelector('.table-responsive .table tbody tr:first-child');
                if (valuationRow) {
                    datum.land_value = valuationRow.querySelector('td[headers="appraised appraisedLand"]')?.textContent?.trim() || "N/A";
                    datum.improvements = valuationRow.querySelector('td[headers="appraised appraisedImprovements"]')?.textContent?.trim() || "N/A";
                    datum.total_assessed_value = valuationRow.querySelector('td[headers="assessed assessedTotal"]')?.textContent?.trim() || "N/A";
                    datum.total_taxable_value = datum.total_assessed_value;
                }
            } catch (error) {
                console.error('Error extracting property data:', error);
            }

            return datum;
        });

        pageData.parcel_number = account;
        pageData.notes = "";
        pageData.delinquent = "";

        return { data: pageData };
    } catch (error) {
        console.error('Error in dc_2:', error);
        // Return minimal data structure on error
        return {
            data: {
                processed_date: new Date().toISOString().split("T")[0],
                order_number: "",
                borrower_name: "",
                owner_name: ["Data Extraction Error"],
                property_address: "Data Extraction Error",
                parcel_number: account,
                land_value: "N/A",
                improvements: "N/A",
                total_assessed_value: "N/A",
                exemption: "N/A",
                total_taxable_value: "N/A",
                taxing_authority: "Darke County Treasurer, 504 S. Broadway, Greenville, OH 45331, Ph: 937-547-7365",
                notes: "Error occurred during data extraction.",
                delinquent: "N/A",
                tax_history: []
            }
        };
    }
};

// Handle not found case
const dc_not_found = (account) => {
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
        taxing_authority: "Darke County Treasurer, 504 S. Broadway, Greenville, OH 45331, Ph: 937-547-7365",
        notes: "Parcel not found on the website.",
        delinquent: "N/A",
        tax_history: []
    };
};

// Handle timeout case
const dc_timeout = (account) => {
    return {
        processed_date: new Date().toISOString().split("T")[0],
        order_number: "",
        borrower_name: "Connection Timeout",
        owner_name: ["Connection Timeout"],
        property_address: "Connection Timeout",
        parcel_number: account,
        land_value: "N/A",
        improvements: "N/A",
        total_assessed_value: "N/A",
        exemption: "N/A",
        total_taxable_value: "N/A",
        taxing_authority: "Darke County Treasurer, 504 S. Broadway, Greenville, OH 45331, Ph: 937-547-7365",
        notes: "Connection timeout occurred while accessing the website. Please try again later.",
        delinquent: "N/A",
        tax_history: []
    };
};

// Handle no tax history case
const dc_no_tax_history = (bundle) => {
    bundle.data.tax_history = [];
    bundle.data.notes = "Tax history and current taxes are not available on the website.";
    bundle.data.delinquent = "N/A";
    return bundle.data;
};

// Enhanced PAID branch with better error handling
const dc_paid = async (page, bundle) => {
    try {
        const taxHistory = await page.evaluate(() => {
            const formatCurrency = (str) => {
                try {
                    if (!str || typeof str !== 'string') return "$0.00";
                    const cleaned = str.replace(/[^0-9.-]+/g, "");
                    if (!cleaned || isNaN(parseFloat(cleaned))) return "$0.00";
                    const number = parseFloat(cleaned);
                    return `$${number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                } catch {
                    return "$0.00";
                }
            };

            try {
                const table = document.querySelector('table[title="Tax Payments"]');
                if (!table) return [];

                const rows = Array.from(table.querySelectorAll('tbody tr'));
                let latestYear = null;
                const history = [];

                rows.forEach(row => {
                    try {
                        const cells = row.querySelectorAll("td");
                        if (cells.length < 7) return;

                        const datePaid = cells[0]?.textContent?.trim() || "";
                        const cycle = cells[1]?.textContent?.trim() || "";
                        const firstHalf = cells[3]?.textContent?.trim() || "";
                        const secondHalf = cells[4]?.textContent?.trim() || "";

                        const yearSuffix = cycle.split('-')[1];
                        if (!yearSuffix) return;
                        const year = `20${yearSuffix}`;

                        if (!latestYear) latestYear = year;
                        if (year !== latestYear) return;

                        const isFirstHalf = cycle.startsWith("1-");
                        const amount = formatCurrency(isFirstHalf ? firstHalf : secondHalf);

                        history.push({
                            jurisdiction: "County",
                            year,
                            payment_type: isFirstHalf ? "Installment #1" : "Installment #2",
                            status: "Paid",
                            base_amount: amount,
                            amount_paid: amount,
                            amount_due: "$0.00",
                            mailing_date: "N/A",
                            due_date: isFirstHalf ? `02/21/${year}` : `07/18/${year}`,
                            delq_date: isFirstHalf ? `02/22/${year}` : `07/19/${year}`,
                            paid_date: datePaid,
                            good_through_date: ""
                        });
                    } catch (error) {
                        console.error('Error processing payment row:', error);
                    }
                });

                return history.reverse();
            } catch (error) {
                console.error('Error in dc_paid evaluation:', error);
                return [];
            }
        });

        bundle.data.tax_history = taxHistory;
        
        if (taxHistory.length > 0) {
            const paymentType = taxHistory.length === 1 ? "Annual" : "Semi-Annual";
            if (paymentType === "Semi-Annual" && taxHistory.length === 2) {
                taxHistory.forEach(item => item.payment_type = "Semi-Annual");
            } else if (paymentType === "Annual") {
                taxHistory[0].payment_type = "Annual";
            }
            
            const dates = calculateDueDates(taxHistory[0]?.year);
            bundle.data.notes = `ALL PRIORS ARE PAID, ${dates.displayYear} TAXES ARE PAID, NORMALLY TAXES ARE PAID ${paymentType.toUpperCase()}, NORMAL DUE DATES ARE ${dates.formattedDueDates}`;
            bundle.data.delinquent = "NONE";
        } else {
            bundle.data.notes = "Payment information could not be retrieved.";
            bundle.data.delinquent = "UNKNOWN";
        }

        return bundle.data;
    } catch (error) {
        console.error('Error in dc_paid:', error);
        bundle.data.notes = "Error occurred while processing payment information.";
        bundle.data.delinquent = "UNKNOWN";
        bundle.data.tax_history = [];
        return bundle.data;
    }
};

// Enhanced PARTIAL branch with better error handling
const dc_partial = async (page, bundle) => {
    try {
        const taxHistory = await page.evaluate(() => {
            const formatCurrency = (str) => {
                try {
                    if (!str || typeof str !== 'string') return "$0.00";
                    const cleaned = str.replace(/[^0-9.-]+/g, "");
                    if (!cleaned || isNaN(parseFloat(cleaned))) return "$0.00";
                    const number = parseFloat(cleaned);
                    return `$${number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                } catch {
                    return "$0.00";
                }
            };

            try {
                const table = document.querySelector('table[title="Tax Payments"]');
                if (!table) return [];

                const rows = Array.from(table.querySelectorAll('tbody tr'));
                let latestYear = null;
                const history = [];
                let secondHalfAmount = "$0.00";

                rows.forEach(row => {
                    try {
                        const cells = row.querySelectorAll("td");
                        if (cells.length < 7) return;

                        const datePaid = cells[0]?.textContent?.trim() || "";
                        const cycle = cells[1]?.textContent?.trim() || "";
                        const firstHalf = cells[3]?.textContent?.trim() || "";
                        const secondHalf = cells[4]?.textContent?.trim() || "";

                        const yearSuffix = cycle.split('-')[1];
                        if (!yearSuffix) return;
                        const year = `20${yearSuffix}`;

                        if (!latestYear) latestYear = year;
                        if (year !== latestYear) return;

                        const isFirstHalf = cycle.startsWith("1-");
                        if (isFirstHalf && datePaid) {
                            const amount = formatCurrency(firstHalf);
                            history.push({
                                jurisdiction: "County",
                                year,
                                payment_type: "First Installment",
                                status: "Paid",
                                base_amount: amount,
                                amount_paid: amount,
                                amount_due: "$0.00",
                                mailing_date: "N/A",
                                due_date: `02/21/${year}`,
                                delq_date: `02/22/${year}`,
                                paid_date: datePaid,
                                good_through_date: ""
                            });
                        }

                        if (!isFirstHalf) {
                            secondHalfAmount = formatCurrency(secondHalf);
                        }
                    } catch (error) {
                        console.error('Error processing partial payment row:', error);
                    }
                });

                if (latestYear) {
                    history.push({
                        jurisdiction: "County",
                        year: latestYear,
                        payment_type: "Second Installment",
                        status: "Unpaid",
                        base_amount: secondHalfAmount !== "$0.00" ? secondHalfAmount : "TBD",
                        amount_paid: "$0.00",
                        amount_due: secondHalfAmount !== "$0.00" ? secondHalfAmount : "TBD",
                        mailing_date: "N/A",
                        due_date: `07/18/${latestYear}`,
                        delq_date: `07/19/${latestYear}`,
                        paid_date: "",
                        good_through_date: ""
                    });
                }

                return history;
            } catch (error) {
                console.error('Error in dc_partial evaluation:', error);
                return [];
            }
        });

        bundle.data.tax_history = taxHistory;
        
        if (taxHistory.length > 0) {
            const dates = calculateDueDates(taxHistory[0]?.year);
            bundle.data.notes = `PRIOR YEAR(S) TAXES ARE PAID, ${dates.displayYear} 1ST INSTALLMENT PAID, 2ND INSTALLMENT DUE, NORMALLY TAXES ARE PAID ${dates.defaultPaymentType.toUpperCase()}, NORMAL DUE DATES ARE ${dates.formattedDueDates}`;
            bundle.data.delinquent = "YES";
        } else {
            bundle.data.notes = "Partial payment information could not be retrieved.";
            bundle.data.delinquent = "UNKNOWN";
        }

        return bundle.data;
    } catch (error) {
        console.error('Error in dc_partial:', error);
        bundle.data.notes = "Error occurred while processing partial payment information.";
        bundle.data.delinquent = "UNKNOWN";
        bundle.data.tax_history = [];
        return bundle.data;
    }
};

// Enhanced UNPAID branch with better error handling
const dc_unpaid = async (page, bundle) => {
    try {
        const taxData = await page.evaluate(() => {
            const formatCurrency = (str) => {
                try {
                    if (!str || typeof str !== 'string') return "$0.00";
                    const cleaned = str.replace(/[^0-9.-]+/g, "");
                    if (!cleaned || isNaN(parseFloat(cleaned))) return "$0.00";
                    const number = parseFloat(cleaned);
                    return `$${number.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                } catch {
                    return "$0.00";
                }
            };

            try {
                const history = [];
                const taxTables = document.querySelectorAll('table[title*="Taxes"]');

                taxTables.forEach(billTable => {
                    try {
                        const title = billTable.getAttribute('title');
                        const yearMatch = title?.match(/\d{4}/);
                        if (!yearMatch) return;
                        const year = yearMatch[0];

                        const rows = Array.from(billTable.querySelectorAll('tr'));
                        const netDueRow = rows.find(row => row.textContent?.includes('NET DUE'));

                        if (!netDueRow) return;

                        const dueCells = netDueRow.querySelectorAll('td');
                        if (dueCells.length < 4) return;

                        const dueFirstHalf = formatCurrency(dueCells[2]?.textContent?.trim() || "");
                        const dueSecondHalf = formatCurrency(dueCells[3]?.textContent?.trim() || "");

                        const parseAmount = (str) => parseFloat(str.replace(/[^0-9.-]+/g, "")) || 0;

                        const firstHalfAmountDue = parseAmount(dueFirstHalf);
                        const secondHalfAmountDue = parseAmount(dueSecondHalf);

                        // Add First Installment if unpaid
                        if (firstHalfAmountDue > 0) {
                            const baseAmountRow = rows.find(row => row.textContent?.includes('Tax Billed'));
                            const baseCells = baseAmountRow?.querySelectorAll('td');
                            const baseFirstHalf = baseCells?.length >= 3 ? formatCurrency(baseCells[2]?.textContent?.trim() || "") : "N/A";

                            history.push({
                                jurisdiction: "County",
                                year: year,
                                payment_type: "First Installment",
                                status: "Unpaid",
                                base_amount: baseFirstHalf,
                                amount_paid: "N/A",
                                amount_due: dueFirstHalf,
                                mailing_date: "N/A",
                                due_date: `02/21/${year}`,
                                delq_date: `02/22/${year}`,
                                paid_date: "",
                                good_through_date: ""
                            });
                        }

                        // Add Second Installment if unpaid
                        if (secondHalfAmountDue > 0) {
                            const baseAmountRow = rows.find(row => row.textContent?.includes('Tax Billed'));
                            const baseCells = baseAmountRow?.querySelectorAll('td');
                            const baseSecondHalf = baseCells?.length >= 4 ? formatCurrency(baseCells[3]?.textContent?.trim() || "") : "N/A";

                            history.push({
                                jurisdiction: "County",
                                year: year,
                                payment_type: "Second Installment",
                                status: "Unpaid",
                                base_amount: baseSecondHalf,
                                amount_paid: "N/A",
                                amount_due: dueSecondHalf,
                                mailing_date: "N/A",
                                due_date: `07/18/${year}`,
                                delq_date: `07/19/${year}`,
                                paid_date: "",
                                good_through_date: ""
                            });
                        }
                    } catch (error) {
                        console.error('Error processing unpaid tax table:', error);
                    }
                });
                
                // Sort history by year (descending) and then installment number
                history.sort((a, b) => {
                    if (a.year !== b.year) {
                        return parseInt(b.year) - parseInt(a.year);
                    }
                    return a.payment_type.includes("First") ? -1 : 1;
                });

                return history;
            } catch (error) {
                console.error('Error in dc_unpaid evaluation:', error);
                return [];
            }
        });

        bundle.data.tax_history = taxData;
        const dates = calculateDueDates();
        
        if (taxData.length > 0) {
            const unpaidYears = [...new Set(taxData.map(item => item.year))];
            bundle.data.notes = `MULTIPLE YEARS (${unpaidYears.sort((a, b) => b - a).join(', ')}) TAXES ARE DUE`;
            bundle.data.delinquent = "YES";
        } else {
            bundle.data.notes = "ALL TAXES ARE PAID, INCLUDING PRIORS.";
            bundle.data.delinquent = "NONE";
        }
        
        return bundle.data;
    } catch (error) {
        console.error('Error in dc_unpaid:', error);
        bundle.data.notes = "Error occurred while processing unpaid tax information.";
        bundle.data.delinquent = "UNKNOWN";
        bundle.data.tax_history = [];
        return bundle.data;
    }
};

// Enhanced orchestrator function with better error handling
const account_search = async (page, account) => {
    try {
        // Step 1: Data Scraping with timeout handling
        const paymentStatus = await dc_1(page, account);

        // Handle different status cases
        if (paymentStatus === "NOT_FOUND") {
            return dc_not_found(account);
        }
        
        if (paymentStatus === "TIMEOUT") {
            return dc_timeout(account);
        }

        const { data } = await dc_2(page, account);

        // Step 2: Analysis and Formatting
        switch (paymentStatus) {
            case "NO_TAX_HISTORY":
                return dc_no_tax_history({ data });
            case "PAID":
                return await dc_paid(page, { data });
            case "PARTIAL":
                return await dc_partial(page, { data });
            default:
                return await dc_unpaid(page, { data });
        }
    } catch (error) {
        console.error('Error in account_search:', error);
        throw error;
    }
};

// Enhanced retry logic with exponential backoff
const retryable_scrape = async (page, account, maxRetries = 3) => {
    let retries = 0;
    let lastError = null;

    while (retries < maxRetries) {
        try {
            const result = await account_search(page, account);
            return result;
        } catch (error) {
            lastError = error;
            console.error(`Scraping attempt ${retries + 1} failed for account ${account}:`, error.message);
            retries++;
            
            if (retries >= maxRetries) {
                // Return timeout result on final failure
                return dc_timeout(account);
            }
            
            // Exponential backoff with jitter
            const delay = Math.min(1000 * Math.pow(2, retries) + Math.random() * 1000, 10000);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }

    // This should never be reached, but just in case
    return dc_timeout(account);
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
            // Block non-essential resources for efficiency
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
