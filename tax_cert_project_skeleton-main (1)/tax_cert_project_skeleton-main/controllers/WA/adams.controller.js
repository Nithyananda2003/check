//harsh
import { processTaxData } from "../../utils/helpers/filterTaxHistory.js";
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const timeout_option = {
    timeout: 90000,
};

const ac_1 = async (page, url, account) => {
    try {
        // Go to site
        const status = await page.goto(url, { waitUntil: "domcontentloaded" });

        // --- I AGREE PAGE ---
        await page.waitForSelector("#cphContent_btnAgree", timeout_option);
        await Promise.all([
            page.locator("input[name='ctl00$cphContent$btnAgree']").click(),
            page.waitForNavigation({ waitUntil: "domcontentloaded" }),
        ]);

        // --- SEARCH FORM PAGE ---
        await page.waitForSelector("#q", timeout_option);
        await page.locator("input[name='q']").fill(account);

        await Promise.all([
            page.keyboard.press("Enter"),
            page.waitForNavigation({ waitUntil: "domcontentloaded" }),
        ]);

        // --- Extract URLs ---
        const nextUrls = await page.evaluate(() => {
            let urls = { Assessor: "", Treasurer: "" };
            const links = document.querySelectorAll("li a");

            if (links.length > 0) urls.Assessor = links[0].href || "";
            if (links.length > 1) urls.Treasurer = links[1].href || "";

            return urls;
        });

        return nextUrls;
    } catch (error) {
        console.log(error);
        throw new Error(error.message);
    }
};

const ac_2 = (page, urls) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Assessor Page
            await page.goto(urls.Assessor, {
                waitUntil: "domcontentloaded",
                timeout_option,
            });

            const data = await page.evaluate(() => {
                const getText = (id) => {
                    return document.querySelector(id)?.textContent;
                };

                let data = {
                    processed_date: new Date().toISOString().split("T")[0],
                    order_number: "",
                    borrower_name: "",
                    owner_name: [],
                    property_address: "",
                    parcel_number: "",
                    land_value: "",
                    improvements: "",
                    total_assessed_value: "",
                    exemption: "",
                    total_taxable_value: "",
                    notes: "",
                    delinquent: "",
                    taxing_authority: "Adams County Treasurer",
                    tax_history: [],
                };

                data["owner_name"] = getText("#cphContent_ParcelOwnerInfo1_lbOwnerName")
                    .replace(/amp;/g, "")
                    .split(/[,&]/);

                data["property_address"] =getText("#cphContent_ParcelOwnerInfo1_lbSitus")
                
       

                data["total_assessed_value"] = document.querySelectorAll(
                    "#cphContent_ctl04_grdValuations td"
                )[5]?.textContent;

                data["total_taxable_value"] = document.querySelectorAll(
                    "#cphContent_ctl04_grdValuations td"
                )[7].textContent;

                data["parcel_number"] = getText(
                    "#cphContent_ParcelOwnerInfo1_lbParcelNumber"
                );

                data["land_value"] = document.querySelectorAll(
                    "#cphContent_ctl00_dvMarketValues  tr td"
                )[1].textContent;

                data["improvements"] = document.querySelectorAll(
                    "#cphContent_ctl00_dvMarketValues  tr td"
                )[3].textContent;

                return data;
            });


            resolve(data);
        } catch (error) {
            reject(error);
        }
    });
};

const ac_3 = (page, data, urls) => {
    return new Promise(async (resolve, reject) => {
        try {
            // Treasurer Page
            await page.goto(urls.Treasurer, {
                waitUntil: "domcontentloaded",
                timeout: 60000
            });

            const DataWithTax = await page.evaluate((data) => {
                const makeTax = ({
                    year = "",
                    payment_type = "Annual",
                    status = "",
                    base_amount = "$0.00",
                    amount_paid = "$0.00",
                    amount_due = "$0.00",
                    mailing_date = "N/A",
                    due_date = "10/31",
                    delq_date = "11/01",
                    paid_date = "",
                    good_through_date = ""
                }) => ({
                    jurisdiction: "County",
                    year,
                    payment_type,
                    status,
                    base_amount,
                    amount_paid,
                    amount_due,
                    mailing_date,
                    due_date,
                    delq_date,
                    paid_date,
                    good_through_date,
                });

                // --- Paid Taxes ---
                document.querySelectorAll(".dataGridPrimary tr").forEach((primaryRow) => {
                    const nestedRows = primaryRow.querySelectorAll("table.dataGridSecondary tr");

                    nestedRows.forEach((nestedRow, j) => {
                        if (j !== 0) {
                            const tds = nestedRow.querySelectorAll("td");
                            if (tds.length > 0) {
                                data.tax_history.push(
                                    makeTax({
                                        year: tds[0]?.textContent.split("-")[0] || "",
                                        status: "Paid",
                                        base_amount: tds[2]?.textContent.trim() || "$0.00",
                                        amount_paid: tds[4]?.textContent.trim() || "$0.00",
                                        amount_due: "$0.00",
                                        paid_date: tds[1]?.textContent.trim() || "",
                                    })
                                );
                            }
                        }
                    });
                });

                // --- Unpaid / Due Taxes ---
                if (document.getElementById("cphContent_CurrentTaxYearInterest1_GridView1")) {
                    document.querySelectorAll("#cphContent_CurrentTaxYearInterest1_GridView1 tr").forEach((tr, i) => {
                        if (i !== 0) {
                            const tds = tr.querySelectorAll("td");
                            if (tds.length > 0) {
                                data.tax_history.push(
                                    makeTax({
                                        year: tds[3]?.textContent.trim().slice(0, 4) || "",
                                        status: "Unpaid",
                                        base_amount: tds[4]?.textContent.trim() || "$0.00",
                                        amount_due: tds[7]?.textContent.trim() || "$0.00",
                                    })
                                );
                            }
                        }
                    });
                }

                return data;
            }, data);

            resolve(DataWithTax);
        } catch (error) {
            reject(error);
        }
    });
};

const account_search = (page, url, account) => {
    return new Promise((resolve, reject) => {
        ac_1(page, url, account)
            .then((urls) =>
                ac_2(page, urls)
                    .then((data) => {
                        ac_3(page, data, urls)
                            .then((DataWithTax) => {
                                const finalResult = processTaxData(DataWithTax);
                                resolve(finalResult);
                            })
                            .catch((error) => {
                                console.log(error);
                                reject(new Error(error.message));
                            });
                    })
                    .catch((error) => {
                        console.log(error);
                        reject(new Error(error.message));
                    })
            )
            .catch((error) => {
                console.log(error);
                reject(new Error(error.message));
            });
    });
};


const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    try {
        const url =
            "https://adamswa-taxsifter.publicaccessnow.com/Search/Results.aspx";

        if (!fetch_type && (fetch_type != "html" || fetch_type != "api")) {
            return res.status(200).render("error_data", {
                error: true,
                message: "Invalid Access",
            });
        }

        const browser = await getBrowserInstance();
        const context = await browser.createBrowserContext();
        const page = await context.newPage();
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36"
        );

        page.setDefaultNavigationTimeout(90000);

        // INTERCEPT REQUESTS AND BLOCK CERTAIN RESOURCE TYPES
        await page.setRequestInterception(true);
        page.on("request", (req) => {
            if (
                req.resourceType() === "stylesheet" ||
                req.resourceType() === "font" ||
                req.resourceType() === "image"
            ) {
                req.abort();
            } else {
                req.continue();
            }
        });

        if (fetch_type == "html") {
            // FRONTEND ENDPOINT
            account_search(page, url, account)
                .then((data) => {
                    res.status(200).render("parcel_data_official", data);
                })
                .catch((error) => {
                    console.log(error);
                    res.status(200).render("error_data", {
                        error: true,
                        message: error.message,
                    });
                })
                .finally(async () => {
                    await context.close();
                });
        } else if (fetch_type == "api") {
            // API ENDPOINT
            account_search(page, url, account)
                .then((data) => {
                    res.status(200).json({
                        result: data,
                    });
                })
                .catch((error) => {
                    console.log(error);
                    res.status(500).json({
                        error: true,
                        message: error.message,
                    });
                })
                .finally(async () => {
                    await context.close();
                });
        }
    } catch (error) {
        console.log(error);
        if (fetch_type == "html") {
            res.status(200).render("error_data", {
                error: true,
                message: error.message,
            });
        } else if (fetch_type == "api") {
            res.status(500).json({
                error: true,
                message: error.message,
            });
        }
    }
};

export { search };
