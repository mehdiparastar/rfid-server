export enum UserRoles {
  superUser = '1000',
  admin = '2000',

  userFL = '3011', // full level
  userHL = '3012', // high level
  userML = '3013', // medium level
  userLL = '3014', // low level

}

export const allRolesList = Object.values(UserRoles);
