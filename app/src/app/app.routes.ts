import { Routes } from '@angular/router';
import { signedInGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./pages/login.component').then((m) => m.LoginComponent) },
  // Where an invitation or a password-reset link lands (Dave, 2026-09-07).
  // No guard: nobody has a session yet — that is the whole point of the key.
  { path: 'set-password', loadComponent: () => import('./pages/set-password.component').then((m) => m.SetPasswordComponent) },
  { path: '', canActivate: [signedInGuard], loadComponent: () => import('./pages/home.component').then((m) => m.HomeComponent) },
  { path: 'new', canActivate: [signedInGuard], loadComponent: () => import('./pages/new-booking.component').then((m) => m.NewBookingComponent) },
  // Guest suites: a card each, a light box with the detail and two months of
  // availability at this operator's own rates (Dave, 2026-09-07).
  { path: 'suites', canActivate: [signedInGuard], loadComponent: () => import('./pages/suites.component').then((m) => m.SuitesComponent) },
  { path: 'holds', canActivate: [signedInGuard], loadComponent: () => import('./pages/holds.component').then((m) => m.HoldsComponent) },
  { path: 'bookings', canActivate: [signedInGuard], loadComponent: () => import('./pages/bookings.component').then((m) => m.BookingsComponent) },
  { path: 'account', canActivate: [signedInGuard], loadComponent: () => import('./pages/account.component').then((m) => m.AccountComponent) },
  // The built-in user guide (Dave, 2026-09-06: "write a full set of user documentation for the STO site and include it in the build with a link on the command bar").
  { path: 'help', canActivate: [signedInGuard], loadComponent: () => import('./pages/help.component').then((m) => m.HelpComponent) },
  { path: '**', redirectTo: '' },
];
