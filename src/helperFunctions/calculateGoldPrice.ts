export const calculateGoldPrice = (weight: number, makingCharge: number, profit: number, vat: number, unitPrice: number) => {
    if (weight > 0 && makingCharge > 0 && profit > 0 && vat > 0 && unitPrice > 0) {
        return weight * unitPrice * (1 + (makingCharge / 100)) * (1 + (profit / 100)) * (1 + (vat / 100))
    }
}