import { ApiProperty } from '@nestjs/swagger';
import { IsArray, ArrayNotEmpty, IsEnum, IsUUID } from 'class-validator';
import { TaskStatus } from '../enums/task-status.enum';

export enum BatchAction {
  COMPLETE = 'complete',
  DELETE = 'delete',
}

export class BatchTaskDto {
  @ApiProperty({ type: [String], description: 'Array of task IDs' })
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  tasks: string[];

  @ApiProperty({ enum: BatchAction, description: 'Action to perform on tasks' })
  @IsEnum(BatchAction)
  action: BatchAction;
}
