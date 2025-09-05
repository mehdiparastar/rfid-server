import { Expose } from 'class-transformer';
import { UserRoles } from 'src/enum/userRoles.enum';


export class UserRolesDto {
  @Expose()
  [UserRoles.superUser]?: boolean;

  @Expose()
  [UserRoles.admin]?: boolean;

  @Expose()
  [UserRoles.userFL]?: boolean;

  @Expose()
  [UserRoles.userHL]?: boolean;

  @Expose()
  [UserRoles.userML]?: boolean;

  @Expose()
  [UserRoles.userLL]?: boolean;
}
