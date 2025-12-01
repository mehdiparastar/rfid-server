import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { createSortObject, makeSortCondition } from "src/helperFunctions/createSortObject";
import { Cursor } from "src/products/products.service";
import { User } from "src/users/entities/user.entity";
import { And, In, Like, Repository } from "typeorm";
import { Invoice } from "./entities/invoice.entity";
import { SalesService } from "./sales.service";

export interface GetAllInvoicesOptions {
    cursor: Cursor | null
    limit: number;
    sortField: string;
    sortDirection: 'asc' | 'desc';
    filters: Record<string, any>;
}

function getByPath<T extends object, D = any>(obj: T, path: string, def?: D): D {
    return path.split(".").reduce<any>((acc, key) => (acc == null ? acc : acc[key]), obj) ?? def;
}

@Injectable()
export class InvoicesService {
    constructor(
        @InjectRepository(Invoice) private invoicesRepository: Repository<Invoice>,
        private readonly salesService: SalesService,
    ) { }

    async getAllInvoices({
        cursor,
        limit,
        sortField,
        sortDirection,
        filters,
    }: GetAllInvoicesOptions) {

        const qFilterValue = filters['q']

        const sortCondition = makeSortCondition(sortField, sortDirection, cursor)

        // ## considar if you want to use below line, you should enable makeSortCondition last line: { ...nested_, createdAt: sortDirection === "asc" ? MoreThan(new Date(cursor.createdAt)) : LessThan(new Date(cursor.createdAt)) }
        const secondSortLevel_ = (sortField !== 'createdAt') ? (sortDirection === 'asc' ? { createdAt: 'ASC' } : { createdAt: 'DESC' }) : {} as any
        const secondSortLevel = (sortDirection === 'asc' ? { id: 'ASC' } : { id: 'DESC' }) as any
        const order = { ...createSortObject(sortField, sortDirection), ...secondSortLevel }

        const [items, total] = await this.invoicesRepository.findAndCount(
            {
                relations: { items: { product: { tags: true } }, customer: true, createdBy: true },
                where: [
                    ...sortCondition
                        .map(el => ({
                            ...el,
                            customer: {
                                name: el?.["customer"]?.["name"] ?
                                    And(Like(`%${qFilterValue}%`), el?.["customer"]?.["name"]) :
                                    Like(`%${qFilterValue}%`)
                            }
                        })),
                    ...sortCondition
                        .map(el => ({
                            ...el,
                            customer: {
                                phone: el?.["customer"]?.["phone"] ?
                                    And(Like(`%${qFilterValue}%`), el?.["customer"]?.["phone"]) :
                                    Like(`%${qFilterValue}%`)
                            }
                        })),
                    ...sortCondition
                        .map(el => ({
                            ...el,
                            customer: {
                                nid: el?.["customer"]?.["nid"] ?
                                    And(Like(`%${qFilterValue}%`), el?.["customer"]?.["nid"]) :
                                    Like(`%${qFilterValue}%`)
                            }
                        })),
                    ...sortCondition
                        .map(el => ({
                            ...el,
                            items: {
                                product: {
                                    name: el?.["items"]?.["product"]?.["name"] ?
                                        And(Like(`%${qFilterValue}%`), el?.["items"]?.["product"]?.["name"]) :
                                        Like(`%${qFilterValue}%`)
                                }
                            }
                        })),
                    ...sortCondition
                        .map(el => ({
                            ...el,
                            items: {
                                product: {
                                    tags: {
                                        epc: el?.["items"]?.["product"]?.["tags"]?.["epc"] ?
                                            And(Like(`%${qFilterValue}%`), el?.["items"]?.["product"]?.["tags"]?.["epc"]) :
                                            Like(`%${qFilterValue}%`)
                                    }
                                }
                            }
                        })),
                ],
                order: order,
                take: limit
            }
        )

        // Compute next cursor (based on last item's sortField and createdAt)
        const nextCursor = items.length === limit && items.length > 0
            ? {
                value: getByPath((items[items.length - 1]), sortField), //sortField === "customer.name" ? (items[items.length - 1] as any)["customer"]["name"] : (items[items.length - 1] as any)[sortField],
                createdAt: items[items.length - 1].createdAt,
                id: items[items.length - 1].id,
            }
            : null;

        return { items, nextCursor, total };
    }

    async getInvoicesByIds(ids: number[]) {
        return await this.invoicesRepository.find({ where: { id: In(ids) }, relations: { items: { product: { saleItems: true, tags: true } }, customer: true, createdBy: true } })
    }

    async deleteOneInvoiceById(invoiceId: number, user: Partial<User>) {
        // 1) Load invoice with relations we need for checks and cleanup
        const invoice = await this.invoicesRepository.findOne({
            where: { id: invoiceId },
            relations: { createdBy: true },
        });

        if (!invoice) {
            // Controller turns falsy into 404, but throwing here is also fine:
            throw new NotFoundException('Invoice not found');
        }

        // 2) Authorization: owner
        const isOwner = invoice.createdBy.id === parseInt(user.id as any)
        if (!isOwner) {
            throw new BadRequestException('You are not allowed to delete this invoice');
        }

        // 3) Referential integrity: block if there are sale items referencing it
        const res = await this.salesService.canReUseThisInvoiceTags(invoiceId)
        if (!res.status) {
            throw new BadRequestException(
                `Cannot delete: invoice has used tags. ${res.tagsExceptions.join("\n")}`,
            );
        }

        await this.invoicesRepository.delete(invoiceId)

        return true;
    }

}