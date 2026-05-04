import { IsEmail, IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

export class RegisterDto {

    @IsString({message: 'E-mail должен быть строкой'})
    @IsNotEmpty({message: 'E-mail обязателен к заполнению'})
    @IsEmail({}, {message: 'некорректный формат электронной почты'})
    email: string;

    @IsString({message: 'пароль должен быть строкой'})
    @IsNotEmpty({message: 'пароль обязателен к заполнению'})
    @MinLength(6,{message: 'пароль должен содеражть не менее 6 символов'})
    @MaxLength(128, {message: 'пароль не должен превышать 128 символов'})
    passwordHash: string;

    @IsString({message: 'Имя должно быть строкой'})
    @IsNotEmpty({message: 'имя обязательно к заполнению'})
    @MinLength(3,{message: 'имя должно содеражть не менее 3 символов'})
    @MaxLength(30, {message: 'имя не должно превышать 30 символов'})
    username: string;
}
