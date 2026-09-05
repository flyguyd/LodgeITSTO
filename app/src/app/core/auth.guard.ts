import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { PortalAuthService } from './portal-auth.service';

export const signedInGuard: CanActivateFn = () => {
  const auth = inject(PortalAuthService);
  const router = inject(Router);
  if (auth.signedIn()) return true;
  auth.clear();
  return router.createUrlTree(['/login']);
};
