import { BadRequestException, Controller, Get, ParseArrayPipe, Query } from "@nestjs/common";
import { GetInvoicesDto } from "./dto/get-invoices-querystring.dto";
import { Cursor } from "src/products/products.service";
import { InvoicesService } from "./invoice.service";

@Controller('invoices')
export class InvoicesController {
    constructor(private readonly invoicesService: InvoicesService) { }

    @Get('all')
    async getAllInvoices(@Query() query: GetInvoicesDto) {
        const { limit = 20, sort = 'createdAt:desc', filters = {}, cursor = null } = query;
        const [sortField, sortDirection] = sort.split(':');
        // const parsedFilters = (filters && typeof filters === 'string') ? JSON.parse(filters) : {};

        // Parse filters JSON string
        let parsedFilters: Record<string, any> = {};
        try {
            parsedFilters = (filters && typeof filters === 'string') ? JSON.parse(filters) : {};
        } catch (e) {
            throw new Error('Invalid filters format');
        }

        // Parse cursor JSON string
        let parsedCursor: Cursor | null = null;
        if (cursor) {
            try {
                parsedCursor = JSON.parse(cursor) as Cursor;
                parsedCursor.createdAt = new Date(parsedCursor.createdAt);
            } catch (e) {
                throw new Error('Invalid cursor format');
            }
        }

        return this.invoicesService.getAllInvoices({
            cursor: parsedCursor,
            limit,
            sortField,
            sortDirection: sortDirection === 'asc' ? 'asc' : 'desc',
            filters: parsedFilters,
        });
    }

    @Get()
    async getInvoicesByIds(
        @Query('ids', new ParseArrayPipe({ items: Number, separator: ',' })) ids: number[],
    ) {
        if (!ids?.length) throw new BadRequestException('ids is required');
        if (ids.length > 100) throw new BadRequestException('Max 100 ids');

        // de-dup
        ids = Array.from(new Set(ids));

        const invoices = await this.invoicesService.getInvoicesByIds(ids); // SELECT ... WHERE id IN (...)
        return invoices;
    }
}