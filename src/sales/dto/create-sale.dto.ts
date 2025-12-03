import { Type } from "class-transformer";
import { ArrayMinSize, IsDate, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";
import { CreateCustomerDto } from "src/customers/dto/create-customer.dto";
import { ItariffENUM } from "../entities/sale-item.entity";

export class CreateSaleItemDto {
    @IsInt() productId: number;
    @IsInt() @Min(1) quantity: number;
    @IsNotEmpty()
    @IsEnum(ItariffENUM)
    tariffType: ItariffENUM;
    @IsNumber() soldPrice: number; // total per line or unit—be consistent
    @IsNumber() discount: number;
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