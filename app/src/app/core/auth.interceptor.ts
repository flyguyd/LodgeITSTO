import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { PortalAuthService } from './portal-auth.service';

/** Every call to the portal server carries the session token; a 401 sends the user to sign in. */
export const portalAuthInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(PortalAuthService);
  const router = inject(Router);
  const token = auth.token;
  const out = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(out).pipe(
    catchError((err) => {
      if (err?.status === 401 && !req.url.endsWith('/api/auth/login')) {
        auth.clear();
        void router.navigate(['/login']);
      }
      return throwError(() => err);
    }),
  );
};
