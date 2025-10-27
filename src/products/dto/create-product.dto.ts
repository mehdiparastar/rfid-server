import { IsArray, IsBoolean, IsBooleanString, IsIn, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type, Transform } from 'class-transformer';

// Predefined gold product types
export const GOLD_PRODUCT_TYPES = [
    'Necklace',
    'Ring',
    'Bracelet',
    'Earrings',
    'Pendant',
    'Anklet',
] as const;
export type GoldProductType = typeof GOLD_PRODUCT_TYPES[number];

export const GOLD_PRODUCT_SUB_TYPES = [
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
    makingCharge: number;

    @Transform(({ value }) => parseFloat(value))
    @IsNumber()
    vat: number;

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