import { InjectRepository } from "@nestjs/typeorm";
import { Invoice } from "./entities/invoice.entity";
import { Injectable } from "@nestjs/common";
import { And, LessThan, Like, MoreThan, Repository } from "typeorm";
import { Cursor } from "src/products/products.service";
import { createSortObject, makeSortCondition } from "src/helperFunctions/createSortObject";

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
                    // { ...sortCondition, items: { product: { tags: { epc: sortCondition?.["items"]?.["product"]?.["name"] ? And(Like(`%${qFilterValue}%`), sortCondition?.["items"]?.["product"]?.["name"]) : Like(`%${qFilterValue}%`) } } } },
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

}