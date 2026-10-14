import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Req,
} from '@nestjs/common';
import { RequirePermission, requestAccess } from '../access/access.http.js';
import { BranchService } from './branch.service.js';
import type { BranchView } from './branch.service.js';

@Controller('organizations/:organizationId/branches')
@RequirePermission('branches.manage')
export class BranchController {
  constructor(
    @Inject(BranchService) private readonly branches: BranchService,
  ) {}

  @Get(':branchId')
  find(
    @Req() request: object,
    @Param('organizationId') organizationId: string,
    @Param('branchId') branchId: string,
  ): Promise<BranchView> {
    return this.branches.find(
      requestAccess(request).principal,
      organizationId,
      branchId,
    );
  }

  @Patch(':branchId')
  rename(
    @Req() request: object,
    @Param('organizationId') organizationId: string,
    @Param('branchId') branchId: string,
    @Body() body: unknown,
  ): Promise<BranchView> {
    const { principal, requestId } = requestAccess(request);
    return this.branches.rename(
      principal,
      organizationId,
      branchId,
      body,
      requestId,
    );
  }
}
