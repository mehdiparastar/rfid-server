import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
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
    if (goldItem.symbol.includes("MELTED")) return ({ ...goldItem, karat: 750, price: Math.round(goldItem.price / 4.3318) })
    if (goldItem.symbol.includes("XAUUSD")) return ({ ...goldItem, karat: 995, price: Math.round(goldItem.price / 28.3495) })

    return ({ ...goldItem, karat: 750 })
}

@Injectable()
export class GoldCurrencyService {
    private cache: { data: any; timestamp: number } | null = null;
    private readonly CACHE_DURATION = 60 * 1000; // 1 minute in milliseconds
    // private readonly API_URL_ = 'https://BrsApi.ir/Api/Market/Gold_Currency.php?key=Bl13tlilwXFAV8dxe1ryIDAlfnSdGXdh';
    private readonly API_URL = 'https://BrsApi.ir/Api/Market/Gold_Currency_Pro.php?key=Bl13tlilwXFAV8dxe1ryIDAlfnSdGXdh&section=gold,currency';

    constructor(private readonly httpService: HttpService) { }

    async getGoldCurrencyData(): Promise<{ gold: GoldItem[] }> {
        // Check if cache exists and is still valid
        if (this.cache && Date.now() - this.cache.timestamp < this.CACHE_DURATION) {
            return this.cache.data;
        }

        try {
            // Fetch new data from API
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
                'Failed to fetch gold currency data',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }
}