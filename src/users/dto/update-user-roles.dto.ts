import { IsArray, ArrayNotEmpty, ArrayUnique, IsEnum } from "class-validator";
import { UserRoles } from "../../enum/userRoles.enum";

export class UpdateUserRolesDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsEnum(UserRoles, { each: true })
  roles!: UserRoles[]; // e.g. ["2000","3011"]
}
