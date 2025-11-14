import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { HttpException, HttpStatus } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class GoldCurrencyService {
    private cache: { data: any; timestamp: number } | null = null;
    private readonly CACHE_DURATION = 60 * 1000; // 1 minute in milliseconds
    // private readonly API_URL_ = 'https://BrsApi.ir/Api/Market/Gold_Currency.php?key=Bl13tlilwXFAV8dxe1ryIDAlfnSdGXdh';
    private readonly API_URL = 'https://BrsApi.ir/Api/Market/Gold_Currency_Pro.php?key=Bl13tlilwXFAV8dxe1ryIDAlfnSdGXdh&section=gold,currency';

    constructor(private readonly httpService: HttpService) { }

    async getGoldCurrencyData() {
        // Check if cache exists and is still valid
        if (this.cache && Date.now() - this.cache.timestamp < this.CACHE_DURATION) {
            return this.cache.data;
        }

        try {
            // Fetch new data from API
            // const response_ = await firstValueFrom(this.httpService.get(this.API_URL_));
            const response = await firstValueFrom(this.httpService.get(this.API_URL));
            // const data_ = { gold: response_.data.gold };
            const data = { gold: [...response.data.gold.coin, ...response.data.gold.coin_parsian, ...response.data.gold.ounce, ...response.data.gold.type] };

            // Update cache
            this.cache = {
                data,
                timestamp: Date.now(),
            };

            return data;
        } catch (error) {
            throw new HttpException(
                'Failed to fetch gold currency data',
                HttpStatus.INTERNAL_SERVER_ERROR,
            );
        }
    }
}