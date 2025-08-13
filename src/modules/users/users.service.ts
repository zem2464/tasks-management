import { Injectable, Logger, NotFoundException, Inject, forwardRef } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DistributedCacheService } from '../../common/services/distributed-cache.service';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    @Inject(forwardRef(() => DistributedCacheService))
    private readonly cache: DistributedCacheService,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<User> {
    this.logger.log(`Creating user: ${createUserDto.email}`);
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const user = this.usersRepository.create({
      ...createUserDto,
      password: hashedPassword,
    });
    const saved = await this.usersRepository.save(user);
    this.logger.log(`User created: ${saved.id}`);
    return saved;
  }

  findAll(): Promise<User[]> {
  // Eagerly load tasks to prevent N+1 queries
  return this.usersRepository.find({ relations: ['tasks'] });
  }

  async findOne(id: string): Promise<User> {
    const cacheKey = `user:${id}`;
    const cached = await this.cache.get<User>(cacheKey);
    if (cached) return cached;
    // Eagerly load tasks to prevent N+1 queries
    const user = await this.usersRepository.findOne({ where: { id }, relations: ['tasks'] });
    if (!user) {
      this.logger.warn(`User not found: ${id}`);
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    await this.cache.set(cacheKey, user, 300); // cache for 5 minutes
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    this.logger.log(`Updating user: ${id}`);
    const user = await this.findOne(id);
    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }
    this.usersRepository.merge(user, updateUserDto);
    const saved = await this.usersRepository.save(user);
    await this.cache.delete(`user:${id}`); // Invalidate cache
    this.logger.log(`User updated: ${id}`);
    return saved;
  }

  async remove(id: string): Promise<void> {
    this.logger.log(`Removing user: ${id}`);
    const user = await this.findOne(id);
    await this.usersRepository.remove(user);
    await this.cache.delete(`user:${id}`); // Invalidate cache
    this.logger.log(`User removed: ${id}`);
  }
}