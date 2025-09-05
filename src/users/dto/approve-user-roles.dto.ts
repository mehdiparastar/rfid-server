import { IsBoolean } from 'class-validator';
import { UserRoles } from 'src/enum/userRoles.enum';


export class ApproveUserRolesDto {
  // @IsBoolean()
  // [UserRoles.superUser]?: boolean;

  @IsBoolean()
  [UserRoles.admin]?: boolean;

  @IsBoolean()
  [UserRoles.userFL]?: boolean;

  @IsBoolean()
  [UserRoles.userHL]?: boolean;

  @IsBoolean()
  [UserRoles.userML]?: boolean;

  @IsBoolean()
  [UserRoles.userLL]?: boolean;
}
