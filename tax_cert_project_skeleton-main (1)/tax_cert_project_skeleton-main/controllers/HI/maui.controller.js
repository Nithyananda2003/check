// controllers/HI/maui.controller.js
import getBrowserInstance from "../../utils/chromium/browserLaunch.js"

const parseUSDate = (s) => {
  try {
    if (!s) return null
    const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
    if (!m) return null
    const mm = parseInt(m[1], 10) - 1
    const dd = parseInt(m[2], 10)
    const yy = parseInt(m[3], 10)
    const d = new Date(Date.UTC(yy, mm, dd))
    return isNaN(d) ? null : d
  } catch {
    return null
  }
}

const toISO = (s) => {
  try {
    const d = parseUSDate(s)
    return d ? d.toISOString().slice(0, 10) : ""
  } catch {
    return ""
  }
}

const mapSector = (period = "") => {
  try {
    if (period.endsWith("-1")) return "Installment #1"
    if (period.endsWith("-2")) return "Installment #2"
    return "Annual"
  } catch {
    return "Annual"
  }
}

const ac_1 = async (page, account) => {
  try {
    const url =
      "https://qpublic.schneidercorp.com/Application.aspx?App=MauiCountyHI&PageType=Search"
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 })
    try {
      const btn = await page.waitForSelector(
        ".modal.in .btn.btn-primary.button-1, .modal.show .btn.btn-primary.button-1",
        { timeout: 4000 }
      )
      if (btn) await btn.click()
    } catch {}
    await page.waitForSelector("#ctlBodyPane_ctl02_ctl01_txtParcelID", {
      timeout: 15000,
    })
    await page.type("#ctlBodyPane_ctl02_ctl01_txtParcelID", account, {
      delay: 30,
    })
    await Promise.all([
      page.click("#ctlBodyPane_ctl02_ctl01_btnSearch"),
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 60000 }),
    ])
    return true
  } catch (err) {
    throw new Error(`Step 1 failed: ${err.message}`)
  }
}

const ac_2 = async (page) => {
  try {
    return await page.evaluate(() => {
      const clean = (s) => (s || "").replace(/\s+/g, " ").trim()
      const datum = {
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
        taxing_authority:
          "Maui County Treasurer, 200 S. High Street, Wailuku, HI 96793, Ph: 808-270-8200",
        notes: "",
        delinquent: "",
        total_due_amount: "$0.00",
        tax_history: [],
      }

      try {
        const summaryRows = document.querySelectorAll(
          "#ctlBodyPane_ctl00_ctl01_dynamicSummaryData_divSummary tr"
        )
        summaryRows.forEach((tr) => {
          const label = tr.querySelector("strong")?.textContent?.trim()
          const val = tr.querySelector("span")?.innerText?.trim() || ""
          if (!label) return
          if (label.toLowerCase().includes("parcel number"))
            datum.parcel_number = val
          if (label.toLowerCase().includes("location address"))
            datum.property_address = val
        })
      } catch {}

      try {
        const owners = []
        const ownerBlock = document.querySelector(
          "#ctlBodyPane_ctl02_ctl01_lblOtherNames"
        )
        if (ownerBlock) {
          ownerBlock.innerText
            .replace(/Owner Names/i, "")
            .split(/\n|,|Fee Owner/i)
            .map((s) => clean(s))
            .filter(Boolean)
            .forEach((o) => owners.push(o))
        }
        const ownerTable = document.querySelector(
          "#ctlBodyPane_ctl02_ctl01_gvwAllOwners"
        )
        if (ownerTable) {
          ownerTable.querySelectorAll("tbody tr").forEach((tr) => {
            const name = tr.querySelector("th")?.innerText?.trim()
            if (name) owners.push(name)
          })
        }
        datum.owner_name = [...new Set(owners)]
      } catch {}

      try {
        const assessRow = document.querySelector(
          "#ctlBodyPane_ctl05_ctl01_gvValuation tbody tr"
        )
        if (assessRow) {
          const cols = assessRow.querySelectorAll("td, th")
          datum.land_value = clean(cols[4]?.textContent)
          datum.improvements = clean(cols[5]?.textContent)
          datum.total_assessed_value = clean(cols[6]?.textContent)
          datum.exemption = clean(cols[7]?.textContent)
          datum.total_taxable_value = clean(cols[8]?.textContent)
        }
      } catch {}

      const currentBills = []
      try {
        const billRows = document.querySelectorAll(
          "#ctlBodyPane_ctl07_ctl01_gvwCurrentTaxBill tbody tr"
        )
        billRows.forEach((r) => {
          const tds = r.querySelectorAll("td, th")
          if (tds.length < 10) return
          const period = tds[0].innerText.trim()
          const desc = tds[1].innerText.trim()
          const due = tds[2].innerText.trim()
          if (/Tax Bill with Interest/i.test(desc)) {
            const m = desc.match(/through\s+(\d{2}\/\d{2}\/\d{4})/i)
            if (m) datum._good_through_date = m[1]
            datum.total_due_amount = tds[9].innerText.trim()
            return
          }
          if (!/^\d{4}-\d+$/.test(period)) return
          currentBills.push({
            tax_period: period,
            due_date: due,
            delq_date: due
              ? new Date(new Date(due).getTime() + 86400000).toLocaleDateString(
                  "en-US"
                )
              : "",
            base_amount: tds[3].innerText.trim(),
            amount_due: tds[9].innerText.trim(),
          })
        })
      } catch {}

      const payments = []
      try {
        const histTable = document.querySelector(
          "#ctlBodyPane_ctl08_ctl01_gvwHistoricalTax"
        )
        if (histTable) {
          histTable.querySelectorAll("tbody > tr").forEach((yrRow) => {
            const plus = yrRow.querySelector("a[id^='btndiv']")
            const yearText = plus?.textContent?.trim() || ""
            if (!/^\d{4}$/.test(yearText)) return
            const detailRow = histTable.querySelector(`tr#tr${yearText}`)
            if (!detailRow) return
            const paymentsTable = detailRow.querySelector(
              `#div${yearText} table[id*="_gvwHistoricalTax_Payments"]`
            )
            if (!paymentsTable) return
            paymentsTable.querySelectorAll("tbody tr").forEach((tr) => {
              const tds = tr.querySelectorAll("td")
              if (tds.length < 3) return
              if (tds[0].innerText.trim().toLowerCase() === "totals:") return
              payments.push({
                year: yearText,
                paid_date_raw: tds[1].innerText.trim(),
                amount_paid_raw: tds[2].innerText.trim(),
              })
            })
          })
        }
      } catch {}

      return { datum, currentBills, payments }
    })
  } catch (err) {
    throw new Error(`Step 2 failed: ${err.message}`)
  }
}

const ac_tax_history = (datum, currentBills, payments) => {
  try {
    const unpaid = []
    currentBills.forEach((b) => {
      const amtDue = (b.amount_due || "").replace(/[^\d.-]/g, "")
      if (amtDue !== "0.00") {
        unpaid.push({
          jurisdiction: "County",
          year: (b.tax_period || "").split("-")[0] || "",
          payment_type: mapSector(b.tax_period || ""),
          status: "Unpaid",
          base_amount: b.base_amount || "",
          amount_paid: "$0.00",
          amount_due: b.amount_due || "",
          mailing_date: "N/A",
          due_date: b.due_date || "",
          delq_date: b.delq_date || "",
          paid_date: "",
          good_through_date: datum._good_through_date,
        })
      }
    })

    if (unpaid.length > 0) {
      datum.notes =
        "PRIOR YEAR(S)/CURRENT TAXES ARE UNPAID, NORMALLY TAXES ARE SEMI-ANNUAL."
      datum.delinquent = "YES"
      datum.tax_history = unpaid
    } else {
      const normalizedPays = payments
        .map((p) => {
          const iso = toISO(p.paid_date_raw)
          const amtNum =
            Number(p.amount_paid_raw.replace(/[^0-9.\-]/g, "")) || 0
          const abs = Math.abs(amtNum).toFixed(2)
          const amountPaid = `$${Number(abs).toLocaleString(undefined, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`
          return {
            year: p.year,
            paid_date_iso: iso,
            amount_paid: amountPaid,
          }
        })
        .filter((p) => p.paid_date_iso)

      normalizedPays.sort((a, b) =>
        a.paid_date_iso < b.paid_date_iso ? 1 : -1
      )
      const latest = normalizedPays[0]

      let due = ""
      let delq = ""
      if (latest) {
        const matchBill = currentBills.find((b) =>
          b.tax_period.startsWith(latest.year)
        )
        if (matchBill) {
          due = matchBill.due_date || ""
          delq = matchBill.delq_date || ""
        }
      }

      datum.notes =
        "ALL PRIORS ARE PAID, CURRENT TAXES ARE PAID, NORMALLY TAXES ARE SEMI-ANNUAL."
      datum.delinquent = "NONE"
      datum.tax_history = latest
        ? [
            {
              jurisdiction: "County",
              year: latest.year,
              payment_type: "Annual",
              status: "Paid",
              base_amount: latest.amount_paid,
              amount_paid: latest.amount_paid,
              amount_due: "$0.00",
              mailing_date: "N/A",
              due_date: due,
              delq_date: delq,
              paid_date: latest.paid_date_iso,
              good_through_date: datum._good_through_date,
            },
          ]
        : []
    }

    delete datum._good_through_date
    return datum
  } catch (err) {
    throw new Error(`Step 3 failed: ${err.message}`)
  }
}

const account_search = async (page, account) => {
  try {
    await ac_1(page, account)
    const { datum, currentBills, payments } = await ac_2(page)
    return ac_tax_history(datum, currentBills, payments)
  } catch (err) {
    throw new Error(`Account search failed: ${err.message}`)
  }
}

const search = async (req, res) => {
  const { fetch_type, account } = req.body
  try {
    const browser = await getBrowserInstance()
    const context = await browser.createBrowserContext()
    const page = await context.newPage()
    page.setDefaultNavigationTimeout(120000)
    await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
    await page.setRequestInterception(true)
    page.on("request", (r) => {
      if (["stylesheet", "font", "image"].includes(r.resourceType())) r.abort()
      else r.continue()
    })

    const data = await account_search(page, account)
    if (fetch_type === "html") {
      res.status(200).render("parcel_data_official", data)
    } else {
      res.status(200).json({ result: data })
    }
    await context.close()
  } catch (error) {
    console.error("Controller Error:", error.message)
    if (fetch_type === "html") {
      res
        .status(200)
        .render("error_data", { error: true, message: error.message })
    } else {
      res.status(500).json({ error: true, message: error.message })
    }
  }
}

export { search }
