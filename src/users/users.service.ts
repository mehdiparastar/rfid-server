import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from "bcryptjs";
import { UserRoles } from 'src/enum/userRoles.enum';
import { getRolesArray } from 'src/helperFunctions/get-roles-array-from-roles-dto';
import { Repository } from 'typeorm';
import { ApproveUserRolesDto } from './dto/approve-user-roles.dto';
import { UpdateLocalUserDto } from './dto/update-local-user.dto';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
    constructor(@InjectRepository(User) private usersRepo: Repository<User>) { }

    findByEmail(email: string) {
        return this.usersRepo.findOne({ where: { email } });
    }

    findById(id: number) {
        return this.usersRepo.findOne({ where: { id } });
    }

    async create(email: string, password: string) {
        const defaultUserRoles = (email === 'parastar.mehdi@gmail.com') ? [UserRoles.superUser] : [UserRoles.userLL];
        const passwordHash = await bcrypt.hash(password, 12);
        const user = this.usersRepo.create({ email, passwordHash, roles: defaultUserRoles });
        return this.usersRepo.save(user);
    }

    async update(id: number, attrs: UpdateLocalUserDto) {
        const user = await this.findById(id);
        if (!user) {
            throw new NotFoundException('user not found');
        }
        Object.assign(user, attrs);
        const save = await this.usersRepo.save(user);
        return save;
    }

    async changeUserRoles(id: number, newRoles: ApproveUserRolesDto) {
        const user = await this.findById(id);
        if (!user) {
            throw new NotFoundException('user not found');
        }

        const updateUserRoles = await this.update(id, {
            roles: getRolesArray(newRoles),
        });

        return updateUserRoles;
    }
}
