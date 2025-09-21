// dto/get-products.dto.ts
import { IsOptional, IsInt, IsString, IsIn, IsObject } from 'class-validator';

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

    @IsOptional()
    @IsString()
    cursor?: string | null;  // Add cursor property for pagination
}
