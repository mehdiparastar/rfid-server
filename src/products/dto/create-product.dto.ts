import { IsArray, IsIn, IsNumber, IsString, ValidateNested } from 'class-validator';
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


class TagDto {
    @IsString()
    epc: string;

    @IsNumber()
    rssi: number;
}

export class CreateProductDto {
    @IsString()
    name: string;

    @Transform(({ value }) => parseFloat(value))
    @IsNumber()
    weight: number;

    @IsString()
    @IsIn(GOLD_PRODUCT_TYPES, { message: `Type must be one of: ${GOLD_PRODUCT_TYPES.join(', ')}` })
    type: GoldProductType;

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