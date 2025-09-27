import { Type } from "class-transformer";
import { ArrayMinSize, IsDate, IsDateString, IsInt, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";
import { CreateCustomerDto } from "src/customers/dto/create-customer.dto";

export class CreateSaleItemDto {
    @IsInt() productId: number;
    @IsInt() @Min(1) quantity: number;
    @IsNumber() soldPrice: number; // total per line or unit—be consistent
    @IsNumber() spotPrice: number;
}

export class CreateSaleDto {
    @IsDate() sellDate: Date; // ISO string
    @IsString() payType: string;
    @IsOptional() @IsString() description?: string;
    @ValidateNested() @Type(() => CreateCustomerDto) customer: CreateCustomerDto;
    @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => CreateSaleItemDto)
    items: CreateSaleItemDto[];
}