export function createSortObject(path: string, direction: 'asc' | 'desc'): Record<string, any> {
    const keys = path.split('.');
    const upperDirection = direction.toUpperCase();

    return keys.reduceRight((obj, key, index) => {
        if (index === keys.length - 1) {
            return { [key]: upperDirection };
        }
        return { [key]: obj };
    }, {});
}

type PathSeg = string | number;

function toPath(path: string): PathSeg[] {
    // turn a[0].b[-1].c -> a.0.b.-1.c
    return path
        .replace(/\[(-?\d+)\]/g, '.$1')
        .split('.')
        .filter(Boolean)
        .map(seg => /^-?\d+$/.test(seg) ? Number(seg) : seg);
}

export function getByPath<T = any, D = undefined>(obj: T, path: string, def?: D): any {
    const segs = toPath(path);
    let cur: any = obj;
    for (const s of segs) {
        if (cur == null) return def;
        if (typeof s === 'number' && Array.isArray(cur)) {
            const idx = s < 0 ? cur.length + s : s; // support negative indexes
            cur = cur[idx];
        } else {
            cur = cur[s as keyof typeof cur];
        }
    }
    return cur ?? def;
}


import { MoreThan, LessThan, MoreThanOrEqual, LessThanOrEqual, Equal } from "typeorm";

type SortDir = "asc" | "desc";

export function makeSortCondition(
    sortField: string,
    sortDirection: SortDir,
    cursor?: { value?: any, createdAt: Date, id: number } | null
) {
    if (!cursor || cursor.value == null || !sortField) return [{}];

    const segments = sortField.split(".");
    const last = segments[segments.length - 1];

    const raw = cursor.value;
    const value = last === "createdAt" ? new Date(raw) : raw;

    const comparator = sortDirection === "asc" ? MoreThan(value) : LessThan(value);

    // turn ["customer", "name"] + comparator into { customer: { name: comparator } }
    const nested = segments.reduceRight<any>((acc, key) => ({ [key]: acc }), comparator);
    const nested_ = segments.reduceRight<any>((acc, key) => ({ [key]: acc }), Equal(value));

    return [
        { ...nested },
        { ...nested_, id: sortDirection === "asc" ? MoreThan(cursor.id) : LessThan(cursor.id) },
        // { ...nested_, createdAt: sortDirection === "asc" ? MoreThan(new Date(cursor.createdAt)) : LessThan(new Date(cursor.createdAt)) }
    ];
}
