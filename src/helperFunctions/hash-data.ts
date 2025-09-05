import * as bcrypt from 'bcryptjs';

export const hashData = async (data: string): Promise<string> => {
    const saltRounds = 10;
    return bcrypt.hash(data, saltRounds);
};