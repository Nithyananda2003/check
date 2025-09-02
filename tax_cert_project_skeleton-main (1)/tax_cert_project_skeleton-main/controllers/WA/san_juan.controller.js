import { processTaxData } from "../../utils/helpers/filterTaxHistory.js";
import getBrowserInstance from "../../utils/chromium/browserLaunch.js";

const ac_1 = async (page, url, account) => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.goto(url, { waitUntil: "networkidle2" });
            await page.waitForSelector("input[name='propertySearchOptions$geoid']");
            await page.locator("input[name='propertySearchOptions$geoid']").click();
            await page.type("input[name='propertySearchOptions$geoid']", account, {
                delay: 100,
            });
            await page.keyboard.press("Enter");
            await page.waitForNavigation({ waitUntil: "networkidle2" });

            const Url = await page.evaluate(() => {
                let Url = null;
                document
                    .querySelectorAll("#propertySearchResults_resultsTable tbody tr")
                    .forEach((tr, i) => {
                        if (i !== 0 && i !== 2) {
                            let tds = tr.querySelectorAll("td")[9];
                            if (tds) {
                                Url = tds.querySelector("a")?.href || Url;
                            }
                        }
                    });
                return Url;
            });

            resolve(Url);
        } catch (error) {
            console.log(error);
            reject(new Error(error.message));
        }
    });
};

const ac_2 = async (page, account, Url) => {
    return new Promise(async (resolve, reject) => {
        try {
            await page.goto(Url, {
                waitUntil: "domcontentloaded",
                timeout: 60000,
            });

            const data =  await page.evaluate(() => {
        // --- Helper function to clean text ---
        const clean = (el) =>
          el ? el.textContent.trim().replace(/\s+/g, " ") : "";

        // --- Get table data ---
        const tds = Array.from(
          document.querySelectorAll("#propertyDetails table td")
        );
        const rows = Array.from(
          document.querySelectorAll("#ctl00_details_detailsTable tr")
        );

        // --- Get total taxable value ---
        let total_taxable_value = "";
        document
          .querySelectorAll(
            "#taxingJurisdictionPanel_TaxingJurisdictionDetails1_ownerTable tbody tr"
          )
          .forEach((tr, i) => {
            if (i === 2) {
              total_taxable_value = tr
                .querySelectorAll("td")[1]
                .textContent.trim();
            }
          });

        // --- Prepare result object ---
        let result = {
          processed_date: new Date().toISOString().split("T")[0],
          order_number: "",
          borrower_name: "",
          owner_name: [],
          property_address: clean(tds[39]),
          parcel_number: clean(tds[6]),
          land_value: document
            .querySelectorAll("#landDetails tbody tr")[1]
            .querySelectorAll("td")[8]
            .textContent.trim(),
          improvements: "$0",
          total_assessed_value: document
            .querySelectorAll("#landDetails tbody tr")[1]
            .querySelectorAll("td")[8]
            .textContent.trim(),
          exemption: "",
          total_taxable_value: total_taxable_value || "",
          notes:"",
          delinquent:"",
          taxing_authority: "San Juan County Treasurer",
          tax_history: [],
        };

        // --- Owner Name ---
        if (tds[50]) {
          result.owner_name = clean(tds[50])
            .split(/\s{2,}| and /)
            .map((s) => s.trim());
        }

        // --- Tax History ---
        rows
          .filter(
            (row) =>
              row.id.includes("DetailTable") && row.id.endsWith("totalsRow")
          )
          .forEach((tr) => {
            const t = Array.from(tr.querySelectorAll("td")).map((td) =>
              td.textContent.trim()
            );

            const toNumber = (val) =>
              parseFloat(val.replace(/[$,]/g, "")) || 0;
            const toMoney = (num) => `$${num.toFixed(2)}`;

            const firstHalf = toNumber(t[2]);
            const secondHalf = toNumber(t[3]);
            const paid = toNumber(t[6]);
            const due = toNumber(t[7]);

            result.tax_history.push({
              jurisdiction: "County",
              year: t[0]?.split("-")[0] || "",
              payment_type:
                firstHalf > 0 && secondHalf > 0 ? "Semi-annual" : "Annual",
              status: due > 0 ? "Unpaid" : "Paid",
              base_amount: toMoney(firstHalf + secondHalf),
              amount_paid: toMoney(paid),
              amount_due: toMoney(due),
              mailing_date: "N/A",
              due_date: "10/31",
              delq_date: "11/01",
              paid_date: "",
            });
          });

          let data= result

        return data;
           });
            resolve(data);
        } catch (error) {
            console.error("Scraping failed:", error);
            reject(error);
        }
    });
};

const account_search = (page, url, account) => {
    return new Promise((resolve, reject) => {
        ac_1(page, url, account)
            .then((Url) => ac_2(page, account, Url))
            .then((data) =>{
                const finalData = processTaxData(data)
                 resolve(finalData);
                })
            .catch((error) => reject(error));
    });
};

const search = async (req, res) => {
    const { fetch_type, account } = req.body;
    try {
        const url =
            "https://parcel.sanjuancountywa.gov/PropertyAccess/PropertySearch.aspx?cid=0";

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
