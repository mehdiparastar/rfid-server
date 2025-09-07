import { IsEmail, IsString } from 'class-validator';

export class CreateLocalUserDto {
    @IsEmail()
    email: string;

    @IsString()
    password: string;
}