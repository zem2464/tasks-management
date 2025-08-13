import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
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

  async batchProcess(taskIds: string[], action: string): Promise<any[]> {
    // Optimized: fetch all tasks in one query, process in-memory, transactional
    return await this.tasksRepository.manager.transaction(async manager => {
      const repo = manager.getRepository(Task);
      const tasks = await repo.findByIds(taskIds);
      const results = [];
      for (const taskId of taskIds) {
        const task = tasks.find(t => t.id === taskId);
        if (!task) {
          results.push({ taskId, success: false, error: 'Task not found' });
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
          results.push({ taskId, success: true, result });
        } catch (error) {
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

  async update(id: string, updateTaskDto: UpdateTaskDto): Promise<Task> {
    // Transaction management for consistency
    return await this.tasksRepository.manager.transaction(async manager => {
      const repo = manager.getRepository(Task);
      const task = await repo.findOne({ where: { id } });
      if (!task) throw new NotFoundException(`Task with ID ${id} not found`);

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
      return updatedTask;
    });
  }

  async remove(id: string): Promise<void> {
    // Transaction management for consistency
    await this.tasksRepository.manager.transaction(async manager => {
      const repo = manager.getRepository(Task);
      const task = await repo.findOne({ where: { id } });
      if (!task) throw new NotFoundException(`Task with ID ${id} not found`);
      await repo.remove(task);
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
