import { Controller, Get, Post, UseGuards } from '@nestjs/common';
import { SerialService } from './serial.service';
import { JwtAccessGuard } from 'src/auth/guards/jwt-access.guard';
import { RolesGuard } from 'src/authorization/roles.guard';
import { Roles } from 'src/authorization/roles.decorator';
import { UserRoles } from 'src/enum/userRoles.enum';

@Controller('serial')
export class SerialController {
    constructor(private readonly serialService: SerialService) { }

    @Get('specs')
    getSpecs() {
        return this.serialService.getPortSpecs();
    }

    @Post('reinit')
    @UseGuards(JwtAccessGuard, RolesGuard)
    @Roles(UserRoles.userFL)
    reinit() {
        return this.serialService.reinitPorts();
    }
}