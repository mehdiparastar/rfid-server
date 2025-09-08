// src/users/users.controller.ts
import { Controller, Get, Patch, Param, ParseIntPipe, Body, UseGuards } from "@nestjs/common";
import { UsersService } from "./users.service";
import { JwtAccessGuard } from "../auth/guards/jwt-access.guard";
import { UserRoles } from "../enum/userRoles.enum";
import { UserPublicDto } from "./dto/user-public.dto";
import { Roles } from "src/authorization/roles.decorator";
import { RolesGuard } from "src/authorization/roles.guard";
import { Serialize } from "src/interceptors/serialize.interceptor";
import { UpdateUserRolesDto } from "./dto/update-user-roles.dto";

@UseGuards(JwtAccessGuard, RolesGuard)
@Controller("users")
export class UsersController {
    constructor(private readonly users: UsersService) { }

    @Get()
    @Roles(UserRoles.admin, UserRoles.superUser)
    @Serialize(UserPublicDto)
    async list() {
        return this.users.findAllBasic(); // array → serializer handles it
    }

    @Patch(":id/roles")
    @Roles(UserRoles.admin, UserRoles.superUser)
    @Serialize(UserPublicDto)
    async updateRoles(
        @Param("id", ParseIntPipe) id: number,
        @Body() dto: UpdateUserRolesDto,
    ) {
        return this.users.updateRoles(id, dto.roles);
    }
}
