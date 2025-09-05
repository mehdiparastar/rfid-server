import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class User {
    @PrimaryGeneratedColumn()
    id: number;

    @Column()
    @Index({ unique: true })
    email: string;

    @Column({ nullable: false })
    name: string;

    @Column({ nullable: false })
    password: string;

    @Column({ nullable: true })
    refreshToken: string;

    @Column('simple-array', { nullable: false })
    roles: string[];

    @CreateDateColumn()
    createdAt?: Date;

    @UpdateDateColumn()
    updatedAt?: Date;
}