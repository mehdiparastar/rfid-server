// dto/get-products.dto.ts
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ItariffENUM } from 'src/sales/entities/sale-item.entity';

export class GetProductsDto {
    @IsOptional()
    @IsInt()
    limit: number;

    @IsOptional()
    @IsString()
    sort: string;

    @IsOptional()
    @IsString()
    filters?: string;

    @IsNotEmpty()
    @IsEnum(ItariffENUM)
    tariffType: ItariffENUM;

    @IsOptional()
    @IsString()
    cursor?: string | null;  // Add cursor property for pagination
}
