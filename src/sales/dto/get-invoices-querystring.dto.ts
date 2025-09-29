// dto/get-products.dto.ts
import { IsInt, IsOptional, IsString } from 'class-validator';

export class GetInvoicesDto {
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
