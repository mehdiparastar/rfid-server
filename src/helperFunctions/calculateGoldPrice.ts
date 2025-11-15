import { GoldItem } from "src/gold-currency/gold-currency.service"

export const calculateGoldPrice = (
    karat: number | undefined,
    weight: number | undefined,
    makingCharge: number | undefined,
    profit: number | undefined,
    vat: number | undefined,
    currencyData: Partial<GoldItem>,
    accessoriesCharge: number
) => {
    const unitPrice = Number(currencyData.price)
    const unitKarat = Number(currencyData.karat)

    if (karat && weight && makingCharge != null && profit != null && vat != null && unitPrice) {
        if (karat > 0 && weight > 0 && makingCharge >= 0 && profit >= 0 && vat >= 0 && unitPrice > 0) {
            return (karat / unitKarat * weight * unitPrice * (1 + (makingCharge / 100)) * (1 + (profit / 100)) * (1 + (vat / 100))) + Number(accessoriesCharge)
        }
    }
}