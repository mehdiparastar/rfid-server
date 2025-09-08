import { ConflictException, Injectable, NotAcceptableException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from "bcryptjs";
import { allRolesList, UserRoles } from 'src/enum/userRoles.enum';
import { Repository } from 'typeorm';
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
        const exists = await this.findByEmail(email);
        if (exists) throw new ConflictException("Email already in use");

        const defaultUserRoles = (email === 'parastar.mehdi@gmail.com') ? [UserRoles.superUser] : [UserRoles.userLL];
        const passwordHash = await bcrypt.hash(password, 12);
        const user = this.usersRepo.create({ email, passwordHash, roles: defaultUserRoles });
        return this.usersRepo.save(user);
    }

    async findAllBasic() {
        // select only what you expose
        return this.usersRepo.find({ select: { id: true, email: true, roles: true } });
    }

    async updateRoles(userId: number, roles: UserRoles[]) {
        // Validate against known role codes
        for (const r of roles) {
            if (!allRolesList.includes(r)) {
                throw new Error(`Unknown role: ${r}`);
            }
        }
        const user = await this.usersRepo.findOne({ where: { id: userId } });
        if (!user) throw new NotFoundException("User not found");
        if (user.roles.includes(UserRoles.superUser)) throw new NotAcceptableException("super user role can't be changed.")
        user.roles = roles.filter(el => el !== UserRoles.superUser);
        return this.usersRepo.save(user);
    }

}
