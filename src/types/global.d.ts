import { User as UserEntity } from 'src/users/entities/user.entity';

namespace Express {
    interface Request {
        user?: Partial<UserEntity>;
    }
}