import { Invoice } from "src/sales/entities/invoice.entity";
import { User } from "src/users/entities/user.entity";
import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity('customers')
export class Customer {
    @PrimaryGeneratedColumn()
    id: number;

    @Column('varchar', { length: 255, nullable: false })
    name: string;

    @Column('varchar', { length: 15, nullable: false })
    phone: string;

    @Column('varchar', { length: 20, nullable: false })
    nid: string;  // National ID

    @OneToMany(() => Invoice, invoice => invoice.customer)
    invoices: Invoice[];

    @ManyToOne(() => User, user => user.customers)  // Relation with users table
    @JoinColumn({ name: 'userId' })
    createdBy: User;

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