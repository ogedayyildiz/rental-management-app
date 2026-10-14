import { assertAuthenticatedPrincipal } from './access.service.js';
import type { AuthenticatedPrincipal } from './access.service.js';
import { AccessError } from './contracts.js';
import type { TenantAccessRecord } from './contracts.js';

export interface CurrentUserView {
  id: string;
  name: string;
  email: string;
  organizations: { name: string; access: TenantAccessRecord | null }[];
  platformPermissions: readonly string[];
}
export interface CurrentUserRepository {
  find(userId: string): Promise<CurrentUserView | null>;
}
export class CurrentUserService {
  constructor(private readonly repository: CurrentUserRepository) {}
  async current(principal: AuthenticatedPrincipal): Promise<CurrentUserView> {
    assertAuthenticatedPrincipal(principal);
    const user = await this.repository.find(principal.userId);
    if (!user) throw new AccessError('UNAUTHENTICATED');
    return user;
  }
}
