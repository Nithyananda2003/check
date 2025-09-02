export function processTaxData(result) {
    const taxes = result.tax_history || [];
    if (taxes.length === 0) return result;

    const unpaid = taxes.filter(t => t.status === "Unpaid");
    const paid = taxes.filter(t => t.status === "Paid");

    // Case 1: If there are unpaid taxes → keep only unpaid
    if (unpaid.length > 0) {
        const years = unpaid.map(u => u.year).join(", ");
        result.delinquent = "YES";
        result.notes = `PRIOR YEAR(S) TAXES ARE DUE, ${years} TAXES ARE DELINQUENT, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATES ARE 03/31`;
        result.tax_history = unpaid;
        return result;
    }

    // Case 2: Installments
    const hasInstallments = taxes.some(t => t.payment_type.includes("Installment"));
    if (hasInstallments) {
        const latestInstallment = taxes.sort((a, b) => new Date(b.due_date) - new Date(a.due_date))[0];
        if (latestInstallment.status === "Paid") {
            result.delinquent = "NONE";
            result.notes = `ALL PRIORS ARE PAID, ${latestInstallment.year} ${latestInstallment.payment_type} ARE PAID , NORMALLY TAXES ARE PAID QUARTERLY, NORMAL DUE DATES ARE 06/30, 09/30, 12/31 & 03/31`;
        } else {
            result.delinquent = "PENDING";
            result.notes = `INSTALLMENT PLAN ACTIVE, NEXT INSTALLMENT DUE ON ${latestInstallment.due_date}`;
        }
        result.tax_history = [latestInstallment]; // keep only latest installment
        return result;
    }

    // Case 3: All Paid (Annual) → keep latest year only
    const latestYear = Math.max(...paid.map(t => +t.year));
    const latestPaid = paid.filter(t => t.year == latestYear);
    result.delinquent = "NONE";
    result.notes = `ALL PRIORS ARE PAID, ${latestYear} TAXES ARE PAID AT DISCOUNT, NORMALLY TAXES ARE PAID ANNUALLY, NORMAL DUE DATES ARE 03/31`;
    result.tax_history = latestPaid;
    return result;
}
