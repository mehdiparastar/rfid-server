import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Index({ unique: true })
    @Column({ type: "varchar", length: 190 })
    email: string;
    
    @Column({ type: "varchar", length: 255 })
    passwordHash: string;

    @Column('simple-array', { nullable: false })
    roles: string[];

    @CreateDateColumn()
    createdAt?: Date;

    @UpdateDateColumn()
    updatedAt?: Date;
}