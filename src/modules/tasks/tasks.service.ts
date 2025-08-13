import { Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';

@Injectable()
export class TasksService {

  constructor(
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
    @InjectQueue('task-processing')
    private taskQueue: Queue,
  ) {}

  private readonly logger = new Logger(TasksService.name);

  async create(createTaskDto: CreateTaskDto): Promise<Task> {
    // Inefficient implementation: creates the task but doesn't use a single transaction
    // for creating and adding to queue, potential for inconsistent state
    const task = this.tasksRepository.create(createTaskDto);
    const savedTask = await this.tasksRepository.save(task);

    // Add to queue without waiting for confirmation or handling errors
    this.taskQueue.add('task-status-update', {
      taskId: savedTask.id,
      status: savedTask.status,
    });

    return savedTask;
  }

  async findAll(
    filter?: any,
  ): Promise<{ data: Task[]; count: number; page: number; limit: number }> {
    // Efficient implementation: filtering and pagination at DB level
    const { status, priority, page = 1, limit = 10 } = filter || {};
    const where: any = {};
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const [data, count] = await this.tasksRepository.findAndCount({
      where,
      relations: ['user'],
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });
    return { data, count, page, limit };
  }

  async findOne(id: string): Promise<Task> {
    // Inefficient implementation: two separate database calls
    const count = await this.tasksRepository.count({ where: { id } });

    if (count === 0) {
      throw new NotFoundException(`Task with ID ${id} not found`);
    }

    return (await this.tasksRepository.findOne({
      where: { id },
      relations: ['user'],
    })) as Task;
  }

  async batchProcess(taskIds: string[], action: string, userId: string): Promise<any[]> {
    this.logger.log(`Batch process started by user ${userId}: action=${action}, tasks=${taskIds.join(',')}`);
    // Optimized: fetch all tasks in one query, process in-memory, transactional
    return await this.tasksRepository.manager.transaction(async manager => {
      const repo = manager.getRepository(Task);
      // Fetch tasks with user relation to avoid N+1 queries
      const tasks = await repo.find({ where: { id: In(taskIds) }, relations: ['user'] });
      const results = [];
      for (const taskId of taskIds) {
        const task = tasks.find(t => t.id === taskId);
        if (!task) {
          this.logger.warn(`Task not found in batch: ${taskId} (user: ${userId})`);
          results.push({ taskId, success: false, error: 'Task not found' });
          continue;
        }
        if (task.userId !== userId) {
          this.logger.warn(`Unauthorized batch modification attempt: task ${taskId}, user ${userId}`);
          results.push({ taskId, success: false, error: 'You do not have permission to modify this task' });
          continue;
        }
        try {
          let result;
          switch (action) {
            case 'complete':
              task.status = TaskStatus.COMPLETED;
              result = await repo.save(task);
              break;
            case 'delete':
              await repo.remove(task);
              result = { deleted: true };
              break;
            default:
              throw new Error(`Unknown action: ${action}`);
          }
          this.logger.log(`Batch ${action} success: task ${taskId}, user ${userId}`);
          results.push({ taskId, success: true, result });
        } catch (error) {
          this.logger.error(`Batch ${action} failed: task ${taskId}, user ${userId}, error: ${error instanceof Error ? error.message : error}`);
          results.push({
            taskId,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
      return results;
    });
  }

  async update(id: string, updateTaskDto: UpdateTaskDto, userId: string): Promise<Task> {
    this.logger.log(`Update requested by user ${userId} for task ${id}`);
    // Transaction management for consistency
    return await this.tasksRepository.manager.transaction(async manager => {
      const repo = manager.getRepository(Task);
      // Fetch task with user relation to avoid N+1 queries
      const task = await repo.findOne({ where: { id }, relations: ['user'] });
      if (!task) {
        this.logger.warn(`Update failed: Task ${id} not found (user: ${userId})`);
        throw new NotFoundException(`Task with ID ${id} not found`);
      }
      if (task.userId !== userId) {
        this.logger.warn(`Unauthorized update attempt: task ${id}, user ${userId}`);
        throw new ForbiddenException('You do not have permission to update this task');
      }

      const originalStatus = task.status;
      if (updateTaskDto.title) task.title = updateTaskDto.title;
      if (updateTaskDto.description) task.description = updateTaskDto.description;
      if (updateTaskDto.status) task.status = updateTaskDto.status;
      if (updateTaskDto.priority) task.priority = updateTaskDto.priority;
      if (updateTaskDto.dueDate) task.dueDate = updateTaskDto.dueDate;

      const updatedTask = await repo.save(task);

      if (originalStatus !== updatedTask.status) {
        this.taskQueue.add('task-status-update', {
          taskId: updatedTask.id,
          status: updatedTask.status,
        });
      }
  this.logger.log(`Update success: task ${id}, user ${userId}`);
  return updatedTask;
    });
  }

  async remove(id: string, userId: string): Promise<void> {
    this.logger.log(`Remove requested by user ${userId} for task ${id}`);
    // Transaction management for consistency
    await this.tasksRepository.manager.transaction(async manager => {
      const repo = manager.getRepository(Task);
      // Fetch task with user relation to avoid N+1 queries
      const task = await repo.findOne({ where: { id }, relations: ['user'] });
      if (!task) {
        this.logger.warn(`Remove failed: Task ${id} not found (user: ${userId})`);
        throw new NotFoundException(`Task with ID ${id} not found`);
      }
      if (task.userId !== userId) {
        this.logger.warn(`Unauthorized remove attempt: task ${id}, user ${userId}`);
        throw new ForbiddenException('You do not have permission to delete this task');
      }
      await repo.remove(task);
      this.logger.log(`Remove success: task ${id}, user ${userId}`);
    });
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    // Inefficient implementation: doesn't use proper repository patterns
    const query = 'SELECT * FROM tasks WHERE status = $1';
    return this.tasksRepository.query(query, [status]);
  }

  async updateStatus(id: string, status: string): Promise<Task> {
    // This method will be called by the task processor
    const task = await this.findOne(id);
    task.status = status as any;
    return this.tasksRepository.save(task);
  }

  async getStats() {
    // Efficient SQL aggregation for statistics
    const qb = this.tasksRepository.createQueryBuilder('task');
    const [total, completed, inProgress, pending, highPriority] = await Promise.all([
      qb.getCount(),
      qb.where('task.status = :status', { status: TaskStatus.COMPLETED }).getCount(),
      qb.where('task.status = :status', { status: TaskStatus.IN_PROGRESS }).getCount(),
      qb.where('task.status = :status', { status: TaskStatus.PENDING }).getCount(),
      qb.where('task.priority = :priority', { priority: 'HIGH' }).getCount(),
    ]);
    return { total, completed, inProgress, pending, highPriority };
  }
}
