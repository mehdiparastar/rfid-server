import { Expose } from "class-transformer";

export class UserPublicDto {
  @Expose() id!: number;
  @Expose() email!: string;
  @Expose() roles!: string[] | null; // e.g. ["2000", "3011"]
}
