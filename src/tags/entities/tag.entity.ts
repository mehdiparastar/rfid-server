import { Product } from 'src/products/entities/product.entity';
import { User } from 'src/users/entities/user.entity';
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, OneToMany, PrimaryColumn, Index, JoinColumn, ManyToMany } from 'typeorm';

@Entity('tags')
export class Tag {
    @PrimaryGeneratedColumn()
    id: number;

    @Column('varchar', { length: 255, nullable: false, unique: true })
    epc: string;  // RFID EPC

    @Column('int', { nullable: false })
    rssi: number;  // RSSI value (signal strength)

    @Column('int', { nullable: false })
    pc: number;

    @Column('int', { nullable: false })
    pl: number;

    @ManyToMany(() => Product, product => product.tags)
    products: Product[];

    @ManyToOne(() => User, user => user.tags)  // Relation with users table
    @JoinColumn({ name: 'userId' })
    createdBy: User;

    @CreateDateColumn()
    createdAt?: Date;

    @UpdateDateColumn()
    updatedAt?: Date;
}
