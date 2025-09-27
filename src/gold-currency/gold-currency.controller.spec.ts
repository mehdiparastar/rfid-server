import { Test, TestingModule } from '@nestjs/testing';
import { GoldCurrencyController } from './gold-currency.controller';

describe('GoldCurrencyController', () => {
  let controller: GoldCurrencyController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GoldCurrencyController],
    }).compile();

    controller = module.get<GoldCurrencyController>(GoldCurrencyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
