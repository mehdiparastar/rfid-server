import { IsEmail, IsOptional, IsString, MinLength, MaxLength, Matches } from "class-validator";

export class RegisterDto {
    @IsEmail()
    email!: string;

    @IsString()
    @MinLength(8)
    @MaxLength(72)
    // at least 1 letter and 1 digit (tweak as you like)
    @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
        message: "Password must contain at least one letter and one number",
    })
    password!: string;
}
