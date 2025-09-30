import { Entity, PrimaryColumn, Column, CreateDateColumn, Index, UpdateDateColumn } from "typeorm";

@Entity("refresh_tokens")
export class RefreshToken {
    @PrimaryColumn({ type: "char", length: 36 })
    jti!: string; // JWT ID

    @Index()
    @Column({ type: "bigint" })
    userId!: number;

    @Column({ type: "tinyint", default: 0 })
    revoked!: number;

    @Index()
    @Column({ type: "datetime" })
    expiresAt!: Date;

    @CreateDateColumn({
        type: 'datetime',        // or 'timestamp'
        precision: 3,
        default: () => 'CURRENT_TIMESTAMP(3)',
    })
    createdAt: Date;

    @UpdateDateColumn({
        type: 'datetime',        // or 'timestamp'
        precision: 3,
        default: () => 'CURRENT_TIMESTAMP(3)',
    })
    updatedAt: Date;
}
