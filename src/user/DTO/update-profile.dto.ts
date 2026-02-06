import { IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

export class updateProfile {
    @IsString({message: 'Имя должно быть строкой'})
    @IsNotEmpty({message: 'имя обязательно к заполнению'})
    @MinLength(3,{message: 'имя должно содеражть не менее 3 символов'})
    @MaxLength(30, {message: 'имя не должно превышать 30 символов'})
    username?: string;
}