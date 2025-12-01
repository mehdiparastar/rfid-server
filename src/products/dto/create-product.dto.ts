import { Transform } from 'class-transformer';
import { IsArray, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

// Predefined gold product types
export const GOLD_PRODUCT_TYPES = [
    'Necklace',
    'Ring',
    'Bracelet',
    'Earrings',
    'Pendant',
    'Anklet',
    'Bangle',
    'Chain',
    'WatchPendant',
    'Piercing',
    'Medal',
    'Coin',
    'FullSet',
    'HalfSet',
    'Others',
] as const;
export type GoldProductType = typeof GOLD_PRODUCT_TYPES[number];

export const GOLD_PRODUCT_SUB_TYPES =
    [
        {
            symbol: "IR_GOLD_18K",
            name: "طلای 18 عیار",
            name_en: "18K Gold",
        },
        {
            symbol: "IR_GOLD_24K",
            name: "طلای 24 عیار",
            name_en: "24K Gold",
        },
        {
            symbol: "IR_GOLD_MELTED",
            name: "طلای آب‌شده نقدی",
            name_en: "Melted Gold",
        },
        {
            symbol: "IR_COIN_EMAMI",
            name: "سکه امامی",
            name_en: "Emami Coin",
        },
        {
            symbol: "IR_COIN_BAHAR",
            name: "سکه بهار آزادی",
            name_en: "Bahar Azadi Coin",
        },
        {
            symbol: "IR_COIN_HALF",
            name: "نیم سکه",
            name_en: "Half Coin",
        },
        {
            symbol: "IR_COIN_QUARTER",
            name: "ربع سکه",
            name_en: "Quarter Coin",
        },
        {
            symbol: "IR_COIN_1G",
            name: "سکه یک گرمی",
            name_en: "1g Coin",
        },
        {
            symbol: "IR_PCOIN_1-5G",
            name: "سکه 1.5 گرمی پارسیان",
            name_en: "1.5g Parsian Coin",
        },
        {
            symbol: "IR_PCOIN_1-4G",
            name: "سکه 1.4 گرمی پارسیان",
            name_en: "1.4g Parsian Coin",
        },
        {
            symbol: "IR_PCOIN_1-3G",
            name: "سکه 1.3 گرمی پارسیان",
            name_en: "1.3g Parsian Coin",
        },
        {
            symbol: "IR_PCOIN_1-2G",
            name: "سکه 1.2 گرمی پارسیان",
            name_en: "1.2g Parsian Coin",
        },
        {
            symbol: "IR_PCOIN_1-1G",
            name: "سکه 1.1 گرمی پارسیان",
            name_en: "1.1g Parsian Coin",
        },
        {
            symbol: "IR_PCOIN_1G",
            name: "سکه 1 گرمی پارسیان",
            name_en: "1g Parsian Coin",
        },
        {
            symbol: "IR_PCOIN_900MG",
            name: "سکه 900 سوتی پارسیان",
            name_en: "900mg Parsian Coin",
        },
        {
            symbol: "IR_PCOIN_800MG",
            name: "سکه 800 سوتی پارسیان",
            name_en: "800mg Parsian Coin",
        },
        {
            symbol: "IR_PCOIN_700MG",
            name: "سکه 700 سوتی پارسیان",
            name_en: "700mg Parsian Coin",
        },
        {
            symbol: "IR_PCOIN_600MG",
            name: "سکه 600 سوتی پارسیان",
            name_en: "600mg Parsian Coin",
        },
        {
            symbol: "IR_PCOIN_500MG",
            name: "سکه 500 سوتی پارسیان",
            name_en: "500mg Parsian Coin",
        },
        {
            symbol: "IR_PCOIN_400MG",
            name: "سکه 400 سوتی پارسیان",
            name_en: "400mg Parsian Coin",
        },
        {
            symbol: "IR_PCOIN_300MG",
            name: "سکه 300 سوتی پارسیان",
            name_en: "300mg Parsian Coin",
        },
        {
            symbol: "IR_PCOIN_200MG",
            name: "سکه 200 سوتی پارسیان",
            name_en: "200mg Parsian Coin",
        },
        {
            symbol: "IR_PCOIN_100MG",
            name: "سکه 100 سوتی پارسیان",
            name_en: "100mg Parsian Coin",
        },
        {
            symbol: "IR_PCOIN_70MG",
            name: "سکه 70 سوتی پارسیان",
            name_en: "70mg Parsian Coin",
        },
        {
            symbol: "IR_PCOIN_50MG",
            name: "سکه 50 سوتی پارسیان",
            name_en: "50mg Parsian Coin",
        },
        {
            symbol: "IR_PCOIN_30MG",
            name: "سکه 30 سوتی پارسیان",
            name_en: "30mg Parsian Coin",
        },
        {
            symbol: "XAUUSD",
            name: "انس طلا",
            name_en: "Gold Ounce",
        },
    ] as const

export const GOLD_PRODUCT_SUB_TYPES_ = [
    {
        symbol: "IR_GOLD_18K",
        name_en: "18K Gold",
        name: "طلای 18 عیار"
    },
    {
        symbol: "IR_GOLD_24K",
        name_en: "24K Gold",
        name: "طلای 24 عیار",
    },
    {
        symbol: "IR_GOLD_MELTED",
        name_en: "Melted Gold",
        name: "طلای آب‌شده نقدی",
    },
    {
        symbol: "XAUUSD",
        name_en: "Gold Ounce",
        name: "انس طلا",
    },
    {
        symbol: "IR_COIN_1G",
        name_en: "1g Coin",
        name: "سکه یک گرمی",
    },
    {
        symbol: "IR_COIN_QUARTER",
        name_en: "Quarter Coin",
        name: "ربع سکه",
    },
    {
        symbol: "IR_COIN_HALF",
        name_en: "Half Coin",
        name: "نیم سکه",
    },
    {
        symbol: "IR_COIN_EMAMI",
        name_en: "Emami Coin",
        name: "سکه امامی",
    },
    {
        symbol: "IR_COIN_BAHAR",
        name_en: "Bahar Azadi Coin",
        name: "سکه بهار آزادی",
    }
] as const;

export type GoldProductSUBType = typeof GOLD_PRODUCT_SUB_TYPES[number]["symbol"];


class TagDto {
    @IsString()
    epc: string;

    @IsNumber()
    rssi: number;

    @IsNumber()
    pl: number;

    @IsNumber()
    pc: number;
}

export class CreateProductDto {
    @IsOptional()
    @IsNumber()
    id?: number

    @IsString()
    name: string;

    @Transform(({ value }) => parseFloat(value))
    @IsNumber()
    karat: number;

    @Transform(({ value }) => parseFloat(value))
    @IsNumber()
    weight: number;

    @IsString()
    @IsIn(GOLD_PRODUCT_TYPES, { message: `Type must be one of: ${GOLD_PRODUCT_TYPES.join(', ')}` })
    type: GoldProductType;

    @IsString()
    @IsIn(GOLD_PRODUCT_SUB_TYPES.map(it => it.symbol), { message: `Type must be one of: ${GOLD_PRODUCT_SUB_TYPES.map(it => it.name).join(', ')}` })
    subType: GoldProductSUBType;

    // @IsBoolean()
    // inventoryItem: boolean;

    // @IsBoolean({ message: 'inventoryItem must be a valid boolean' })
    @Transform((v) => {
        const { value } = v
        // Handle direct booleans (rare in form data) or strings
        if (typeof value === 'boolean') return value;
        const strValue = String(value).toLowerCase().trim();
        if (['true', '1', 'yes', 'on'].includes(strValue)) return 'true';
        if (['false', '0', 'no', 'off'].includes(strValue)) return 'false';
        return undefined;
    })
    @IsString()
    inventoryItem: string;

    @Transform(({ value }) => parseInt(value, 10))
    @IsNumber()
    quantity: number;

    @Transform(({ value }) => parseFloat(value))
    @IsNumber()
    makingChargeBuy: number;

    @Transform(({ value }) => parseFloat(value))
    @IsNumber()
    makingChargeSell: number;

    @Transform(({ value }) => parseFloat(value))
    @IsNumber()
    vat: number;

    @Transform(({ value }) => parseFloat(value))
    @IsNumber()
    accessoriesCharge: number;

    @Transform(({ value }) => parseFloat(value))
    @IsNumber()
    profit: number;

    @Transform(({ value, obj }) => {
        const parsed = typeof value === 'string' ? JSON.parse(value) : value;
        return parsed;
    })
    @IsArray({ message: 'Tags must be an array' })
    // @ValidateNested({ each: true })
    // @Type(() => TagDto)
    tags: TagDto[];
}