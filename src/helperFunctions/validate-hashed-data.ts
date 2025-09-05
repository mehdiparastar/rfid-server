import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';

const validateHashedData = async (
  toValidateHashedData: string,
  primaryHashedData: string,
): Promise<boolean> => {
  try {
    const result = await bcrypt.compare(toValidateHashedData, primaryHashedData);
    return result
  }
  catch (ex) {
    throw new BadRequestException(ex)
  }
};

export { validateHashedData };