import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn, Index } from 'typeorm';
import { Task } from '../../tasks/entities/task.entity';
import { Exclude } from 'class-transformer';

@Entity('users')
@Index(['role'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  name: string;

  @Column()
  @Exclude({ toPlainOnly: true })
  password: string;


  @Column({ default: 'user' })
  role: string;

  @Column({ name: 'refresh_token', nullable: true })
  @Exclude({ toPlainOnly: true })
  refreshToken?: string;

  @OneToMany(() => Task, (task) => task.user)
  tasks: Task[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
} 