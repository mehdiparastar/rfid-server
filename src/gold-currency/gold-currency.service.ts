import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import * as jalaali from 'jalaali-js';
import { firstValueFrom } from 'rxjs';
import { GoldProductSUBType } from '../products/dto/create-product.dto';

export type GoldItem = {
    change_value: number;
    date: string;
    name: string;
    name_en: string;
    path_icon: string;
    price: number;
    symbol: GoldProductSUBType;
    time: string;
    time_unix: number;
    unit: string;
    karat: number;
}

const assignKarat = (goldItem: GoldItem) => {
    if (goldItem.symbol.includes("COIN") && !goldItem.symbol.includes("PCOIN")) {
        return ({
            ...goldItem,
            karat: 900,
            price:
                goldItem.symbol === "IR_COIN_EMAMI" ? goldItem.price / 8.133 :
                    goldItem.symbol === "IR_COIN_BAHAR" ? goldItem.price / 8.133 :
                        goldItem.symbol === "IR_COIN_HALF" ? goldItem.price / 4.066 :
                            goldItem.symbol === "IR_COIN_QUARTER" ? goldItem.price / 2.033 :
                                goldItem.symbol === "IR_COIN_1G" ? goldItem.price / 1.01 :
                                    goldItem.price
        })
    }
    if (goldItem.symbol.includes("PCOIN")) {
        return ({
            ...goldItem,
            karat: 750,
            price:
                goldItem.symbol === "IR_PCOIN_1-5G" ? goldItem.price / 1.50 :
                    goldItem.symbol === "IR_PCOIN_1-4G" ? goldItem.price / 1.40 :
                        goldItem.symbol === "IR_PCOIN_1-3G" ? goldItem.price / 1.30 :
                            goldItem.symbol === "IR_PCOIN_1-2G" ? goldItem.price / 1.20 :
                                goldItem.symbol === "IR_PCOIN_1-1G" ? goldItem.price / 1.10 :
                                    goldItem.symbol === "IR_PCOIN_1G" ? goldItem.price / 1.00 :
                                        goldItem.symbol === "IR_PCOIN_900MG" ? goldItem.price / 0.90 :
                                            goldItem.symbol === "IR_PCOIN_800MG" ? goldItem.price / 0.80 :
                                                goldItem.symbol === "IR_PCOIN_700MG" ? goldItem.price / 0.70 :
                                                    goldItem.symbol === "IR_PCOIN_600MG" ? goldItem.price / 0.60 :
                                                        goldItem.symbol === "IR_PCOIN_500MG" ? goldItem.price / 0.50 :
                                                            goldItem.symbol === "IR_PCOIN_400MG" ? goldItem.price / 0.40 :
                                                                goldItem.symbol === "IR_PCOIN_300MG" ? goldItem.price / 0.30 :
                                                                    goldItem.symbol === "IR_PCOIN_200MG" ? goldItem.price / 0.20 :
                                                                        goldItem.symbol === "IR_PCOIN_100MG" ? goldItem.price / 0.10 :
                                                                            goldItem.symbol === "IR_PCOIN_70MG" ? goldItem.price / 0.070 :
                                                                                goldItem.symbol === "IR_PCOIN_50MG" ? goldItem.price / 0.050 :
                                                                                    goldItem.symbol === "IR_PCOIN_30MG" ? goldItem.price / 0.030 :
                                                                                        goldItem.price
        })
    }
    if (goldItem.symbol.includes("MELTED")) return ({ ...goldItem, karat: 750, price: goldItem.price / 4.3318 })
    if (goldItem.symbol.includes("XAUUSD")) return ({ ...goldItem, karat: 995, price: goldItem.price / 28.3495 })

    return ({ ...goldItem, karat: 750 })
}

@Injectable()
export class GoldCurrencyService {
    private cache: { data: any; timestamp: number } | null = null;
    private readonly CACHE_DURATION = 60 * 1000; // 1 minute in milliseconds
    // private readonly API_URL_ = 'https://BrsApi.ir/Api/Market/Gold_Currency.php?key=Bl13tlilwXFAV8dxe1ryIDAlfnSdGXdh';
    private readonly API_URL = 'https://BrsApi.ir/Api/Market/Gold_Currency_Pro.php?key=Bl13tlilwXFAV8dxe1ryIDAlfnSdGXdh&section=gold,currency';
    private readonly API_URL_TABAN = 'https://webservice.tgnsrv.ir/Pr/Get/baghaei9215/b09148199215b';

    // tabanReplyKeys = [
    //     "SekehRob",
    //     "SekehNim",
    //     "SekehTamam",
    //     "SekehEmam",
    //     "YekGram18",
    //     "KharidMotefaregheh18",
    //     "TavizMotefaregheh18",
    //     "YekGram20",
    //     "SekehGerami",
    //     "YekGram21",
    //     "Dollar",
    //     "Euro",
    //     "Derham",
    //     "OunceTala",
    //     "TimeRead",
    // ]
    // brsApiSymbols = [
    //     "IR_COIN_EMAMI",
    //     "IR_COIN_BAHAR",
    //     "IR_COIN_HALF",
    //     "IR_COIN_QUARTER",
    //     "IR_COIN_1G",
    //     "IR_PCOIN_1-5G",
    //     "IR_PCOIN_1-4G",
    //     "IR_PCOIN_1-3G",
    //     "IR_PCOIN_1-2G",
    //     "IR_PCOIN_1-1G",
    //     "IR_PCOIN_1G",
    //     "IR_PCOIN_900MG",
    //     "IR_PCOIN_800MG",
    //     "IR_PCOIN_700MG",
    //     "IR_PCOIN_600MG",
    //     "IR_PCOIN_500MG",
    //     "IR_PCOIN_400MG",
    //     "IR_PCOIN_300MG",
    //     "IR_PCOIN_200MG",
    //     "IR_PCOIN_100MG",
    //     "IR_GOLD_18K",
    //     "IR_GOLD_24K",
    //     "IR_GOLD_MELTED",
    //     "XAUUSD",
    // ]

    constructor(private readonly httpService: HttpService) { }

    async getGoldCurrencyData(): Promise<{ gold: GoldItem[] }> {
        // Check if cache exists and is still valid
        if (this.cache && Date.now() - this.cache.timestamp < this.CACHE_DURATION) {
            return this.cache.data;
        }

        try {
            // Fetch new data from API
            const response_TABAN = await firstValueFrom(this.httpService.get(this.API_URL_TABAN));
            const response = await firstValueFrom(this.httpService.get(this.API_URL));
            // const data_ = { gold: response_.data.gold };
            let data = {
                gold: [
                    ...response.data.gold.type,
                    ...response.data.gold.coin,
                    ...response.data.gold.coin_parsian,
                    ...response.data.gold.ounce,
                ]
            };


            const [gy, gm, gd] = response_TABAN.data.TimeRead.split(' ')[0].split("/").map(Number)
            const { jy, jm, jd } = jalaali.toJalaali(gy, gm, gd);
            const shamsiDate = `${jy}/${String(jm).padStart(2, '0')}/${String(jd).padStart(2, '0')}`;

            data = {
                gold: data.gold.map(item => {

                    if (item.symbol === "IR_GOLD_18K") {
                        const IR_GOLD_18K_B = data.gold.find(el => el.symbol === "IR_GOLD_18K")
                        const cond = IR_GOLD_18K_B.price > response_TABAN.data.YekGram18
                        const dateCond = IR_GOLD_18K_B.date === shamsiDate
                        const dateCond_T = IR_GOLD_18K_B.date < shamsiDate
                        const dateCond_B = IR_GOLD_18K_B.date > shamsiDate
                        const price = dateCond ?
                            (cond ? IR_GOLD_18K_B.price : response_TABAN.data.YekGram18) :
                            (dateCond_T ?
                                response_TABAN.data.YekGram18 :
                                (dateCond_B ?
                                    IR_GOLD_18K_B.price :
                                    response_TABAN.data.YekGram18
                                )
                            )
                        const base = dateCond ? (cond ? "B" : "T") : (dateCond_T ? "T" : (dateCond_B ? "B" : "T"))

                        return ({
                            ...IR_GOLD_18K_B,
                            price,
                            timeTaban: `${response_TABAN.data.TimeRead.split(' ')[1].split(':').slice(0, 2).join(':')}`,
                            dateTaban: shamsiDate,
                            base
                        })
                    }
                    if (item.symbol === "IR_GOLD_24K") {
                        const IR_GOLD_24K_B = data.gold.find(el => el.symbol === "IR_GOLD_24K")
                        const IR_GOLD_24K_T = response_TABAN.data.YekGram18 * 999.99 / 750
                        const cond = IR_GOLD_24K_B.price > IR_GOLD_24K_T
                        const dateCond = IR_GOLD_24K_B.date === shamsiDate
                        const dateCond_T = IR_GOLD_24K_B.date < shamsiDate
                        const dateCond_B = IR_GOLD_24K_B.date > shamsiDate
                        const price = dateCond ?
                            (cond ? IR_GOLD_24K_B.price : IR_GOLD_24K_T) :
                            (dateCond_T ?
                                IR_GOLD_24K_T :
                                (dateCond_B ? IR_GOLD_24K_B.price : IR_GOLD_24K_T)
                            )
                        const base = dateCond ? (cond ? "B" : "T") : (dateCond_T ? "T" : (dateCond_B ? "B" : "T"))

                        return ({
                            ...IR_GOLD_24K_B,
                            price,
                            timeTaban: `${response_TABAN.data.TimeRead.split(' ')[1].split(':').slice(0, 2).join(':')}`,
                            dateTaban: shamsiDate,
                            base
                        })
                    }
                    if (item.symbol === "IR_COIN_EMAMI") {
                        const IR_COIN_EMAMI_B = data.gold.find(el => el.symbol === "IR_COIN_EMAMI")
                        const IR_COIN_EMAMI_T = response_TABAN.data.SekehEmam * 1000
                        const cond = IR_COIN_EMAMI_B.price > IR_COIN_EMAMI_T
                        const dateCond = IR_COIN_EMAMI_B.date === shamsiDate
                        const dateCond_T = IR_COIN_EMAMI_B.date < shamsiDate
                        const dateCond_B = IR_COIN_EMAMI_B.date > shamsiDate
                        const price = dateCond ?
                            (cond ? IR_COIN_EMAMI_B.price : IR_COIN_EMAMI_T) :
                            (dateCond_T ?
                                IR_COIN_EMAMI_T :
                                (dateCond_B ?
                                    IR_COIN_EMAMI_B.price :
                                    IR_COIN_EMAMI_T
                                )
                            )
                        const base = dateCond ? (cond ? "B" : "T") : (dateCond_T ? "T" : (dateCond_B ? "B" : "T"))

                        return ({
                            ...IR_COIN_EMAMI_B,
                            price,
                            timeTaban: `${response_TABAN.data.TimeRead.split(' ')[1].split(':').slice(0, 2).join(':')}`,
                            dateTaban: shamsiDate,
                            base
                        })
                    }
                    if (item.symbol === "IR_COIN_BAHAR") {
                        const IR_COIN_BAHAR_B = data.gold.find(el => el.symbol === "IR_COIN_BAHAR")
                        const IR_COIN_BAHAR_T = response_TABAN.data.SekehTamam * 1000
                        const cond = IR_COIN_BAHAR_B.price > IR_COIN_BAHAR_T
                        const dateCond = IR_COIN_BAHAR_B.date === shamsiDate
                        const dateCond_T = IR_COIN_BAHAR_B.date < shamsiDate
                        const dateCond_B = IR_COIN_BAHAR_B.date > shamsiDate
                        const price = dateCond ?
                            (cond ? IR_COIN_BAHAR_B.price : IR_COIN_BAHAR_T) :
                            (dateCond_T ?
                                IR_COIN_BAHAR_T :
                                (dateCond_B ?
                                    IR_COIN_BAHAR_B.price :
                                    IR_COIN_BAHAR_T
                                )
                            )
                        const base = dateCond ? (cond ? "B" : "T") : (dateCond_T ? "T" : (dateCond_B ? "B" : "T"))

                        return ({
                            ...IR_COIN_BAHAR_B,
                            price,
                            timeTaban: `${response_TABAN.data.TimeRead.split(' ')[1].split(':').slice(0, 2).join(':')}`,
                            dateTaban: shamsiDate,
                            base
                        })
                    }
                    if (item.symbol === "IR_COIN_HALF") {
                        const IR_COIN_HALF_B = data.gold.find(el => el.symbol === "IR_COIN_HALF")
                        const IR_COIN_HALF_T = response_TABAN.data.SekehNim * 1000
                        const cond = IR_COIN_HALF_B.price > IR_COIN_HALF_T
                        const dateCond = IR_COIN_HALF_B.date === shamsiDate
                        const dateCond_T = IR_COIN_HALF_B.date < shamsiDate
                        const dateCond_B = IR_COIN_HALF_B.date > shamsiDate
                        const price = dateCond ?
                            (cond ? IR_COIN_HALF_B.price : IR_COIN_HALF_T) :
                            (dateCond_T ?
                                IR_COIN_HALF_T :
                                (dateCond_B ?
                                    IR_COIN_HALF_B.price :
                                    IR_COIN_HALF_T
                                )
                            )
                        const base = dateCond ? (cond ? "B" : "T") : (dateCond_T ? "T" : (dateCond_B ? "B" : "T"))

                        return ({
                            ...IR_COIN_HALF_B,
                            price,
                            timeTaban: `${response_TABAN.data.TimeRead.split(' ')[1].split(':').slice(0, 2).join(':')}`,
                            dateTaban: shamsiDate,
                            base
                        })
                    }
                    if (item.symbol === "IR_COIN_QUARTER") {
                        const IR_COIN_QUARTER_B = data.gold.find(el => el.symbol === "IR_COIN_QUARTER")
                        const IR_COIN_QUARTER_T = response_TABAN.data.SekehRob * 1000
                        const cond = IR_COIN_QUARTER_B.price > IR_COIN_QUARTER_T
                        const dateCond = IR_COIN_QUARTER_B.date === shamsiDate
                        const dateCond_T = IR_COIN_QUARTER_B.date < shamsiDate
                        const dateCond_B = IR_COIN_QUARTER_B.date > shamsiDate
                        const price = dateCond ?
                            (cond ? IR_COIN_QUARTER_B.price : IR_COIN_QUARTER_T) :
                            (dateCond_T ?
                                IR_COIN_QUARTER_T :
                                (dateCond_B ?
                                    IR_COIN_QUARTER_B.price :
                                    IR_COIN_QUARTER_T
                                )
                            )
                        const base = dateCond ? (cond ? "B" : "T") : (dateCond_T ? "T" : (dateCond_B ? "B" : "T"))

                        return ({
                            ...IR_COIN_QUARTER_B,
                            price,
                            timeTaban: `${response_TABAN.data.TimeRead.split(' ')[1].split(':').slice(0, 2).join(':')}`,
                            dateTaban: shamsiDate,
                            base
                        })
                    }
                    if (item.symbol === "IR_COIN_1G") {
                        const IR_COIN_1G_B = data.gold.find(el => el.symbol === "IR_COIN_1G")
                        const IR_COIN_1G_T = response_TABAN.data.SekehGerami * 1000
                        const cond = IR_COIN_1G_B.price > IR_COIN_1G_T
                        const dateCond = IR_COIN_1G_B.date === shamsiDate
                        const dateCond_T = IR_COIN_1G_B.date < shamsiDate
                        const dateCond_B = IR_COIN_1G_B.date > shamsiDate
                        const price = dateCond ?
                            (cond ? IR_COIN_1G_B.price : IR_COIN_1G_T) :
                            (dateCond_T ?
                                IR_COIN_1G_T :
                                (dateCond_B ?
                                    IR_COIN_1G_B.price :
                                    IR_COIN_1G_T
                                )
                            )
                        const base = dateCond ? (cond ? "B" : "T") : (dateCond_T ? "T" : (dateCond_B ? "B" : "T"))

                        return ({
                            ...IR_COIN_1G_B,
                            price,
                            timeTaban: `${response_TABAN.data.TimeRead.split(' ')[1].split(':').slice(0, 2).join(':')}`,
                            dateTaban: shamsiDate,
                            base
                        })
                    }
                    if (item.symbol === "IR_GOLD_MELTED") {
                        const IR_GOLD_MELTED_B = data.gold.find(el => el.symbol === "IR_GOLD_MELTED")
                        const IR_GOLD_MELTED_T = response_TABAN.data.YekGram18 * 4.3318
                        const cond = IR_GOLD_MELTED_B.price > IR_GOLD_MELTED_T
                        const dateCond = IR_GOLD_MELTED_B.date === shamsiDate
                        const dateCond_T = IR_GOLD_MELTED_B.date < shamsiDate
                        const dateCond_B = IR_GOLD_MELTED_B.date > shamsiDate
                        const price = dateCond ?
                            (cond ? IR_GOLD_MELTED_B.price : IR_GOLD_MELTED_T) :
                            (dateCond_T ?
                                IR_GOLD_MELTED_T :
                                (dateCond_B ? IR_GOLD_MELTED_B.price : IR_GOLD_MELTED_T)
                            )
                        const base = dateCond ? (cond ? "B" : "T") : (dateCond_T ? "T" : (dateCond_B ? "B" : "T"))

                        return ({
                            ...IR_GOLD_MELTED_B,
                            price,
                            timeTaban: `${response_TABAN.data.TimeRead.split(' ')[1].split(':').slice(0, 2).join(':')}`,
                            dateTaban: shamsiDate,
                            base
                        })
                    }
                    if (item.symbol === "XAUUSD") {
                        const XAUUSD_B = data.gold.find(el => el.symbol === "XAUUSD")
                        const XAUUSD_T = response_TABAN.data.OunceTala
                        const cond = XAUUSD_B.price > XAUUSD_T
                        const dateCond = XAUUSD_B.date === shamsiDate
                        const dateCond_T = XAUUSD_B.date < shamsiDate
                        const dateCond_B = XAUUSD_B.date > shamsiDate
                        const price = dateCond ?
                            (cond ? XAUUSD_B.price : XAUUSD_T) :
                            (dateCond_T ?
                                XAUUSD_T :
                                (dateCond_B ? XAUUSD_B.price : XAUUSD_T)
                            )
                        const base = dateCond ? (cond ? "B" : "T") : (dateCond_T ? "T" : (dateCond_B ? "B" : "T"))

                        return ({
                            ...XAUUSD_B,
                            price,
                            timeTaban: `${response_TABAN.data.TimeRead.split(' ')[1].split(':').slice(0, 2).join(':')}`,
                            dateTaban: shamsiDate,
                            base
                        })
                    }
                    if (item.symbol === "IR_PCOIN_1-5G") {
                        const IR_PCOIN_1_5G_B = data.gold.find(el => el.symbol === "IR_PCOIN_1-5G")
                        const IR_PCOIN_1_5G_T = response_TABAN.data.YekGram18 * 1.5
                        const cond = IR_PCOIN_1_5G_B.price > IR_PCOIN_1_5G_T
                        const dateCond = IR_PCOIN_1_5G_B.date === shamsiDate
                        const dateCond_T = IR_PCOIN_1_5G_B.date < shamsiDate
                        const dateCond_B = IR_PCOIN_1_5G_B.date > shamsiDate
                        const price = dateCond ?
                            (cond ? IR_PCOIN_1_5G_B.price : IR_PCOIN_1_5G_T) :
                            (dateCond_T ?
                                IR_PCOIN_1_5G_T :
                                (dateCond_B ? IR_PCOIN_1_5G_B.price : IR_PCOIN_1_5G_T)
                            )
                        const base = dateCond ? (cond ? "B" : "T") : (dateCond_T ? "T" : (dateCond_B ? "B" : "T"))

                        return ({
                            ...IR_PCOIN_1_5G_B,
                            price,
                            timeTaban: `${response_TABAN.data.TimeRead.split(' ')[1].split(':').slice(0, 2).join(':')}`,
                            dateTaban: shamsiDate,
                            base
                        })
                    }
                    if (item.symbol === "IR_PCOIN_1-4G") {
                        const IR_PCOIN_1_4G_B = data.gold.find(el => el.symbol === "IR_PCOIN_1-4G")
                        const IR_PCOIN_1_4G_T = response_TABAN.data.YekGram18 * 1.4
                        const cond = IR_PCOIN_1_4G_B.price > IR_PCOIN_1_4G_T
                        const dateCond = IR_PCOIN_1_4G_B.date === shamsiDate
                        const dateCond_T = IR_PCOIN_1_4G_B.date < shamsiDate
                        const dateCond_B = IR_PCOIN_1_4G_B.date > shamsiDate
                        const price = dateCond ?
                            (cond ? IR_PCOIN_1_4G_B.price : IR_PCOIN_1_4G_T) :
                            (dateCond_T ?
                                IR_PCOIN_1_4G_T :
                                (dateCond_B ?
                                    IR_PCOIN_1_4G_B.price :
                                    IR_PCOIN_1_4G_T
                                )
                            )
                        const base = dateCond ? (cond ? "B" : "T") : (dateCond_T ? "T" : (dateCond_B ? "B" : "T"))

                        return ({
                            ...IR_PCOIN_1_4G_B,
                            price,
                            timeTaban: `${response_TABAN.data.TimeRead.split(' ')[1].split(':').slice(0, 2).join(':')}`,
                            dateTaban: shamsiDate,
                            base
                        })
                    }
                    if (item.symbol === "IR_PCOIN_1-3G") {
                        const IR_PCOIN_1_3G_B = data.gold.find(el => el.symbol === "IR_PCOIN_1-3G")
                        const IR_PCOIN_1_3G_T = response_TABAN.data.YekGram18 * 1.3
                        const cond = IR_PCOIN_1_3G_B.price > IR_PCOIN_1_3G_T
                        const dateCond = IR_PCOIN_1_3G_B.date === shamsiDate
                        const dateCond_T = IR_PCOIN_1_3G_B.date < shamsiDate
                        const dateCond_B = IR_PCOIN_1_3G_B.date > shamsiDate
                        const price = dateCond ?
                            (cond ? IR_PCOIN_1_3G_B.price : IR_PCOIN_1_3G_T) :
                            (dateCond_T ?
                                IR_PCOIN_1_3G_T :
                                (dateCond_B ? IR_PCOIN_1_3G_B.price : IR_PCOIN_1_3G_T)
                            )
                        const base = dateCond ? (cond ? "B" : "T") : (dateCond_T ? "T" : (dateCond_B ? "B" : "T"))

                        return ({
                            ...IR_PCOIN_1_3G_B,
                            price,
                            timeTaban: `${response_TABAN.data.TimeRead.split(' ')[1].split(':').slice(0, 2).join(':')}`,
                            dateTaban: shamsiDate,
                            base
                        })
                    }
                    if (item.symbol === "IR_PCOIN_1-2G") {
                        const IR_PCOIN_1_2G_B = data.gold.find(el => el.symbol === "IR_PCOIN_1-2G")
                        const IR_PCOIN_1_2G_T = response_TABAN.data.YekGram18 * 1.2
                        const cond = IR_PCOIN_1_2G_B.price > IR_PCOIN_1_2G_T
                        const dateCond = IR_PCOIN_1_2G_B.date === shamsiDate
                        const dateCond_T = IR_PCOIN_1_2G_B.date < shamsiDate
                        const dateCond_B = IR_PCOIN_1_2G_B.date > shamsiDate
                        const price = dateCond ?
                            (cond ? IR_PCOIN_1_2G_B.price : IR_PCOIN_1_2G_T) :
                            (dateCond_T ?
                                IR_PCOIN_1_2G_T :
                                (dateCond_B ? IR_PCOIN_1_2G_B.price : IR_PCOIN_1_2G_T)
                            )
                        const base = dateCond ? (cond ? "B" : "T") : (dateCond_T ? "T" : (dateCond_B ? "B" : "T"))

                        return ({
                            ...IR_PCOIN_1_2G_B,
                            price,
                            timeTaban: `${response_TABAN.data.TimeRead.split(' ')[1].split(':').slice(0, 2).join(':')}`,
                            dateTaban: shamsiDate,
                            base
                        })
                    }
                    if (item.symbol === "IR_PCOIN_1-1G") {
                        const IR_PCOIN_1_1G_B = data.gold.find(el => el.symbol === "IR_PCOIN_1-1G")
                        const IR_PCOIN_1_1G_T = response_TABAN.data.YekGram18 * 1.1
                        const cond = IR_PCOIN_1_1G_B.price > IR_PCOIN_1_1G_T
                        const dateCond = IR_PCOIN_1_1G_B.date === shamsiDate
                        const dateCond_T = IR_PCOIN_1_1G_B.date < shamsiDate
                        const dateCond_B = IR_PCOIN_1_1G_B.date > shamsiDate
                        const price = dateCond ?
                            (cond ? IR_PCOIN_1_1G_B.price : IR_PCOIN_1_1G_T) :
                            (dateCond_T ?
                                IR_PCOIN_1_1G_T :
                                (dateCond_B ? IR_PCOIN_1_1G_B.price : IR_PCOIN_1_1G_T)
                            )
                        const base = dateCond ? (cond ? "B" : "T") : (dateCond_T ? "T" : (dateCond_B ? "B" : "T"))

                        return ({
                            ...IR_PCOIN_1_1G_B,
                            price,
                            timeTaban: `${response_TABAN.data.TimeRead.split(' ')[1].split(':').slice(0, 2).join(':')}`,
                            dateTaban: shamsiDate,
                            base
                        })
                    }
                    if (item.symbol === "IR_PCOIN_1G") {
                        const IR_PCOIN_1G_B = data.gold.find(el => el.symbol === "IR_PCOIN_1G")
                        const IR_PCOIN_1G_T = response_TABAN.data.YekGram18
                        const cond = IR_PCOIN_1G_B.price > IR_PCOIN_1G_T
                        const dateCond = IR_PCOIN_1G_B.date === shamsiDate
                        const dateCond_T = IR_PCOIN_1G_B.date < shamsiDate
                        const dateCond_B = IR_PCOIN_1G_B.date > shamsiDate
                        const price = dateCond ?
                            (cond ? IR_PCOIN_1G_B.price : IR_PCOIN_1G_T) :
                            (dateCond_T ?
                                IR_PCOIN_1G_T :
                                (dateCond_B ? IR_PCOIN_1G_B.price : IR_PCOIN_1G_T)
                            )
                        const base = dateCond ? (cond ? "B" : "T") : (dateCond_T ? "T" : (dateCond_B ? "B" : "T"))

                        return ({
                            ...IR_PCOIN_1G_B,
                            price,
                            timeTaban: `${response_TABAN.data.TimeRead.split(' ')[1].split(':').slice(0, 2).join(':')}`,
                            dateTaban: shamsiDate,
                            base
                        })
                    }
                    if (item.symbol === "IR_PCOIN_900MG") {
                        const IR_PCOIN_900MG_B = data.gold.find(el => el.symbol === "IR_PCOIN_900MG")
                        const IR_PCOIN_900MG_T = response_TABAN.data.YekGram18 * 0.9
                        const cond = IR_PCOIN_900MG_B.price > IR_PCOIN_900MG_T
                        const dateCond = IR_PCOIN_900MG_B.date === shamsiDate
                        const dateCond_T = IR_PCOIN_900MG_B.date < shamsiDate
                        const dateCond_B = IR_PCOIN_900MG_B.date > shamsiDate
                        const price = dateCond ?
                            (cond ? IR_PCOIN_900MG_B.price : IR_PCOIN_900MG_T) :
                            (dateCond_T ?
                                IR_PCOIN_900MG_T :
                                (dateCond_B ? IR_PCOIN_900MG_B.price : IR_PCOIN_900MG_T)
                            )
                        const base = dateCond ? (cond ? "B" : "T") : (dateCond_T ? "T" : (dateCond_B ? "B" : "T"))

                        return ({
                            ...IR_PCOIN_900MG_B,
                            price,
                            timeTaban: `${response_TABAN.data.TimeRead.split(' ')[1].split(':').slice(0, 2).join(':')}`,
                            dateTaban: shamsiDate,
                            base
                        })
                    }
                    if (item.symbol === "IR_PCOIN_800MG") {
                        const IR_PCOIN_800MG_B = data.gold.find(el => el.symbol === "IR_PCOIN_800MG")
                        const IR_PCOIN_800MG_T = response_TABAN.data.YekGram18 * 0.8
                        const cond = IR_PCOIN_800MG_B.price > IR_PCOIN_800MG_T
                        const dateCond = IR_PCOIN_800MG_B.date === shamsiDate
                        const dateCond_T = IR_PCOIN_800MG_B.date < shamsiDate
                        const dateCond_B = IR_PCOIN_800MG_B.date > shamsiDate
                        const price = dateCond ?
                            (cond ? IR_PCOIN_800MG_B.price : IR_PCOIN_800MG_T) :
                            (dateCond_T ?
                                IR_PCOIN_800MG_T :
                                (dateCond_B ? IR_PCOIN_800MG_B.price : IR_PCOIN_800MG_T)
                            )
                        const base = dateCond ? (cond ? "B" : "T") : (dateCond_T ? "T" : (dateCond_B ? "B" : "T"))

                        return ({
                            ...IR_PCOIN_800MG_B,
                            price,
                            timeTaban: `${response_TABAN.data.TimeRead.split(' ')[1].split(':').slice(0, 2).join(':')}`,
                            dateTaban: shamsiDate,
                            base
                        })
                    }
                    if (item.symbol === "IR_PCOIN_700MG") {
                        const IR_PCOIN_700MG_B = data.gold.find(el => el.symbol === "IR_PCOIN_700MG")
                        const IR_PCOIN_700MG_T = response_TABAN.data.YekGram18 * 0.7
                        const cond = IR_PCOIN_700MG_B.price > IR_PCOIN_700MG_T
                        const dateCond = IR_PCOIN_700MG_B.date === shamsiDate
                        const dateCond_T = IR_PCOIN_700MG_B.date < shamsiDate
                        const dateCond_B = IR_PCOIN_700MG_B.date > shamsiDate
                        const price = dateCond ?
                            (cond ? IR_PCOIN_700MG_B.price : IR_PCOIN_700MG_T) :
                            (dateCond_T ?
                                IR_PCOIN_700MG_T :
                                (dateCond_B ? IR_PCOIN_700MG_B.price : IR_PCOIN_700MG_T)
                            )
                        const base = dateCond ? (cond ? "B" : "T") : (dateCond_T ? "T" : (dateCond_B ? "B" : "T"))

                        return ({
                            ...IR_PCOIN_700MG_B,
                            price,
                            timeTaban: `${response_TABAN.data.TimeRead.split(' ')[1].split(':').slice(0, 2).join(':')}`,
                            dateTaban: shamsiDate,
                            base
                        })
                    }
                    if (item.symbol === "IR_PCOIN_600MG") {
                        const IR_PCOIN_600MG_B = data.gold.find(el => el.symbol === "IR_PCOIN_600MG")
                        const IR_PCOIN_600MG_T = response_TABAN.data.YekGram18 * 0.6
                        const cond = IR_PCOIN_600MG_B.price > IR_PCOIN_600MG_T
                        const dateCond = IR_PCOIN_600MG_B.date === shamsiDate
                        const dateCond_T = IR_PCOIN_600MG_B.date < shamsiDate
                        const dateCond_B = IR_PCOIN_600MG_B.date > shamsiDate
                        const price = dateCond ?
                            (cond ? IR_PCOIN_600MG_B.price : IR_PCOIN_600MG_T) :
                            (dateCond_T ?
                                IR_PCOIN_600MG_T :
                                (dateCond_B ? IR_PCOIN_600MG_B.price : IR_PCOIN_600MG_T)
                            )
                        const base = dateCond ? (cond ? "B" : "T") : (dateCond_T ? "T" : (dateCond_B ? "B" : "T"))

                        return ({
                            ...IR_PCOIN_600MG_B,
                            price,
                            timeTaban: `${response_TABAN.data.TimeRead.split(' ')[1].split(':').slice(0, 2).join(':')}`,
                            dateTaban: shamsiDate,
                            base
                        })
                    }
                    if (item.symbol === "IR_PCOIN_500MG") {
                        const IR_PCOIN_500MG_B = data.gold.find(el => el.symbol === "IR_PCOIN_500MG")
                        const IR_PCOIN_500MG_T = response_TABAN.data.YekGram18 * 0.5
                        const cond = IR_PCOIN_500MG_B.price > IR_PCOIN_500MG_T
                        const dateCond = IR_PCOIN_500MG_B.date === shamsiDate
                        const dateCond_T = IR_PCOIN_500MG_B.date < shamsiDate
                        const dateCond_B = IR_PCOIN_500MG_B.date > shamsiDate
                        const price = dateCond ?
                            (cond ? IR_PCOIN_500MG_B.price : IR_PCOIN_500MG_T) :
                            (dateCond_T ?
                                IR_PCOIN_500MG_T :
                                (dateCond_B ? IR_PCOIN_500MG_B.price : IR_PCOIN_500MG_T)
                            )
                        const base = dateCond ? (cond ? "B" : "T") : (dateCond_T ? "T" : (dateCond_B ? "B" : "T"))

                        return ({
                            ...IR_PCOIN_500MG_B,
                            price,
                            timeTaban: `${response_TABAN.data.TimeRead.split(' ')[1].split(':').slice(0, 2).join(':')}`,
                            dateTaban: shamsiDate,
                            base
                        })
                    }
                    if (item.symbol === "IR_PCOIN_400MG") {
                        const IR_PCOIN_400MG_B = data.gold.find(el => el.symbol === "IR_PCOIN_400MG")
                        const IR_PCOIN_400MG_T = response_TABAN.data.YekGram18 * 0.4
                        const cond = IR_PCOIN_400MG_B.price > IR_PCOIN_400MG_T
                        const dateCond = IR_PCOIN_400MG_B.date === shamsiDate
                        const dateCond_T = IR_PCOIN_400MG_B.date < shamsiDate
                        const dateCond_B = IR_PCOIN_400MG_B.date > shamsiDate
                        const price = dateCond ?
                            (cond ? IR_PCOIN_400MG_B.price : IR_PCOIN_400MG_T) :
                            (dateCond_T ?
                                IR_PCOIN_400MG_T :
                                (dateCond_B ? IR_PCOIN_400MG_B.price : IR_PCOIN_400MG_T)
                            )
                        const base = dateCond ? (cond ? "B" : "T") : (dateCond_T ? "T" : (dateCond_B ? "B" : "T"))

                        return ({
                            ...IR_PCOIN_400MG_B,
                            price,
                            timeTaban: `${response_TABAN.data.TimeRead.split(' ')[1].split(':').slice(0, 2).join(':')}`,
                            dateTaban: shamsiDate,
                            base
                        })
                    }
                    if (item.symbol === "IR_PCOIN_300MG") {
                        const IR_PCOIN_300MG_B = data.gold.find(el => el.symbol === "IR_PCOIN_300MG")
                        const IR_PCOIN_300MG_T = response_TABAN.data.YekGram18 * 0.3
                        const cond = IR_PCOIN_300MG_B.price > IR_PCOIN_300MG_T
                        const dateCond = IR_PCOIN_300MG_B.date === shamsiDate
                        const dateCond_T = IR_PCOIN_300MG_B.date < shamsiDate
                        const dateCond_B = IR_PCOIN_300MG_B.date > shamsiDate
                        const price = dateCond ?
                            (cond ? IR_PCOIN_300MG_B.price : IR_PCOIN_300MG_T) :
                            (dateCond_T ?
                                IR_PCOIN_300MG_T :
                                (dateCond_B ? IR_PCOIN_300MG_B.price : IR_PCOIN_300MG_T)
                            )
                        const base = dateCond ? (cond ? "B" : "T") : (dateCond_T ? "T" : (dateCond_B ? "B" : "T"))

                        return ({
                            ...IR_PCOIN_300MG_B,
                            price,
                            timeTaban: `${response_TABAN.data.TimeRead.split(' ')[1].split(':').slice(0, 2).join(':')}`,
                            dateTaban: shamsiDate,
                            base
                        })
                    }
                    if (item.symbol === "IR_PCOIN_200MG") {
                        const IR_PCOIN_200MG_B = data.gold.find(el => el.symbol === "IR_PCOIN_200MG")
                        const IR_PCOIN_200MG_T = response_TABAN.data.YekGram18 * 0.2
                        const cond = IR_PCOIN_200MG_B.price > IR_PCOIN_200MG_T
                        const dateCond = IR_PCOIN_200MG_B.date === shamsiDate
                        const dateCond_T = IR_PCOIN_200MG_B.date < shamsiDate
                        const dateCond_B = IR_PCOIN_200MG_B.date > shamsiDate
                        const price = dateCond ?
                            (cond ? IR_PCOIN_200MG_B.price : IR_PCOIN_200MG_T) :
                            (dateCond_T ?
                                IR_PCOIN_200MG_T :
                                (dateCond_B ? IR_PCOIN_200MG_B.price : IR_PCOIN_200MG_T)
                            )
                        const base = dateCond ? (cond ? "B" : "T") : (dateCond_T ? "T" : (dateCond_B ? "B" : "T"))

                        return ({
                            ...IR_PCOIN_200MG_B,
                            price,
                            timeTaban: `${response_TABAN.data.TimeRead.split(' ')[1].split(':').slice(0, 2).join(':')}`,
                            dateTaban: shamsiDate,
                            base
                        })
                    }
                    if (item.symbol === "IR_PCOIN_100MG") {
                        const IR_PCOIN_100MG_B = data.gold.find(el => el.symbol === "IR_PCOIN_100MG")
                        const IR_PCOIN_100MG_T = response_TABAN.data.YekGram18 * 0.1
                        const cond = IR_PCOIN_100MG_B.price > IR_PCOIN_100MG_T
                        const dateCond = IR_PCOIN_100MG_B.date === shamsiDate
                        const dateCond_T = IR_PCOIN_100MG_B.date < shamsiDate
                        const dateCond_B = IR_PCOIN_100MG_B.date > shamsiDate
                        const price = dateCond ?
                            (cond ? IR_PCOIN_100MG_B.price : IR_PCOIN_100MG_T) :
                            (dateCond_T ?
                                IR_PCOIN_100MG_T :
                                (dateCond_B ? IR_PCOIN_100MG_B.price : IR_PCOIN_100MG_T)
                            )
                        const base = dateCond ? (cond ? "B" : "T") : (dateCond_T ? "T" : (dateCond_B ? "B" : "T"))

                        return ({
                            ...IR_PCOIN_100MG_B,
                            price,
                            timeTaban: `${response_TABAN.data.TimeRead.split(' ')[1].split(':').slice(0, 2).join(':')}`,
                            dateTaban: shamsiDate,
                            base
                        })
                    }
                    return item
                })
            }

            data = {
                gold: [
                    ...data.gold,
                    {
                        ...data.gold.find(el => el.symbol === "IR_PCOIN_100MG"),
                        name: 'سکه 70 سوتی پارسیان',
                        name_en: '70mg Parsian Coin',
                        price: (data.gold.find(el => el.symbol === "IR_PCOIN_100MG")?.price || 0) * 0.7,
                        change_value: (data.gold.find(el => el.symbol === "IR_PCOIN_100MG")?.change_value || 0) * 0.7,
                        symbol: 'IR_PCOIN_70MG'
                    },
                    {
                        ...data.gold.find(el => el.symbol === "IR_PCOIN_100MG"),
                        name: 'سکه 50 سوتی پارسیان',
                        name_en: '50mg Parsian Coin',
                        price: (data.gold.find(el => el.symbol === "IR_PCOIN_100MG")?.price || 0) * 0.5,
                        change_value: (data.gold.find(el => el.symbol === "IR_PCOIN_100MG")?.change_value || 0) * 0.5,
                        symbol: 'IR_PCOIN_50MG'
                    },
                    {
                        ...data.gold.find(el => el.symbol === "IR_PCOIN_100MG"),
                        name: 'سکه 30 سوتی پارسیان',
                        name_en: '30mg Parsian Coin',
                        price: (data.gold.find(el => el.symbol === "IR_PCOIN_100MG")?.price || 0) * 0.3,
                        change_value: (data.gold.find(el => el.symbol === "IR_PCOIN_100MG")?.change_value || 0) * 0.3,
                        symbol: 'IR_PCOIN_30MG'
                    },
                ].map(el => assignKarat(el))
            }

            // Update cache
            this.cache = {
                data,
                timestamp: Date.now(),
            };

            return data as { gold: GoldItem[] };
        } catch (error) {
            throw new HttpException(
                'مشکلی در دریافت قیمت بروز رخ داده است.',//'Failed to fetch gold currency data',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }
}