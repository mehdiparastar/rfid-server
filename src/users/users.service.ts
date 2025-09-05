import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { User } from './entities/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UpdateLocalUserDto } from './dto/update-local-user.dto';
import { UserRoles } from 'src/enum/userRoles.enum';
import { ApproveUserRolesDto } from './dto/approve-user-roles.dto';
import { getRolesArray } from 'src/helperFunctions/get-roles-array-from-roles-dto';

@Injectable()
export class UsersService {
    constructor(@InjectRepository(User) private usersRepo: Repository<User>) { }

    async findByEmail(email: string): Promise<User[]> {
        if (!email) {
            throw new NotFoundException('user not found');
        }

        const find = await this.usersRepo.find({
            where: { email },
        });
        return find;
    }

    async update(id: number, attrs: UpdateLocalUserDto): Promise<User> {
        const user = await this.findOneById(id);
        if (!user) {
            throw new NotFoundException('user not found');
        }
        Object.assign(user, attrs);
        const save = await this.usersRepo.save(user);
        return save;
    }

    async findOneById(id: number): Promise<User> {
        if (!id) {
            throw new NotFoundException('user not found');
        }
        const find = await this.usersRepo.findOne({
            where: { id },
        });
        if (!find) {
            throw new NotFoundException('user not found');
        }
        return find;
    }

    async createUserWithUserPass(
        email: string,
        password: string,
        name: string,
    ): Promise<User> {
        // Check if user exists
        const [userExists] = await this.findByEmail(email);
        if (userExists) {
            throw new BadRequestException('User already exists');
        }

        const defaultUserRoles =
            (email === 'parastar.mehdi@gmail.com' && name === "mehdi parastar") ?
                [UserRoles.superUser] :
                [UserRoles.userLL];

        // Create new User
        const user = this.usersRepo.create({
            email: email,
            password: password,
            name: name,
            roles: defaultUserRoles,
        });

        return this.usersRepo.save(user);
    }

    async changeUserRoles(
        id: number,
        newRoles: ApproveUserRolesDto,
    ): Promise<User> {
        const user: User = await this.findOneById(id);
        if (!user) {
            throw new NotFoundException('user not found');
        }

        const updateUserRoles = await this.update(id, {
            roles: getRolesArray(newRoles),
        });

        return updateUserRoles;
    }
}
